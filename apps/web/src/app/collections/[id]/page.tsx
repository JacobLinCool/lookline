import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  and,
  cards,
  collectionEditions,
  collectionInvites,
  collectionMembers,
  collections,
  desc,
  eq,
  inArray,
  personas,
  users,
} from '@lookline/db'
import { creditBalance } from '@lookline/engine'
import { Avatar, Button, Card, Container, Notice, PageHeader, Tag } from '@/components/ui'
import { InviteMember, type InvitablePersona } from '@/components/cards/collection-invites'
import { loadNetworkPeople } from '@/components/social/data'
import { startEditionAction } from '@/server/actions/collections'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: '收藏', robots: { index: false } }
}

const ERRORS: Record<string, string> = {
  min: '一個收藏至少要 2 位 persona 才能發行。',
  participant: '只有參與這個收藏的人可以發行。',
  credits: '額度不足。每件滿 NT$320 的購買會給 3 次。',
  session: '發行沒能開始，額度已退回。',
  transfer: '有參與者的 persona 正在轉讓中，等轉讓完成或收回再發行。',
}

/** A collection and the editions issued from it. Issuing again makes a new edition, not a redraw. */
export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const { id } = await params
  const query = await searchParams

  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1)
  if (!collection) notFound()

  const members = await db
    .select({
      personaId: collectionMembers.personaId,
      cardId: collectionMembers.cardId,
      personaName: personas.displayName,
      avatarSeed: personas.avatarSeed,
      owner: personas.ownerUserId,
      tier: cards.tier,
    })
    .from(collectionMembers)
    .innerJoin(personas, eq(personas.id, collectionMembers.personaId))
    .innerJoin(cards, eq(cards.id, collectionMembers.cardId))
    .where(eq(collectionMembers.collectionId, id))

  const editions = await db
    .select({
      id: collectionEditions.id,
      editionSize: collectionEditions.editionSize,
      issuedAt: collectionEditions.issuedAt,
    })
    .from(collectionEditions)
    .where(eq(collectionEditions.collectionId, id))
    .orderBy(desc(collectionEditions.issuedAt))

  const isParticipant = members.some((m) => m.owner === user.id)
  const credits = await creditBalance(db, user.id)
  const isOwner = collection.ownerUserId === user.id

  // Only the personas of people this account is actually connected to, and only those with a card
  // to bring — inviting a stranger's persona, or one that has nothing to contribute, goes nowhere.
  const pending = await db
    .select({
      personaId: collectionInvites.personaId,
      personaName: personas.displayName,
      ownerName: users.displayName,
    })
    .from(collectionInvites)
    .innerJoin(personas, eq(personas.id, collectionInvites.personaId))
    .innerJoin(users, eq(users.id, personas.ownerUserId))
    .where(
      and(eq(collectionInvites.collectionId, id), eq(collectionInvites.state, 'pending')),
    )

  let invitable: InvitablePersona[] = []
  if (isOwner) {
    const friends = (await loadNetworkPeople(user.id)).people
    if (friends.length > 0) {
      const taken = new Set([
        ...members.map((m) => m.personaId),
        ...pending.map((p) => p.personaId),
      ])
      const rows = await db
        .selectDistinct({
          personaId: personas.id,
          personaName: personas.displayName,
          ownerName: users.displayName,
        })
        .from(personas)
        .innerJoin(users, eq(users.id, personas.ownerUserId))
        .innerJoin(cards, eq(cards.personaId, personas.id))
        .where(
          inArray(
            personas.ownerUserId,
            friends.map((f) => f.id),
          ),
        )
      invitable = rows.filter((r) => !taken.has(r.personaId))
    }
  }

  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader
        title={collection.title}
        description={`${members.length} 位 persona · 發行後每位各得 1 份編號`}
        actions={<span className="text-[13px] text-muted">你的額度 {credits}</span>}
      />
      {query.error ? <Notice tone="warning">{ERRORS[query.error] ?? '請再試一次。'}</Notice> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-medium">參與者</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {members.map((m) => (
            <li key={m.personaId} className="flex flex-col gap-2">
              <img
                src={`/api/cards/${m.cardId}`}
                alt={m.personaName}
                width={600}
                height={840}
                className="w-full rounded-md border border-line"
              />
              <span className="flex items-center gap-1.5">
                <Avatar seed={m.avatarSeed} name={m.personaName} size="xs" />
                <span className="truncate text-[12px]">{m.personaName}</span>
                {m.owner !== user.id ? <Tag>朋友</Tag> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isOwner ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium">邀請朋友</h2>
          {pending.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {pending.map((p) => (
                <Tag key={p.personaId}>
                  {p.personaName} · {p.ownerName} · 等待回覆
                </Tag>
              ))}
            </ul>
          ) : null}
          {invitable.length > 0 ? (
            <InviteMember collectionId={id} personas={invitable} />
          ) : (
            <p className="text-[12px] text-muted">
              目前沒有可以邀請的 persona —— 對方要先做出一張個人卡。
            </p>
          )}
        </section>
      ) : null}

      {isParticipant ? (
        <form action={startEditionAction} className="flex items-center gap-3">
          <input type="hidden" name="collectionId" value={id} />
          <Button type="submit" disabled={members.length < 2 || credits < 1}>
            用 1 次額度發行
          </Button>
          <p className="text-[12px] text-muted">
            只扣你 1 次額度，其他參與者不需要有額度。發行會固定目前的參與者與順序。
          </p>
        </form>
      ) : (
        <Notice tone="info">只有參與這個收藏的人可以發行。</Notice>
      )}

      {editions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium">已發行</h2>
          <ul className="flex flex-col gap-2">
            {editions.map((e) => (
              <Card as="li" key={e.id} surface="panel" padding="sm">
                <a href={`/editions/${e.id}`} className="flex items-center justify-between gap-3">
                  <span className="text-[14px]">限量 {e.editionSize} 份</span>
                  <Tag>查看</Tag>
                </a>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  )
}
