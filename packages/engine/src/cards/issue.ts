/**
 * Making a card, and issuing a collection edition (#33, #36, #37).
 *
 * A session is one reserved credit being spent. It may produce up to four candidates and settles
 * into exactly one card — "generate once" and "make a card" are different counts, and the session
 * keeps them apart. The persona and the articles are fixed when the session opens, so a finished
 * card cannot claim clothes or a subject it was not made from.
 *
 * A collection edition is one artwork issued in as many numbered copies as there are participating
 * personas: three personas in a collection means 1/3, 2/3 and 3/3, one for each, however many
 * accounts those personas belong to.
 */
import {
  cardCandidates,
  cardCopies,
  cardSessions,
  cards,
  collectionEditions,
  collectionMembers,
  eq,
  generationAttempts,
  insertAll,
  sql,
  type CardCandidate,
  type Database,
  type EntitlementSource,
} from '@lookline/db'
import { MAX_CANDIDATES_PER_SESSION } from './rules'
import { ownedRatio } from './wardrobe'

export interface ArticleRef {
  articleId: string
  source: EntitlementSource
}

export interface OpenSessionInput {
  id: string
  ownerUserId: string
  personaId: string
  /** The credit this session holds, by the key that reserved it. */
  reserveOperationKey: string
  articles: readonly ArticleRef[]
  expiresAt: Date
}

/** Opened only after a credit is reserved; the reservation key ties the two together. */
export async function openSession(db: Database, input: OpenSessionInput): Promise<void> {
  await db.insert(cardSessions).values({
    id: input.id,
    ownerUserId: input.ownerUserId,
    personaId: input.personaId,
    reserveOperationKey: input.reserveOperationKey,
    maxCandidates: MAX_CANDIDATES_PER_SESSION,
    articleSnapshot: input.articles.map((a) => ({ articleId: a.articleId, source: a.source })),
    expiresAt: input.expiresAt,
    state: 'open',
  })
}

export async function startAttempt(
  db: Database,
  input: { id: string; sessionId: string; provider?: string | null },
): Promise<void> {
  await db.insert(generationAttempts).values({
    id: input.id,
    sessionId: input.sessionId,
    provider: input.provider ?? null,
    state: 'pending',
  })
}

export async function failAttempt(
  db: Database,
  input: { id: string; error: string; now: Date },
): Promise<void> {
  await db
    .update(generationAttempts)
    .set({ state: 'failed', error: input.error, finishedAt: input.now })
    .where(eq(generationAttempts.id, input.id))
}

export type CandidateResult =
  | { ok: true; position: number }
  | { ok: false; reason: 'session-closed' | 'full' }

/**
 * Record a picture the session may still choose from. Refuses past four, so cancelling and
 * reopening cannot be used to wash out an unlimited number of candidates.
 */
export async function addCandidate(
  db: Database,
  input: { id: string; sessionId: string; attemptId: string; imagePath: string; now: Date },
): Promise<CandidateResult> {
  const [session] = await db
    .select({ state: cardSessions.state, max: cardSessions.maxCandidates })
    .from(cardSessions)
    .where(eq(cardSessions.id, input.sessionId))
    .limit(1)
  if (!session || session.state !== 'open') return { ok: false, reason: 'session-closed' }
  const existing = await db
    .select({ n: sql<number>`count(*)` })
    .from(cardCandidates)
    .where(eq(cardCandidates.sessionId, input.sessionId))
  const used = Number(existing[0]?.n ?? 0)
  if (used >= session.max) return { ok: false, reason: 'full' }
  const position = used + 1
  await db.insert(cardCandidates).values({
    id: input.id,
    sessionId: input.sessionId,
    attemptId: input.attemptId,
    imagePath: input.imagePath,
    position,
  })
  await db
    .update(generationAttempts)
    .set({ state: 'succeeded', finishedAt: input.now })
    .where(eq(generationAttempts.id, input.attemptId))
  return { ok: true, position }
}

