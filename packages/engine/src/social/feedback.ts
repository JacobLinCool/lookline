/**
 * Engine 03 bridge: every social write path emits feedback events through
 * `recordFeedback` from `../preference`. While that module is still a contract stub (it throws
 * "not implemented yet") we fall back to a plain `feedback_events` insert with the §4.1 reward so
 * the rows exist for later replay; any other error propagates.
 */
import { feedbackEvents, type Database } from '@lookline/db'
import { recordFeedback } from '../preference'
import type { FeedbackInput } from '../types'
import { newId } from './ids'

/** ENGINE_SPEC §4.1 base rewards (used only by the fallback path). */
export function fallbackReward(input: FeedbackInput): number {
  const chosen = input.context?.chosen
  switch (input.kind) {
    case 'purchase':
      return 1
    case 'look_create':
      return 0.8
    case 'add_to_bag':
      return 0.6
    case 'remix':
      return input.context?.kept === false ? -0.15 : 0.6
    case 'save':
      return 0.4
    case 'ask_choice':
      if (input.context?.role === 'adviser') return 0.15
      return chosen === false ? -0.1 : 0.35
    case 'click':
      return 0.1
    case 'dismiss':
      return -0.3
    default:
      return 0
  }
}

function isStubError(error: unknown): boolean {
  return error instanceof Error && /not implemented yet/.test(error.message)
}

export async function emitFeedback(db: Database, input: FeedbackInput): Promise<void> {
  try {
    await recordFeedback(db, input)
    return
  } catch (error) {
    if (!isStubError(error)) throw error
  }
  await db.insert(feedbackEvents).values({
    id: newId(input.id),
    userId: input.userId,
    articleId: input.articleId ?? null,
    lookId: input.lookId ?? null,
    intentSessionId: input.intentSessionId ?? null,
    kind: input.kind,
    reward: fallbackReward(input),
    position: input.position ?? null,
    forOthers: input.forOthers ?? false,
    context: { ...input.context, fallback: 'social' },
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  })
}
