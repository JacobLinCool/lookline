import type { Metadata } from 'next'
import { and, eq, personaTransfers, personas, users } from '@lookline/db'
import { creditBalance, transferPreview } from '@lookline/engine'
import { Card, Container, EmptyState, PageHeader } from '@/components/ui'
import { PersonaList, type PersonaRow, type OfferRow } from '@/components/cards/persona-list'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Personas', robots: { index: false } }
}

/**
 * A persona is who a card is of — yourself, your mother, an avatar. One account manages several,
 * and a persona can be handed to the person it portrays once they have an account of their own.
 */
export default async function PersonasPage() {
  const user = await requireUser('/me/personas')
  const { db } = getDb()

  const mine = await db.select().from(personas).where(eq(personas.ownerUserId, user.id))
  const rows: PersonaRow[] = await Promise.all(
    mine.map(async (p) => ({
      id: p.id,
      displayName: p.displayName,
      kind: p.kind,
      avatarSeed: p.avatarSeed,
      ...(await transferPreview(db, p.id)),
    })),
  )

  // Offers waiting for this account to accept, and ones it has sent.
  const [incoming, outgoing] = await Promise.all([
    db
      .select({
        id: personaTransfers.id,
        personaId: personaTransfers.personaId,
        expiresAt: personaTransfers.expiresAt,
        displayName: personas.displayName,
        counterparty: users.displayName,
      })
      .from(personaTransfers)
      .innerJoin(personas, eq(personas.id, personaTransfers.personaId))
      .innerJoin(users, eq(users.id, personaTransfers.fromUserId))
      .where(and(eq(personaTransfers.toUserId, user.id), eq(personaTransfers.state, 'pending'))),
    db
      .select({
        id: personaTransfers.id,
        personaId: personaTransfers.personaId,
        expiresAt: personaTransfers.expiresAt,
        displayName: personas.displayName,
        counterparty: users.displayName,
      })
      .from(personaTransfers)
      .innerJoin(personas, eq(personas.id, personaTransfers.personaId))
      .innerJoin(users, eq(users.id, personaTransfers.toUserId))
      .where(and(eq(personaTransfers.fromUserId, user.id), eq(personaTransfers.state, 'pending'))),
  ])

  const incomingRows: OfferRow[] = await Promise.all(
    incoming.map(async (o) => ({
      id: o.id,
      personaName: o.displayName,
      counterparty: o.counterparty,
      expiresAt: o.expiresAt.toISOString(),
      ...(await transferPreview(db, o.personaId)),
    })),
  )
  const outgoingRows: OfferRow[] = await Promise.all(
    outgoing.map(async (o) => ({
      id: o.id,
      personaName: o.displayName,
      counterparty: o.counterparty,
      expiresAt: o.expiresAt.toISOString(),
      ...(await transferPreview(db, o.personaId)),
    })),
  )

  const credits = await creditBalance(db, user.id)

  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader
        title="Personas"
        description="每張小卡都有一位主角。你可以替自己、家人或一個虛擬形象各建一位；他們註冊後，你可以把 persona 連同卡片一起交給本人。"
      />

      <Card surface="panel" padding="sm">
        <p className="text-[13px] text-muted">
          製卡額度 <span className="tabular text-[15px] font-semibold text-ink">{credits}</span>
          <span className="ml-2">
            每件滿 NT$320 的購買給 3 次，一次最多做 4 張候選、選 1 張定稿。
          </span>
        </p>
      </Card>

      {rows.length === 0 && incomingRows.length === 0 ? (
        <EmptyState title="還沒有 persona" description="建立第一位主角，就可以開始製卡。" />
      ) : null}

      <PersonaList personas={rows} incoming={incomingRows} outgoing={outgoingRows} />
    </Container>
  )
}
