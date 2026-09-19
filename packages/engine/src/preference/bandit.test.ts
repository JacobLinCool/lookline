import { createRng } from '@lookline/catalog'
import { describe, expect, it } from 'vitest'
import { ARMS, armIndexByName } from './arms'
import {
  LinUCB,
  collectSlates,
  contextVector,
  rebuildBanditFromEvents,
  slateReward,
  type BanditEventRow,
} from './bandit'
import { identity, invert, matVec } from './linalg'

describe('linalg', () => {
  it('inverts a known 8×8 matrix (A·A⁻¹ = I) and the identity', () => {
    const n = 8
    const rng = createRng(7)
    const A = identity(n)
    for (let t = 0; t < 20; t++) {
      const x = Array.from({ length: n }, () => rng.float(0, 1))
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) A[i * n + j] = A[i * n + j]! + x[i]! * x[j]!
    }
    const inv = invert(A, n)
    for (let i = 0; i < n; i++) {
      const row = A.slice(i * n, i * n + n)
      const prod = matVec(inv, row, n) // inv · (row of A) — compare against Aᵀ-based identity below
      expect(prod.length).toBe(n)
    }
    // Check A · inv = I explicitly
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0
        for (let k = 0; k < n; k++) s += A[i * n + k]! * inv[k * n + j]!
        expect(s).toBeCloseTo(i === j ? 1 : 0, 9)
      }
    }
    expect(invert(identity(3), 3)).toEqual(identity(3))
    // known 2×2: [[4, 7], [2, 6]]⁻¹ = [[0.6, −0.7], [−0.2, 0.4]]
    const inv2 = invert([4, 7, 2, 6], 2)
    expect(inv2[0]).toBeCloseTo(0.6, 12)
    expect(inv2[1]).toBeCloseTo(-0.7, 12)
    expect(inv2[2]).toBeCloseTo(-0.2, 12)
    expect(inv2[3]).toBeCloseTo(0.4, 12)
    expect(() => invert([1, 2, 2, 4], 2)).toThrow()
  })
})

describe('contextVector', () => {
  it('has 8 dims in [0, 1] in the §4.4 order', () => {
    expect(contextVector({ eventCount: 0 })).toEqual([1, 0, 0, 0, 0.8, 0, 0, 0])
    expect(
      contextVector({
        eventCount: 500,
        recipientOther: true,
        trustedCount: 5,
        confidence: 0.6,
        outfit: true,
        hasBudgetMax: true,
        daysSinceSignup: 30,
      }),
    ).toEqual([1, 1, 1, 0.5, 0.6, 1, 1, 0.5])
  })
})

describe('slateReward', () => {
  it('maps clip(Σ r / log2(pos + 2), −1, 1) to [0, 1]', () => {
    expect(slateReward([])).toBe(0.5)
    expect(slateReward([{ reward: 1, position: 0 }])).toBe(1)
    expect(slateReward([{ reward: -0.3, position: 2 }])).toBeCloseTo((1 - 0.3 / 2) / 2, 10)
    expect(
      slateReward([
        { reward: 1, position: 0 },
        { reward: 1, position: 1 },
      ]),
    ).toBe(1)
    expect(
      slateReward([
        { reward: -1, position: 0 },
        { reward: -1, position: 0 },
      ]),
    ).toBe(0)
  })
})

