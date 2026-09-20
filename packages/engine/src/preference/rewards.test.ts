import { describe, expect, it } from 'vitest'
import { REWARDS, rewardFor } from './rewards'

describe('REWARDS', () => {
  it('has exactly the canonical feedback kinds', () => {
    expect(REWARDS).toEqual({
      impression: 0,
      click: 0.1,
      save: 0.4,
      dismiss: -0.3,
      add_to_bag: 0.6,
      purchase: 1,
    })
  })

  it('impressions never update a vector', () => {
    expect(rewardFor({ kind: 'impression' })).toEqual({ reward: 0, targets: [] })
  })

  it('routes plain kinds to self, or to gift when forOthers', () => {
    expect(rewardFor({ kind: 'save' })).toEqual({
      reward: 0.4,
      targets: [{ target: 'self', scale: 1 }],
    })
    expect(rewardFor({ kind: 'dismiss', forOthers: true })).toEqual({
      reward: -0.3,
      targets: [{ target: 'gift', scale: 1 }],
    })
    expect(rewardFor({ kind: 'click', forOthers: true }).targets[0]?.target).toBe('gift')
    expect(rewardFor({ kind: 'add_to_bag' }).reward).toBe(0.6)
  })

  it('purchase follows context.forKind: self / other / undisclosed halves', () => {
    expect(rewardFor({ kind: 'purchase', context: { forKind: 'self' } }).targets).toEqual([
      { target: 'self', scale: 1 },
    ])
    expect(rewardFor({ kind: 'purchase', context: { forKind: 'other' } }).targets).toEqual([
      { target: 'gift', scale: 1 },
    ])
    expect(rewardFor({ kind: 'purchase', context: { forKind: 'undisclosed' } }).targets).toEqual([
      { target: 'self', scale: 0.5 },
      { target: 'gift', scale: 0.5 },
    ])
    // without forKind the forOthers flag decides
    expect(rewardFor({ kind: 'purchase', forOthers: true }).targets[0]?.target).toBe('gift')
    expect(rewardFor({ kind: 'purchase' }).reward).toBe(1)
  })
})
