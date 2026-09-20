'use server'

import type { FeedbackKind } from '@lookline/db'
import { recordFeedback } from '@lookline/engine'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'

export interface FeedbackActionInput {
  kind: FeedbackKind
  articleId?: string | null
  cardId?: string | null
  intentSessionId?: string | null
  position?: number | null
  forOthers?: boolean
  context?: Record<string, unknown>
}

/**
 * Shared Engine 03 write path for client components: records one feedback event for the signed-in
 * user. Signed-out visitors are ignored (returns { ok: false, reason: 'anonymous' }). Never throws.
 */
export async function sendFeedbackAction(
  input: FeedbackActionInput,
): Promise<{ ok: boolean; reason?: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, reason: 'anonymous' }
  try {
    await recordFeedback(getDb().db, { userId: user.id, ...input })
    return { ok: true }
  } catch (error) {
    console.warn('[feedback] failed', error)
    return { ok: false, reason: 'engine' }
  }
}

/** Server-side helper for pages/actions that already know the user id. Never throws. */
export async function recordFeedbackFor(
  userId: string,
  input: FeedbackActionInput,
): Promise<boolean> {
  try {
    await recordFeedback(getDb().db, { userId, ...input })
    return true
  } catch (error) {
    console.warn('[feedback] failed', error)
    return false
  }
}
