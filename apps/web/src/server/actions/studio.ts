'use server'

import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  and,
  articles,
  cardSessions,
  cards,
  collections,
  eq,
  inArray,
  lt,
  personas,
} from '@lookline/db'
import {
  MAX_CANDIDATES_PER_SESSION,
  MAX_PIECES_PER_CARD,
  availableArticles,
  candidatesOf,
  creditBalance,
  ownedRatioOf,
  releaseCredit,
  reserveCredit,
  openSession,
  parseCardArtDirection,
  resolveCardArtDirection,
  settleCard,
  settleCredit,
  startAttempt,
  tierForRatio,
  verificationCode,
} from '@lookline/engine'
import type { ActionResult } from '@/components/latency/instant-form'
import { requireUser } from '@/server/auth'
import { canRenderCards, queueCandidateImage, studioProgress } from '@/server/card-generation'
import { getDb } from '@/server/db'

/** A session is abandoned if it is not settled within the hour; its credit can then be released. */
const SESSION_TTL_MS = 3_600_000

function directionFrom(formData: FormData) {
  return parseCardArtDirection({
    focus: formData.get('artFocus'),
    pose: formData.get('artPose'),
    scene: formData.get('artScene'),
    note: formData.get('artNote'),
  })
}

/**
 * Close a session whose hour has run out and hand its credit back.
 *
 * Without this `expiresAt` was written and never read: an abandoned session held its credit for
 * good, and the studio would still generate into it days later. There is no scheduler here, so
 * the next touch of a session is what retires it — and `releaseCredit` keys off the session, so
 * two concurrent touches release once between them.
 */
async function expireIfStale(
  db: ReturnType<typeof getDb>['db'],
  session: { id: string; ownerUserId: string; state: string; expiresAt: Date },
): Promise<boolean> {
  if (session.state !== 'open' || session.expiresAt.getTime() > Date.now()) return false
  await releaseCredit(db, {
    id: `led_release_${session.id}`,
    ownerUserId: session.ownerUserId,
    sessionId: session.id,
    operationKey: `release:${session.id}`,
  })
  await db
    .update(cardSessions)
    .set({ state: 'expired', settledAt: new Date() })
    .where(and(eq(cardSessions.id, session.id), eq(cardSessions.state, 'open')))
  return true
}

/** Retire any of this account's sessions that ran out while it was away. */
export async function expireStaleSessions(userId: string): Promise<void> {
  const { db } = getDb()
  const stale = await db
    .select()
    .from(cardSessions)
    .where(
      and(
        eq(cardSessions.ownerUserId, userId),
        eq(cardSessions.state, 'open'),
        lt(cardSessions.expiresAt, new Date()),
      ),
    )
  for (const session of stale) await expireIfStale(db, session)
}

/**
 * Open a studio session: hold one credit, fix the persona and the clothes.
 *
 * Every piece is checked against what this account may actually use right now — its own purchases
 * plus what friends have lent it. A posted article id that is not in that list is dropped rather
 * than trusted, so no catalogue id, unshared friend's article or outside garment can reach a card.
 */