export async function candidatesOf(db: Database, sessionId: string): Promise<CardCandidate[]> {
  return db
    .select()
    .from(cardCandidates)
    .where(eq(cardCandidates.sessionId, sessionId))
    .orderBy(cardCandidates.position)
}

export interface SettleCardInput {
  cardId: string
  sessionId: string
  candidateId: string
  verificationCode: string
  tier: string
  now: Date
}

export type SettleResult = { ok: true } | { ok: false; reason: 'session-closed' | 'no-candidate' }

/**
 * Turn the chosen candidate into an issued card. Any of the four may be the one. The card copies
 * the session's persona, author and article snapshot, and those never change again — a later
 * transfer moves who holds it, not what it says about its making.
 */
export async function settleCard(db: Database, input: SettleCardInput): Promise<SettleResult> {
  const [session] = await db
    .select()
    .from(cardSessions)
    .where(eq(cardSessions.id, input.sessionId))
    .limit(1)
  if (!session || session.state !== 'open') return { ok: false, reason: 'session-closed' }
  const [candidate] = await db
    .select()
    .from(cardCandidates)
    .where(eq(cardCandidates.id, input.candidateId))
    .limit(1)
  if (!candidate || candidate.sessionId !== input.sessionId) {
    return { ok: false, reason: 'no-candidate' }
  }
  const snapshot = session.articleSnapshot ?? []
  await db.insert(cards).values({
    id: input.cardId,
    sessionId: input.sessionId,
    candidateId: input.candidateId,
    personaId: session.personaId,
    authorUserId: session.ownerUserId,
    imagePath: candidate.imagePath,
    verificationCode: input.verificationCode,
    tier: input.tier,
    ownedRatio: ownedRatio(snapshot),
    articleSnapshot: snapshot,
  })
  await db
    .update(cardSessions)
    .set({ state: 'settled', settledAt: input.now })
    .where(eq(cardSessions.id, input.sessionId))
  return { ok: true }
}

export interface IssueEditionInput {
  editionId: string
  collectionId: string
  sessionId: string
  imagePath: string
  /** One per participating persona, in the order the numbers should run. */
  copies: ReadonlyArray<{ id: string; personaId: string; verificationCode: string }>
  now: Date
}

export type IssueResult = { ok: true; editionSize: number } | { ok: false; reason: 'no-members' }

/**
 * Issue one artwork to a whole collection. Every participating persona gets its own numbered copy
 * — `editionSize` is the number of personas, not of accounts, so three personas belonging to one
 * account still receive three copies.
 */
export async function issueEdition(db: Database, input: IssueEditionInput): Promise<IssueResult> {
  if (input.copies.length === 0) return { ok: false, reason: 'no-members' }
  const editionSize = input.copies.length
  await db.insert(collectionEditions).values({
    id: input.editionId,
    collectionId: input.collectionId,
    sessionId: input.sessionId,
    imagePath: input.imagePath,
    editionSize,
  })
  await insertAll(
    db,
    cardCopies,
    input.copies.map((c, i) => ({
      id: c.id,
      editionId: input.editionId,
      beneficiaryPersonaId: c.personaId,
      editionNumber: i + 1,
      verificationCode: c.verificationCode,
    })),
  )
  await db
    .update(cardSessions)
    .set({ state: 'settled', settledAt: input.now })
    .where(eq(cardSessions.id, input.sessionId))
  return { ok: true, editionSize }
}

export async function addCollectionMember(
  db: Database,
  input: { collectionId: string; personaId: string; cardId: string },
): Promise<void> {
  await db.insert(collectionMembers).values(input)
}

export async function membersOf(
  db: Database,
  collectionId: string,
): Promise<Array<{ personaId: string; cardId: string }>> {
  return db
    .select({ personaId: collectionMembers.personaId, cardId: collectionMembers.cardId })
    .from(collectionMembers)
    .where(eq(collectionMembers.collectionId, collectionId))
}
