import { describe, expect, it } from 'vitest'
import { REWARDS, REWARD_VARIANTS, rewardFor } from './rewards'

describe('REWARDS', () => {
  it('has exactly the nine contract kinds with the §4.1 values', () => {
    expect(REWARDS).toEqual({
      impression: 0,
      click: 0.1,
      save: 0.4,
      dismiss: -0.3,
      add_to_bag: 0.6,
      purchase: 1,
      ask_choice: 0.35,
      remix: 0.6,
      look_create: 0.8,
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

  it('ask_choice: chosen / rejected / adviser variants', () => {
    expect(rewardFor({ kind: 'ask_choice', context: { chosen: true, role: 'asker' } }).reward).toBe(
      0.35,
    )
    expect(
      rewardFor({ kind: 'ask_choice', context: { chosen: false, role: 'asker' } }).reward,
    ).toBe(REWARD_VARIANTS.ask_choice_rejected)
    const adviser = rewardFor({ kind: 'ask_choice', context: { chosen: true, role: 'adviser' } })
    expect(adviser.reward).toBe(REWARD_VARIANTS.ask_choice_adviser)
    expect(adviser.targets).toEqual([{ target: 'gift', scale: 1 }])
  })

  it('remix: kept vs swapped out; look_create is +0.80 on self', () => {
    expect(rewardFor({ kind: 'remix', context: { kept: true } }).reward).toBe(0.6)
    expect(rewardFor({ kind: 'remix', context: { kept: false } }).reward).toBe(
      REWARD_VARIANTS.remix_swapped,
    )
    expect(rewardFor({ kind: 'look_create', context: { lookId: 'lk_1' } })).toEqual({
      reward: 0.8,
      targets: [{ target: 'self', scale: 1 }],
    })
  })
})