describe('LinUCB', () => {
  it('identity state → balanced wins ties; cold users are forced to balanced', () => {
    const b = new LinUCB()
    const x = contextVector({ eventCount: 10, trustedCount: 3 })
    const choice = b.choose(x, { eventCount: 10 })
    expect(choice.name).toBe('balanced')
    expect(choice.forced).toBe(false)
    expect(choice.ucb.every((u) => Math.abs(u - choice.ucb[0]!) < 1e-12)).toBe(true)
    const cold = b.choose(x, { eventCount: 2 })
    expect(cold.name).toBe('balanced')
    expect(cold.forced).toBe(true)
    expect(cold.reason).toContain('still learning')
    expect(cold.reason).toContain('1 more signal')
  })

  it('chooses the higher-reward arm after enough pulls on a synthetic problem', () => {
    const b = new LinUCB()
    const social = armIndexByName('social-led')
    const rng = createRng(20260918)
    const withFriends = contextVector({ eventCount: 20, trustedCount: 10 })
    // 200 rounds: whatever the bandit picks, social-led earns ~.8 and the others ~.1 when trusted = 1
    for (let t = 0; t < 200; t++) {
      const choice = b.choose(withFriends, { eventCount: 20 })
      const mean = choice.index === social ? 0.8 : 0.1
      b.update(choice.index, withFriends, Math.min(1, Math.max(0, mean + rng.normal(0, 0.05))))
    }
    let chosen = 0
    for (let t = 0; t < 100; t++) {
      const choice = b.choose(withFriends, { eventCount: 20 })
      if (choice.name === 'social-led') chosen += 1
      b.update(choice.index, withFriends, choice.index === social ? 0.8 : 0.1)
    }
    expect(chosen).toBeGreaterThanOrEqual(90)
    expect(b.choose(withFriends, { eventCount: 20 }).reason).toContain('social-led')
    // a cold user still gets balanced
    expect(b.choose(withFriends, { eventCount: 0 }).name).toBe('balanced')
    const summary = b.summary()
    expect(summary.find((a) => a.name === 'social-led')!.meanReward).toBeGreaterThan(0.7)
    expect(summary.reduce((s, a) => s + a.pulls, 0)).toBe(300)
  })

  it('serialize round-trips and tolerates garbage', () => {
    const b = new LinUCB()
    const x = contextVector({ eventCount: 5, hasBudgetMax: true })
    b.recordSlate('u1|s1', 2, x, 0.9)
    b.recordSlate('u1|s2', 0, x, 0.2)
    const json = JSON.parse(JSON.stringify(b.serialize()))
    const back = LinUCB.deserialize(json)
    expect(back.serialize()).toEqual(b.serialize())
    expect(back.choose(x, { eventCount: 5 }).name).toBe(b.choose(x, { eventCount: 5 }).name)
    expect(back.trackedSlates).toBe(2)
    expect(
      LinUCB.deserialize(null)
        .summary()
        .every((a) => a.pulls === 0),
    ).toBe(true)
    expect(
      LinUCB.deserialize({ version: 99 })
        .summary()
        .every((a) => a.pulls === 0),
    ).toBe(true)
  })

  it('recordSlate revises a slate in place (state equals a fresh replay)', () => {
    const a = new LinUCB()
    const x = contextVector({ eventCount: 5 })
    a.recordSlate('k', 1, x, 0.5)
    a.recordSlate('k', 1, x, 0.9)
    a.recordSlate('k2', 3, x, 0.7)
    const fresh = new LinUCB()
    fresh.recordSlate('k', 1, x, 0.9)
    fresh.recordSlate('k2', 3, x, 0.7)
    const sa = a.serialize()
    const sf = fresh.serialize()
    sa.arms.forEach((arm, i) => {
      expect(arm.pulls).toBe(sf.arms[i]!.pulls)
      expect(arm.rewardSum).toBeCloseTo(sf.arms[i]!.rewardSum, 12)
      arm.A.forEach((v, j) => expect(v).toBeCloseTo(sf.arms[i]!.A[j]!, 12))
      arm.b.forEach((v, j) => expect(v).toBeCloseTo(sf.arms[i]!.b[j]!, 12))
    })
    expect(a.arms[1]!.pulls).toBe(1)
  })
})

