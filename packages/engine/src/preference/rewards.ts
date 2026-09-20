/**
 * Reward table for the eight contract `FeedbackKind`s and their context variants (ENGINE_SPEC §4.1).
 */
import type { FeedbackKind, PurchaseFor } from '@lookline/db'
import type { FeedbackInput } from '../types'

/** Base reward per canonical feedback kind. */
export const REWARDS: Readonly<Record<FeedbackKind, number>> = {
  impression: 0,
  click: 0.1,
  save: 0.4,
  dismiss: -0.3,
  add_to_bag: 0.6,
  purchase: 1.0,
}

export const REWARD_VARIANTS = {} as const

export type RewardTarget = 'self' | 'gift'

export interface RewardResolution {
  /** Reward written on the `feedback_events` row. */
  reward: number
  /** Vectors the event updates and the learning-rate scale for each (empty for impressions). */
  targets: Array<{ target: RewardTarget; scale: number }>
}

const SELF = [{ target: 'self' as const, scale: 1 }]
const GIFT = [{ target: 'gift' as const, scale: 1 }]

function purchaseTargets(forKind: PurchaseFor): RewardResolution['targets'] {
  switch (forKind) {
    case 'other':
      return GIFT
    case 'undisclosed':
      return [
        { target: 'self', scale: 0.5 },
        { target: 'gift', scale: 0.5 },
      ]
    case 'self':
    default:
      return SELF
  }
}

/** Resolve the reward and the target vector(s) of a feedback event from its kind and context. */
export function rewardFor(
  input: Pick<FeedbackInput, 'kind' | 'forOthers' | 'context'>,
): RewardResolution {
  const ctx = input.context ?? {}
  const byFlag = input.forOthers ? GIFT : SELF
  switch (input.kind) {
    case 'impression':
      return { reward: 0, targets: [] }
    case 'purchase': {
      const raw = ctx['forKind']
      const forKind: PurchaseFor =
        raw === 'self' || raw === 'other' || raw === 'undisclosed'
          ? raw
          : input.forOthers
            ? 'other'
            : 'self'
      return { reward: REWARDS.purchase, targets: purchaseTargets(forKind) }
    }
    case 'click':
    case 'save':
    case 'dismiss':
    case 'add_to_bag':
      return { reward: REWARDS[input.kind], targets: byFlag }
    default:
      return { reward: 0, targets: [] }
  }
}
