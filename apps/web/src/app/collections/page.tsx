import type { Metadata } from 'next'
import { Users } from 'lucide-react'
import {
  and,
  cards,
  collectionInvites,
  collectionMembers,
  collections,
  eq,
  personas,
  users,
} from '@lookline/db'
import { Button, Container, EmptyState, Notice, PageHeader } from '@/components/ui'
import { CollectionBuilder, type BuilderCard } from '@/components/cards/collection-builder'
import { CollectionList, type CollectionRow } from '@/components/cards/collection-list'
import { InviteInbox, type PendingInvite } from '@/components/cards/collection-invites'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: '收藏組合 · Lookline' }
}

const ERRORS: Record<string, string> = {
  min: '至少要放入一張你自己的卡。',
  max: '一個收藏最多 6 位 persona。',
  unauthorised: '只能放入你管理的 persona 的卡片。',
}

/**
 * Collections group finished personal cards so they can be issued together as one artwork. The
 * grouping itself costs nothing; only issuing an edition from it spends a credit.
 */
export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const params = await searchParams

  // Cards whose persona this account manages — one per persona, since a persona brings one card.
  const owned = await db
    .select({
      cardId: cards.id,
      personaId: cards.personaId,
      personaName: personas.displayName,
      avatarSeed: personas.avatarSeed,
      tier: cards.tier,
      code: cards.verificationCode,
    })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(eq(personas.ownerUserId, user.id))

  const pickable: BuilderCard[] = owned.map((c) => ({
    cardId: c.cardId,
    personaId: c.personaId,
    personaName: c.personaName,
    avatarSeed: c.avatarSeed,
    tier: c.tier,
    code: c.code,
  }))

  // Collections this account takes part in, not only the ones it created: any participant may
  // start an edition, so a joined collection has to be reachable from here.
  const joined = await db
    .selectDistinct({ id: collections.id, title: collections.title })
    .from(collections)
    .innerJoin(collectionMembers, eq(collectionMembers.collectionId, collections.id))
    .innerJoin(personas, eq(personas.id, collectionMembers.personaId))
    .where(eq(personas.ownerUserId, user.id))
  const ownRows = await db
    .select({ id: collections.id, title: collections.title })
    .from(collections)
    .where(eq(collections.ownerUserId, user.id))
  const mine = [...new Map([...ownRows, ...joined].map((c) => [c.id, c])).values()]

  // Invites addressed to personas this account manages. The cards on offer are that persona's
  // own, so answering can only ever contribute a card the invitee already holds.
  const inviteRows = await db
    .select({
      collectionId: collectionInvites.collectionId,
      collectionTitle: collections.title,
      personaId: collectionInvites.personaId,
      personaName: personas.displayName,
      avatarSeed: personas.avatarSeed,
      invitedBy: users.displayName,
    })
    .from(collectionInvites)
    .innerJoin(collections, eq(collections.id, collectionInvites.collectionId))
    .innerJoin(personas, eq(personas.id, collectionInvites.personaId))
    .innerJoin(users, eq(users.id, collectionInvites.invitedByUserId))
    .where(and(eq(personas.ownerUserId, user.id), eq(collectionInvites.state, 'pending')))

  const invites: PendingInvite[] = inviteRows.map((r) => ({
    ...r,
    cards: owned
      .filter((c) => c.personaId === r.personaId)
      .map((c) => ({ cardId: c.cardId, code: c.code })),
  }))

  const rows: CollectionRow[] = await Promise.all(
    mine.map(async (c) => {
      const members = await db
        .select({ personaName: personas.displayName })
        .from(collectionMembers)
        .innerJoin(personas, eq(personas.id, collectionMembers.personaId))
        .where(eq(collectionMembers.collectionId, c.id))
      return { id: c.id, title: c.title, members: members.map((m) => m.personaName) }
    }),
  )

  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader
        title="收藏組合"
        description="把幾張已發行的個人卡組成一次回憶，再用 1 次額度做成一張多人小卡 —— 每位參與的 persona 各得 1 份編號。"
      />
      {params.error ? (
        <Notice tone="warning">{ERRORS[params.error] ?? '請再試一次。'}</Notice>
      ) : null}

      {pickable.length < 1 ? (
        <EmptyState
          icon={<Users />}
          title="還沒有可以放進來的卡"
          description="先到工作室做一張個人卡，再把它和朋友的組成收藏。"
          action={<Button href="/studio">去製卡</Button>}
        />
      ) : (
        <CollectionBuilder cards={pickable} />
      )}

      <InviteInbox invites={invites} />

      {rows.length > 0 ? <CollectionList rows={rows} /> : null}
    </Container>
  )
}
