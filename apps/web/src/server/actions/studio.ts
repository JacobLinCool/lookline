'use server'

import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, cardSessions, eq, personas } from '@lookline/db'
import {
  MAX_CANDIDATES_PER_SESSION,
  addCandidate,
  availableArticles,
  candidatesOf,
  creditBalance,
  ownedRatioOf,
  releaseCredit,
  reserveCredit,
  openSession,
  settleCard,
  settleCredit,
  startAttempt,
  tierForRatio,
  verificationCode,
} from '@lookline/engine'
import type { ActionResult } from '@/components/latency/instant-form'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

/** A session is abandoned if it is not settled within the hour; its credit can then be released. */
const SESSION_TTL_MS = 3_600_000

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

  const attemptId = `ga_${nanoid(10)}`
  await startAttempt(db, { id: attemptId, sessionId, provider: 'composition' })
  const result = await addCandidate(db, {
    id: `cc_${nanoid(12)}`,
    sessionId,
    attemptId,
    // The composition poster is rendered on demand from the session's own articles.
    imagePath: '',
    now: new Date(),
  })
  revalidatePath(`/studio/${sessionId}`)
  if (result.ok) return { ok: true }
  return {
    ok: false,
    message:
      result.reason === 'full'
        ? `一次最多 ${MAX_CANDIDATES_PER_SESSION} 張候選。`
        : '這個階段已經結束。',
  }
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
  if (session.state === 'settled') redirect(`/cards/${session.id}`)

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