export async function startSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/studio')
  const { db } = getDb()
  const personaId = String(formData.get('personaId') ?? '')
  const picked = formData.getAll('articleId').map(String).filter(Boolean)
  const direction = directionFrom(formData)
  if (!direction.ok) redirect(`/studio?error=${encodeURIComponent(direction.message)}`)

  const [persona] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, personaId), eq(personas.ownerUserId, user.id)))
    .limit(1)
  if (!persona) redirect('/studio?error=persona')
  if (picked.length === 0) redirect('/studio?error=empty')

  const allowed = await availableArticles(db, user.id)
  const bySource = new Map(allowed.map((a) => [a.articleId, a.source]))
  // Distinct, and only what the wardrobe actually grants.
  const chosen = [...new Set(picked)]
    .filter((id) => bySource.has(id))
    .map((id) => ({ articleId: id, source: bySource.get(id)! }))
  if (chosen.length === 0) redirect('/studio?error=unauthorised')
  // A card is one outfit. Without a cap the whole wardrobe could go on it, and the renderer would
  // draw all of it — forty garments is an inventory, not a look.
  if (chosen.length > MAX_PIECES_PER_CARD) redirect('/studio?error=too-many')

  const sessionId = `cs_${nanoid(12)}`
  const reserved = await reserveCredit(db, {
    id: `led_${sessionId}`,
    ownerUserId: user.id,
    sessionId,
    operationKey: `reserve:${sessionId}`,
  })
  if (!reserved) redirect('/studio?error=credits')

  try {
    await openSession(db, {
      id: sessionId,
      ownerUserId: user.id,
      personaId,
      reserveOperationKey: `reserve:${sessionId}`,
      articles: chosen,
      artDirection: direction.value,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
  } catch (error) {
    // The credit is already held but there is no session to spend it on, and without this it
    // would sit reserved forever. Hand it straight back rather than leaving it stranded.
    console.warn('[studio] session could not be opened, releasing the credit', error)
    await releaseCredit(db, {
      id: `led_release_${sessionId}`,
      ownerUserId: user.id,
      sessionId,
      operationKey: `release:${sessionId}`,
    })
    redirect('/studio?error=session')
  }
  revalidatePath('/studio')
  redirect(`/studio/${sessionId}`)
}

/**
 * Add one more candidate to a session. The server decides the number: four is the cap, and a
 * settled session takes none, so neither refreshing nor reopening can wash out more.
 */
export async function generateCandidateAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/studio')
  const { db } = getDb()
  const sessionId = String(formData.get('sessionId') ?? '')
  const [session] = await db
    .select()
    .from(cardSessions)
    .where(and(eq(cardSessions.id, sessionId), eq(cardSessions.ownerUserId, user.id)))
    .limit(1)
  if (!session) return { ok: false, message: '找不到這個製卡階段。' }
  if (await expireIfStale(db, session)) {
    return { ok: false, message: '這個製卡階段已經過期，額度已經退回。' }
  }

  // Re-check the loans: one revoked since the session opened must stop it. Only for a personal
  // card, where the clothes are being used out of this account's wardrobe. An edition draws on
  // cards its members already issued — a record of what was worn, not a right being exercised —
  // and those pieces are mostly other people's, so checking them here refused every edition.
  if (!session.collectionId) {
    const allowed = new Set((await availableArticles(db, user.id)).map((a) => a.articleId))
    const missing = (session.articleSnapshot ?? []).filter((a) => !allowed.has(a.articleId))
    if (missing.length > 0) {
      return { ok: false, message: '有一件服飾的授權已被收回，這次製卡無法繼續。' }
    }
  }

  // A render occupies a place before it has produced anything, so the cap counts what is on
  // screen plus what is on its way. Without this, four clicks while the first was still running
  // would each start a render and three of them would be thrown away at the end.
  const progress = await studioProgress(sessionId)
  if (progress.candidates.length + progress.pending >= MAX_CANDIDATES_PER_SESSION) {
    return { ok: false, message: `一次最多 ${MAX_CANDIDATES_PER_SESSION} 張候選。` }
  }

  if (!canRenderCards()) {
    return { ok: false, message: '目前沒有可用的影像生成服務，尚未開始生成。' }
  }

  const requested = directionFrom(formData)
  if (!requested.ok) return requested
  const articleIds = [...new Set((session.articleSnapshot ?? []).map((row) => row.articleId))]
  const rows = articleIds.length
    ? await db
        .select({
          id: articles.id,
          outfitRole: articles.outfitRole,
          pattern: articles.pattern,
          material: articles.material,
        })
        .from(articles)
        .where(inArray(articles.id, articleIds))
    : []
  const subjectCount = Math.max(
    1,
    new Set(
      (session.articleSnapshot ?? [])
        .map((row) => row.personaId)
        .filter((id): id is string => !!id),
    ).size,
  )
  const artDirection = resolveCardArtDirection(requested.value, {
    articles: rows,
    subjectCount,
    candidateOrdinal: progress.candidates.length + progress.pending + 1,
  })

  const attemptId = `ga_${nanoid(10)}`
  const candidateId = `cc_${nanoid(12)}`

  const [collection] = session.collectionId
    ? await db
        .select({ title: collections.title })
        .from(collections)
        .where(eq(collections.id, session.collectionId))
        .limit(1)
    : []

  await startAttempt(db, { id: attemptId, sessionId, provider: 'image', artDirection })
  queueCandidateImage({
    sessionId,
    attemptId,
    candidateId,
    authorName: user.displayName,
    collectionTitle: collection?.title ?? null,
  })
  revalidatePath(`/studio/${sessionId}`)
  return { ok: true }
}