describe('rebuildBanditFromEvents', () => {
  const T0 = Date.UTC(2026, 5, 1)
  const at = (h: number): Date => new Date(T0 + h * 3_600_000)
  const impression = (
    id: string,
    userId: string,
    session: string,
    armId: string,
    position: number,
    hour: number,
    x = contextVector({ eventCount: 5 }),
  ): BanditEventRow => ({
    id,
    userId,
    intentSessionId: session,
    kind: 'impression',
    reward: 0,
    position,
    context: { armId, contextVector: x, position },
    createdAt: at(hour),
  })
  const reward = (
    id: string,
    userId: string,
    session: string,
    kind: BanditEventRow['kind'],
    r: number,
    position: number,
    hour: number,
  ): BanditEventRow => ({
    id,
    userId,
    intentSessionId: session,
    kind,
    reward: r,
    position,
    context: {},
    createdAt: at(hour),
  })

  it('reproduces the state from logged impressions and attributed rewards', () => {
    const rows: BanditEventRow[] = [
      impression('i1', 'u1', 's1', 'taste-led', 0, 0),
      impression('i2', 'u1', 's1', 'taste-led', 1, 0),
      reward('r1', 'u1', 's1', 'save', 0.4, 1, 1),
      reward('r2', 'u1', 's1', 'purchase', 1, 0, 2),
      impression('i3', 'u1', 's2', 'balanced', 0, 30), // later slate closes s1
      impression('i4', 'u2', 's3', 'explore', 0, 5),
      reward('r3', 'u2', 's3', 'dismiss', -0.3, 0, 6),
      reward('r4', 'u2', 'unknown', 'click', 0.1, 0, 6), // no impression → unattributable
      impression('i5', 'u3', 's9', 'nope', 0, 5), // unknown arm → skipped
    ]
    const now = at(60)
    const slates = collectSlates(rows, now)
    expect(slates.map((s) => s.key)).toEqual(['u1|s1', 'u2|s3', 'u1|s2'])
    const s1 = slates[0]!
    expect(s1.arm).toBe(armIndexByName('taste-led'))
    expect(s1.attributed).toBe(2)
    expect(s1.reward).toBe(1) // 0.4/log2(3) + 1 → clipped to 1 → 1
    expect(slates[1]!.reward).toBeCloseTo((1 - 0.3) / 2, 10)
    expect(slates[2]!.reward).toBe(0.5)

    const bandit = rebuildBanditFromEvents(rows, now)
    const expected = new LinUCB()
    for (const s of slates) expected.recordSlate(s.key, s.arm, s.x, s.reward)
    expect(bandit.serialize()).toEqual(expected.serialize())
    expect(bandit.arms[armIndexByName('taste-led')]!.pulls).toBe(1)
    expect(bandit.arms[armIndexByName('explore')]!.pulls).toBe(1)
    expect(bandit.arms[armIndexByName('balanced')]!.pulls).toBe(1)
    // an open slate (last for its user, < 24 h old) is excluded unless asked for
    expect(collectSlates(rows, at(31)).map((s) => s.key)).toEqual(['u1|s1', 'u2|s3'])
    const open = collectSlates(rows, at(6))
    expect(open.map((s) => s.key)).toEqual(['u1|s1'])
    expect(collectSlates(rows, at(6), { includeOpen: true }).length).toBe(3)
  })

  it('arms table order matches the recommend weights', () => {
    expect(ARMS.map((a) => a.name)).toEqual([
      'balanced',
      'intent-strict',
      'taste-led',
      'social-led',
      'trend-led',
      'explore',
    ])
    for (const arm of ARMS) {
      const positive =
        arm.weights.style_similarity +
        arm.weights.attribute_match +
        arm.weights.budget_fit +
        arm.weights.user_preference +
        arm.weights.social_signal +
        arm.weights.trend_momentum +
        arm.weights.brand_affinity +
        arm.weights.popularity_prior
      // ENGINE_SPEC §4.4 rows are transcribed verbatim in recommend/weights.ts; some sum to .95
      // (the ranker renormalises over the applicable factors, so scores are unaffected).
      expect(positive).toBeGreaterThan(0.85)
      expect(positive).toBeLessThanOrEqual(1.000001)
      for (const w of Object.values(arm.weights)) expect(w).toBeGreaterThanOrEqual(0)
    }
  })
})
