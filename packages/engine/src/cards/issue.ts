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
  type CardArtDirection,
  type Database,
  type EntitlementSource,
} from '@lookline/db'
import { MAX_CANDIDATES_PER_SESSION, ownedRatioOf } from './rules'

export interface ArticleRef {
  articleId: string
  source: EntitlementSource
  /** Who wears it, on an edition session. Absent on a personal card: the session's persona does. */
  personaId?: string
}

export interface OpenSessionInput {
  id: string
  ownerUserId: string
  personaId: string
  /** Set for an edition; the collection is then read from the session rather than the request. */
  collectionId?: string
  /** The credit this session holds, by the key that reserved it. */
  reserveOperationKey: string
  articles: readonly ArticleRef[]
  artDirection: CardArtDirection
  expiresAt: Date
}

/** Opened only after a credit is reserved; the reservation key ties the two together. */
export async function openSession(db: Database, input: OpenSessionInput): Promise<void> {
  await db.insert(cardSessions).values({
    id: input.id,
    ownerUserId: input.ownerUserId,
    personaId: input.personaId,
    collectionId: input.collectionId ?? null,
    reserveOperationKey: input.reserveOperationKey,
    maxCandidates: MAX_CANDIDATES_PER_SESSION,
    articleSnapshot: input.articles.map((a) => ({
      articleId: a.articleId,
      source: a.source,
      ...(a.personaId ? { personaId: a.personaId } : {}),
    })),
    artDirection: input.artDirection,
    expiresAt: input.expiresAt,
    state: 'open',
  })
}

export async function startAttempt(
  db: Database,
  input: {
    id: string
    sessionId: string
    artDirection: CardArtDirection
    provider?: string | null
  },
): Promise<void> {
  await db.insert(generationAttempts).values({
    id: input.id,
    sessionId: input.sessionId,
    provider: input.provider ?? null,
    artDirection: input.artDirection,
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

  // Reading the places taken and inserting are two statements with no transaction around them,
  // so two generates racing pick the same position and `card_candidates_position_idx` refuses the
  // second. That is the index doing its job, not an error to raise: look again and take the next
  // place. The position comes from the highest one taken rather than from the count, so a retry
  // always moves forward; the cap is counted separately, and bounds the loop.
  let position = 0
  for (let attempt = 0; attempt <= session.max; attempt++) {
    const taken = await placesTaken(db, input.sessionId)
    if (taken.used >= session.max) return { ok: false, reason: 'full' }
    position = taken.highest + 1
    try {
      await db.insert(cardCandidates).values({
        id: input.id,
        sessionId: input.sessionId,
        attemptId: input.attemptId,
        imagePath: input.imagePath,
        position,
      })
      break
    } catch (error) {
      if (attempt === session.max) throw error
    }
  }

  await db
    .update(generationAttempts)
    .set({ state: 'succeeded', finishedAt: input.now })
    .where(eq(generationAttempts.id, input.attemptId))
  return { ok: true, position }
}

async function placesTaken(
  db: Database,
  sessionId: string,
): Promise<{ used: number; highest: number }> {
  const rows = await db
    .select({
      n: sql<number>`count(*)`,
      highest: sql<number>`coalesce(max(${cardCandidates.position}), 0)`,
    })
    .from(cardCandidates)
    .where(eq(cardCandidates.sessionId, sessionId))
  return { used: Number(rows[0]?.n ?? 0), highest: Number(rows[0]?.highest ?? 0) }
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
    // The same function the tier is read from, so a card's ratio and its tier can never
    // disagree about whether a piece picked twice counts twice.
    ownedRatio: ownedRatioOf(snapshot),
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

export type IssueResult =
  | { ok: true; editionSize: number }
  | { ok: false; reason: 'no-members' | 'session-closed' }

/**
 * Issue one artwork to a whole collection. Every participating persona gets its own numbered copy
 * — `editionSize` is the number of personas, not of accounts, so three personas belonging to one
 * account still receive three copies.
 */
export async function issueEdition(db: Database, input: IssueEditionInput): Promise<IssueResult> {
  if (input.copies.length === 0) return { ok: false, reason: 'no-members' }
  // Same guard as `settleCard`: a settled session answers with a reason rather than throwing on
  // `collection_editions_session_idx` when a stale form is posted twice.
  const [session] = await db
    .select({ state: cardSessions.state })
    .from(cardSessions)
    .where(eq(cardSessions.id, input.sessionId))
    .limit(1)
  if (!session || session.state !== 'open') return { ok: false, reason: 'session-closed' }
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
