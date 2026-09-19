import { describe, expect, it } from 'vitest'
import type { FactorName } from '../types'
import {
  ARMS,
  ARM_NAMES,
  DEFAULT_WEIGHTS,
  POSITIVE_FACTORS,
  redistribute,
  resolveWeights,
} from './weights'

const sumPositive = (w: Record<FactorName, number>): number =>
  POSITIVE_FACTORS.reduce((s, n) => s + w[n], 0)

describe('ARMS', () => {
  it('positive weights of every arm sum to 1.00 ± 1e-9 and compatibility is 0', () => {
    for (const name of ARM_NAMES) {
      expect(Math.abs(sumPositive(ARMS[name]) - 1)).toBeLessThan(1e-9)
      expect(ARMS[name].compatibility).toBe(0)
      expect(ARMS[name].diversity).toBeGreaterThan(0)
    }
    expect(DEFAULT_WEIGHTS).toEqual(ARMS.balanced)
    expect(ARMS.explore.diversity).toBe(0.3)
  })
})

describe('redistribute', () => {
  it('spreads inapplicable weight proportionally so the applicable set still sums to 1', () => {
    const applicable = new Set<FactorName>([
      'style_similarity',
      'popularity_prior',
      'attribute_match',
    ])
    const w = redistribute(DEFAULT_WEIGHTS, applicable)
    expect(Math.abs(sumPositive(w) - 1)).toBeLessThan(1e-9)
    expect(w.user_preference).toBe(0)
    expect(w.social_signal).toBe(0)
    // proportional: style / attribute ratio preserved
    expect(w.style_similarity / w.attribute_match).toBeCloseTo(
      DEFAULT_WEIGHTS.style_similarity / DEFAULT_WEIGHTS.attribute_match,
      9,
    )
    expect(w.diversity).toBe(DEFAULT_WEIGHTS.diversity)
  })

  it('is the identity when everything is applicable', () => {
    const w = redistribute(DEFAULT_WEIGHTS, new Set(POSITIVE_FACTORS))
    for (const n of POSITIVE_FACTORS) expect(w[n]).toBeCloseTo(DEFAULT_WEIGHTS[n], 12)
  })
})

describe('resolveWeights', () => {
  it('renormalises overridden positive weights and keeps λ', () => {
    const w = resolveWeights({ social_signal: 0.5, diversity: 0.05 })
    expect(Math.abs(sumPositive(w) - 1)).toBeLessThan(1e-9)
    expect(w.diversity).toBe(0.05)
    expect(w.social_signal).toBeGreaterThan(w.style_similarity)
  })
  it('returns the default arm when nothing is overridden', () => {
    expect(resolveWeights()).toEqual(DEFAULT_WEIGHTS)
    expect(resolveWeights(null)).toEqual(DEFAULT_WEIGHTS)
  })
})
