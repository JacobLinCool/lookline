import { describe, expect, it } from 'vitest'
import type { EvalConfig, EvalResult } from '../types'
import {
  DEFAULT_EVAL_CONFIG,
  EVAL_CONDITIONS,
  PASS_CRITERION,
  evaluatePreferenceLoop,
} from './evaluate'

const CONTRACT_KEYS = [
  'round',
  'hitRate',
  'ndcg',
  'cumulativeReward',
  'cosineToTruth',
  'baselineHitRate',
  'baselineNdcg',
  'baselineCumulativeReward',
] as const

const SMALL: EvalConfig = {
  seed: 1,
  users: 40,
  rounds: 12,
  catalogSize: 2000,
  k: 10,
  noise: 0.05,
  name: 'small',
}

let defaultRun: { result: EvalResult; ms: number } | null = null
function runDefault(): { result: EvalResult; ms: number } {
  if (!defaultRun) {
    const t0 = performance.now()
    const result = evaluatePreferenceLoop(DEFAULT_EVAL_CONFIG)
    defaultRun = { result, ms: performance.now() - t0 }
  }
  return defaultRun
}

function assertCriterion(result: EvalResult): void {
  const s = result.summary
  const last = result.series[result.series.length - 1]!
  // 1. learned (full) beats static on hitRate by the final round
  expect(s.finalHitRate).toBeGreaterThan(s.baselineHitRate + PASS_CRITERION.minHitRateLift)
  expect(last.hitRate).toBe(s.finalHitRate)
  expect(last.baselineHitRate).toBe(s.baselineHitRate)
  // 2. oracle ≥ learned
  expect(s['oracleNdcg']).toBeGreaterThanOrEqual(s.finalNdcg)
  expect(s['oracleHitRate']).toBeGreaterThanOrEqual(s.finalHitRate)
  // 3. placebo ≈ static
  expect(Math.abs((s['placeboNdcg'] ?? 0) - s.baselineNdcg)).toBeLessThanOrEqual(
    PASS_CRITERION.placeboTolerance,
  )
  // 4. the learned vector moves toward the truth
  expect(s.finalCosine - (s['initialCosine'] ?? 0)).toBeGreaterThanOrEqual(
    PASS_CRITERION.minCosineGain,
  )
  expect(s['criterionPassed']).toBe(1)
}

describe('evaluatePreferenceLoop', () => {
  it('default config (200 × 30 × 5,000 × k=10, seed 20260918) runs under 10 s and passes the pre-registered criterion', () => {
    const { result, ms } = runDefault()
    expect(ms).toBeLessThan(10_000)
    expect(result.series).toHaveLength(30)
    expect(result.summary['users']).toBe(200)
    expect(result.summary['catalogSize']).toBe(5000)
    assertCriterion(result)
    // learning also beats the baseline on ndcg and reward, and the prefOnly condition sits between
    expect(result.summary.liftNdcg).toBeGreaterThan(0)
    expect(result.summary['finalCumulativeReward']).toBeGreaterThan(
      result.summary['baselineCumulativeReward']!,
    )
    expect(result.summary['prefOnlyHitRate']).toBeGreaterThan(result.summary.baselineHitRate)
    expect(result.summary.roundsToBeatBaseline).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('is deterministic: the same config yields byte-identical JSON', () => {
    const { result } = runDefault()
    const again = evaluatePreferenceLoop({ ...DEFAULT_EVAL_CONFIG })
    expect(JSON.stringify(again)).toBe(JSON.stringify(result))
  }, 30_000)

  it('small config (seed 1, 40 users, 12 rounds, 2,000 articles) passes too, and a different seed differs', () => {
    const a = evaluatePreferenceLoop(SMALL)
    assertCriterion(a)
    expect(a.series).toHaveLength(12)
    const b = evaluatePreferenceLoop({ ...SMALL, seed: 2 })
    expect(JSON.stringify(b.series)).not.toBe(JSON.stringify(a.series))
    assertCriterion(b)
  }, 30_000)

  it('every round carries the contract keys plus the condition extras, all finite numbers', () => {
    const { result } = runDefault()
    result.series.forEach((row, i) => {
      expect(row.round).toBe(i + 1)
      for (const key of CONTRACT_KEYS) expect(typeof row[key]).toBe('number')
      for (const key of [
        'prefOnlyHitRate',
        'prefOnlyNdcg',
        'placeboHitRate',
        'placeboNdcg',
        'oracleHitRate',
        'oracleNdcg',
        'armShare_balanced',
        'armShare_taste-led',
      ]) {
        expect(typeof row[key]).toBe('number')
      }
      for (const v of Object.values(row)) expect(Number.isFinite(v)).toBe(true)
      expect(row.hitRate).toBeGreaterThanOrEqual(0)
      expect(row.hitRate).toBeLessThanOrEqual(1)
      expect(row.ndcg).toBeGreaterThanOrEqual(0)
      expect(row.ndcg).toBeLessThanOrEqual(1)
      const share = EVAL_CONDITIONS.length
        ? ['balanced', 'intent-strict', 'taste-led', 'social-led', 'trend-led', 'explore'].reduce(
            (s, a) => s + (row[`armShare_${a}`] ?? 0),
            0,
          )
        : 0
      expect(share).toBeCloseTo(1, 6)
    })
    // cumulative reward is a running sum → non-decreasing for the oracle (positive rewards dominate)
    const s = result.summary
    for (const key of [
      'finalHitRate',
      'finalNdcg',
      'finalCosine',
      'baselineHitRate',
      'baselineNdcg',
      'liftHitRate',
      'liftNdcg',
      'roundsToBeatBaseline',
    ]) {
      expect(typeof s[key]).toBe('number')
    }
    expect(result.config.seed).toBe(DEFAULT_EVAL_CONFIG.seed)
    expect(result.config.name).toBe('engine03-default')
  })

  it('honours a conditions subset (static and full are always run)', () => {
    const r = evaluatePreferenceLoop({
      ...SMALL,
      users: 10,
      rounds: 3,
      catalogSize: 500,
      conditions: ['oracle'],
    } as EvalConfig)
    expect(r.series).toHaveLength(3)
    expect(r.series[0]!['oracleHitRate']).toBeDefined()
    expect(r.series[0]!['prefOnlyHitRate']).toBeUndefined()
    expect(r.series[0]!['placeboHitRate']).toBeUndefined()
    expect(typeof r.series[0]!.hitRate).toBe('number')
    expect(typeof r.series[0]!.baselineHitRate).toBe('number')
  })
})
