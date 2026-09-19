/**
 * Personas and their transfer (#33, #35).
 *
 * A persona is a card's subject, not a login: one account can manage several, and a persona can
 * be handed to the family member it portrays once they register.
 *
 * Nothing a persona holds records an owner. Cards name their persona, collection copies name
 * their beneficiary persona, and the persona names the account. Handing one over is therefore a
 * single `UPDATE personas` — on a runtime with no transactions that matters, because there is no
 * second row a failure could leave behind. Three cards and two collection copies move or none do.
 *
 * What a card says about its own making — author, articles, tier, number — is not touched.
 */
import {
  and,
  cardCopies,
  cards,
  eq,
  personaTransfers,
  personas,
  sql,
  type Database,
  type Persona,
} from '@lookline/db'

export interface CreatePersonaInput {
  id: string
  ownerUserId: string
  displayName: string
  kind?: 'person' | 'avatar'
  referencePath?: string | null
  avatarSeed?: number
}

export async function createPersona(db: Database, input: CreatePersonaInput): Promise<void> {
  await db.insert(personas).values({
    id: input.id,
    ownerUserId: input.ownerUserId,
    displayName: input.displayName,
    kind: input.kind ?? 'person',
    referencePath: input.referencePath ?? null,
    avatarSeed: input.avatarSeed ?? 0,
  })
}

export async function personasOf(db: Database, ownerUserId: string): Promise<Persona[]> {
  return db.select().from(personas).where(eq(personas.ownerUserId, ownerUserId))
}

export interface TransferOffer {
  id: string
  personaId: string
  fromUserId: string
  toUserId: string
  personaVersion: number
  expiresAt: Date
}

/**
 * What a transfer will move, so the offer can say it before it is accepted. Cards and copies are
 * counted through the persona, which is exactly how they will travel.
 */
export async function transferPreview(
  db: Database,
  personaId: string,
): Promise<{ cards: number; copies: number }> {
  const [cardRows, copyRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(cards)
      .where(eq(cards.personaId, personaId)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(cardCopies)
      .where(eq(cardCopies.beneficiaryPersonaId, personaId)),
  ])
  return { cards: Number(cardRows[0]?.n ?? 0), copies: Number(copyRows[0]?.n ?? 0) }
}

/** Offer a persona to a registered account. One live offer per persona (enforced by the index). */
export async function offerTransfer(db: Database, offer: TransferOffer): Promise<void> {
  await db.insert(personaTransfers).values({
    id: offer.id,
    personaId: offer.personaId,
    fromUserId: offer.fromUserId,
    toUserId: offer.toUserId,
    personaVersion: offer.personaVersion,
    expiresAt: offer.expiresAt,
    state: 'pending',
  })
}

export type AcceptResult =
  | { ok: true }
  | { ok: false; reason: 'not-pending' | 'expired' | 'wrong-recipient' | 'stale' }

/**
 * Accept an offer: the persona changes hands and everything hanging off it follows.
 *
 * The `UPDATE` carries the version the offer was written against. If the persona moved or was
 * edited in between, it matches no row and the answer is `stale` — which is also what makes a
 * duplicate acceptance harmless, since the first one bumped the version.
 *
 * Moving the persona and closing the offer are two statements with no transaction around them,
 * so a failure between them would leave the persona handed over and the offer still `pending`,
 * and the partial unique index would then refuse every later offer for that persona. Calling
 * again repairs it: the version no longer matches so nothing moves, but the persona reads back
 * as the recipient's, and this run closes the offer the first one left open.
 */
export async function acceptTransfer(
  db: Database,
  input: { transferId: string; acceptingUserId: string; now: Date },
): Promise<AcceptResult> {
  const [offer] = await db
    .select()
    .from(personaTransfers)
    .where(eq(personaTransfers.id, input.transferId))
    .limit(1)
  if (!offer || offer.state !== 'pending') return { ok: false, reason: 'not-pending' }
  if (offer.toUserId !== input.acceptingUserId) return { ok: false, reason: 'wrong-recipient' }
  if (offer.expiresAt.getTime() <= input.now.getTime()) return { ok: false, reason: 'expired' }

  await db
    .update(personas)
    .set({ ownerUserId: offer.toUserId, version: sql`${personas.version} + 1` })
    .where(and(eq(personas.id, offer.personaId), eq(personas.version, offer.personaVersion)))
  // Read the persona back instead of trusting a row count: libsql reports `rowsAffected` and D1
  // does not, so believing it would call a completed transfer stale on one of the two runtimes.
  // Reading the owner rather than the row count is also what lets a half-finished acceptance be
  // finished by a retry instead of being called stale.
  const [after] = await db.select().from(personas).where(eq(personas.id, offer.personaId)).limit(1)
  if (!after || after.ownerUserId !== offer.toUserId) return { ok: false, reason: 'stale' }

  await db
    .update(personaTransfers)
    .set({ state: 'accepted', settledAt: input.now })
    .where(eq(personaTransfers.id, offer.id))
  return { ok: true }
}

export async function cancelTransfer(
  db: Database,
  input: { transferId: string; now: Date },
): Promise<void> {
  await db
    .update(personaTransfers)
    .set({ state: 'cancelled', settledAt: input.now })
    .where(and(eq(personaTransfers.id, input.transferId), eq(personaTransfers.state, 'pending')))
}

/**
 * Who holds a card. Derived through the persona rather than stored, which is why a transfer never
 * has to rewrite the cards themselves.
 */
export async function cardHolder(db: Database, cardId: string): Promise<string | null> {
  const rows = await db
    .select({ ownerUserId: personas.ownerUserId })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(eq(cards.id, cardId))
    .limit(1)
  return rows[0]?.ownerUserId ?? null
}

/** Every card and collection copy an account holds right now, through the personas it manages. */
export async function holdingsOf(
  db: Database,
  userId: string,
): Promise<{ cardIds: string[]; copyIds: string[] }> {
  const [cardRows, copyRows] = await Promise.all([
    db
      .select({ id: cards.id })
      .from(cards)
      .innerJoin(personas, eq(personas.id, cards.personaId))
      .where(eq(personas.ownerUserId, userId)),
    db
      .select({ id: cardCopies.id })
      .from(cardCopies)
      .innerJoin(personas, eq(personas.id, cardCopies.beneficiaryPersonaId))
      .where(eq(personas.ownerUserId, userId)),
  ])
  return { cardIds: cardRows.map((r) => r.id), copyIds: copyRows.map((r) => r.id) }
}