/**
 * Issue the card from the chosen candidate. Any of the four may be picked. Settling twice returns
 * the same card rather than spending another credit — the unique index on `session_id` is what
 * makes a double submit safe.
 */
export async function settleCardAction(formData: FormData): Promise<void> {
  const user = await requireUser('/studio')
  const { db } = getDb()
  const sessionId = String(formData.get('sessionId') ?? '')
  const candidateId = String(formData.get('candidateId') ?? '')

  const [session] = await db
    .select()
    .from(cardSessions)
    .where(and(eq(cardSessions.id, sessionId), eq(cardSessions.ownerUserId, user.id)))
    .limit(1)
  if (!session) redirect('/studio?error=session')
  if (session.state === 'settled') {
    // `cards_session_idx` is unique, so the session names exactly one card. Redirecting with the
    // session's own id sent a resubmitted settle to `/cards/cs_…`, which is a 404.
    const [issued] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.sessionId, session.id))
      .limit(1)
    redirect(issued ? `/cards/${issued.id}` : '/me')
  }

  const snapshot = session.articleSnapshot ?? []
  const ratio = ownedRatioOf(snapshot)
  const cardId = `card_${nanoid(12)}`
  const result = await settleCard(db, {
    cardId,
    sessionId,
    candidateId,
    verificationCode: verificationCode(),
    tier: tierForRatio(ratio).slug,
    now: new Date(),
  })
  if (!result.ok) redirect(`/studio/${sessionId}?error=${result.reason}`)

  await settleCredit(db, {
    id: `led_settle_${sessionId}`,
    ownerUserId: user.id,
    sessionId,
    operationKey: `settle:${sessionId}`,
  })
  revalidatePath('/me')
  revalidatePath('/studio')
  redirect(`/cards/${cardId}`)
}

/** Abandon a session that produced nothing usable and hand the credit back. */
export async function abandonSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/studio')
  const { db } = getDb()
  const sessionId = String(formData.get('sessionId') ?? '')
  const [session] = await db
    .select()
    .from(cardSessions)
    .where(and(eq(cardSessions.id, sessionId), eq(cardSessions.ownerUserId, user.id)))
    .limit(1)
  if (!session || session.state !== 'open') redirect('/studio')

  const made = await candidatesOf(db, sessionId)
  // Only a session with nothing to show gets its credit back.
  if (made.length === 0) {
    await releaseCredit(db, {
      id: `led_release_${sessionId}`,
      ownerUserId: user.id,
      sessionId,
      operationKey: `release:${sessionId}`,
    })
  }
  await db
    .update(cardSessions)
    .set({ state: 'cancelled', settledAt: new Date() })
    .where(eq(cardSessions.id, sessionId))
  revalidatePath('/studio')
  redirect('/studio')
}

export async function studioCredits(userId: string): Promise<number> {
  return creditBalance(getDb().db, userId)
}
