import { STYLE_DIMENSIONS, colorFamilyIndex, cosineRange, toStyleVector } from '@lookline/catalog'
import { describe, expect, it } from 'vitest'
import {
  applyEvent,
  confidenceOf,
  createState,
  decayFactor,
  departmentPrior,
  effective,
  foldEvents,
  learningRate,
} from './update'
import { BLOCK } from './vector'

const DAY = 86_400_000
const T0 = new Date(Date.UTC(2026, 0, 1))
const at = (days: number): Date => new Date(T0.getTime() + days * DAY)

const gorp = toStyleVector({
  colorFamily: 'green',
  axes: {
    formality: 0.2,
    warmth: 0.8,
    boldness: 0.5,
    structure: 0.4,
    'price-tier': 0.5,
    coverage: 0.8,
    texture: 0.7,
    trendiness: 0.75,
  },
  categoryGroup: 'outerwear',
})
const glam = toStyleVector({
  colorFamily: 'multi-metallic',
  axes: {
    formality: 0.85,
    warmth: 0.3,
    boldness: 0.9,
    structure: 0.5,
    'price-tier': 0.7,
    coverage: 0.3,
    texture: 0.9,
    trendiness: 0.6,
  },
  categoryGroup: 'dresses',
})

describe('learning rate and decay', () => {
  it('η(0) = .25, η(20) ≈ .1768, floor .05', () => {
    expect(learningRate(0)).toBeCloseTo(0.25, 10)
    expect(learningRate(20)).toBeCloseTo(0.25 / Math.SQRT2, 4)
    expect(learningRate(20)).toBeCloseTo(0.1768, 3)
    expect(learningRate(100_000)).toBe(0.05)
    expect(learningRate(0, 0.5)).toBeCloseTo(0.125, 10)
  })

  it('decays with a 45-day half-life and never grows', () => {
    expect(decayFactor(null, at(10))).toBe(1)
    expect(decayFactor(at(0), at(45))).toBeCloseTo(0.5, 10)
    expect(decayFactor(at(0), at(90))).toBeCloseTo(0.25, 10)
    expect(decayFactor(at(5), at(0))).toBe(1)
  })

  it('confidence = mass / (mass + 3)', () => {
    expect(confidenceOf(0)).toBe(0)
    expect(confidenceOf(1)).toBeCloseTo(0.25, 10)
    expect(confidenceOf(3)).toBeCloseTo(0.5, 10)
    expect(confidenceOf(2) > confidenceOf(1)).toBe(true)
  })
})

describe('departmentPrior', () => {
  it('is a 32-d flat, non-committal taste with department colour skew', () => {
    for (const d of ['women', 'men', 'unisex', 'kids'] as const) {
      const p = departmentPrior(d)
      expect(p).toHaveLength(STYLE_DIMENSIONS)
      for (let i = BLOCK.X[0]; i < BLOCK.X[1]; i++) expect(p[i]).toBe(0.5)
      for (let i = BLOCK.G[0]; i < BLOCK.G[1]; i++) expect(p[i]).toBeCloseTo(1 / 12, 10)
      // The colour block carries the whole taste prior now that aesthetics are gone.
      const c = p.slice(BLOCK.C[0], BLOCK.C[1])
      expect(Math.max(...c)).toBeLessThan(0.6)
      expect(c.reduce((s, x) => s + x, 0)).toBeCloseTo(1.16, 6)
    }
    // men skew away from pink relative to women
    const pinkIdx = colorFamilyIndex('pink')
    expect(departmentPrior('men')[pinkIdx]!).toBeLessThan(departmentPrior('women')[pinkIdx]!)
    // returns copies
    const p = departmentPrior('women')
    p[0] = 99
    expect(departmentPrior('women')[0]).not.toBe(99)
  })
})

describe('applyEvent', () => {
  const p0 = departmentPrior('unisex')
  // `gorp` is green; `glam` is the pink piece it is compared against.
  const g = colorFamilyIndex('green')
  const gl = colorFamilyIndex('multi-metallic')

  it('moves toward a positively rewarded item and a purchase never decreases p[a] where v[a] = 1', () => {
    const state = createState(p0)
    const before = state.p[g]!
    applyEvent(state, gorp, 1, 1, at(0), p0)
    expect(state.p[g]!).toBeGreaterThan(before)
    expect(state.p[g]!).toBeCloseTo(before + 0.25 * (1 - before), 10)
    expect(state.n).toBe(1)
    expect(state.mass).toBe(1)
    expect(state.lastAt).toEqual(at(0))
    // every dim with v = 1 moved up, every dim with v = 0 moved down
    expect(state.p[g]!).toBeGreaterThan(p0[g]!) // green
    expect(state.p[gl]!).toBeLessThan(p0[gl]!)
  })

  it('moves away from a dismissed item, half as far as a save of equal magnitude', () => {
    const saved = createState(p0)
    applyEvent(saved, gorp, 0.4, 1, at(0), p0)
    const dismissed = createState(p0)
    applyEvent(dismissed, gorp, -0.4, 1, at(0), p0)
    const up = saved.p[g]! - p0[g]!
    const down = p0[g]! - dismissed.p[g]!
    expect(up).toBeGreaterThan(0)
    expect(down).toBeGreaterThan(0)
    expect(down / up).toBeCloseTo(0.5, 10)
    // the group block is untouched by negatives
    for (let i = BLOCK.G[0]; i < BLOCK.G[1]; i++) expect(dismissed.p[i]).toBe(p0[i])
    expect(saved.p[BLOCK.G[0] + 3]!).toBeGreaterThan(p0[BLOCK.G[0] + 3]!) // outerwear
  })

  it('an undisclosed purchase (scale .5) moves half as far as a self purchase', () => {
    const full = createState(p0)
    applyEvent(full, gorp, 1, 1, at(0), p0)
    const half = createState(p0)
    applyEvent(half, gorp, 1, 0.5, at(0), p0)
    expect((half.p[g]! - p0[g]!) / (full.p[g]! - p0[g]!)).toBeCloseTo(0.5, 10)
  })

  it('gift separation: routing keeps self and gift states independent', () => {
    const self = createState(p0)
    const gift = createState(p0)
    applyEvent(gift, glam, 1, 1, at(0), p0)
    expect(self.p).toEqual(p0)
    expect(gift.p[gl]!).toBeGreaterThan(p0[gl]!)
    expect(self.n).toBe(0)
  })

  it('after 45 idle days the distance to the prior halves', () => {
    const state = createState(p0)
    applyEvent(state, gorp, 1, 1, at(0), p0)
    const d0 = state.p[g]! - p0[g]!
    const eff = effective(state, at(45), p0)
    expect(eff.vector[g]! - p0[g]!).toBeCloseTo(d0 / 2, 10)
    expect(eff.confidence).toBeCloseTo(0.5 / 3.5, 10)
    // and the next event decays the stored vector before learning
    applyEvent(state, gorp, 0.1, 1, at(45), p0)
    expect(state.mass).toBeCloseTo(0.5 + 0.1, 10)
  })

  it('confidence ≈ .25 after one purchase and is monotone in mass', () => {
    const state = createState(p0)
    applyEvent(state, gorp, 1, 1, at(0), p0)
    expect(effective(state, at(0), p0).confidence).toBeCloseTo(0.25, 10)
    let last = 0
    for (let i = 0; i < 10; i++) {
      applyEvent(state, gorp, 0.4, 1, at(i), p0)
      const c = effective(state, at(i), p0).confidence
      expect(c).toBeGreaterThan(last)
      last = c
    }
  })

  it('20 saves of one piece → cos(p, that piece) > .85 and every dim stays in [0, 1]', () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      vector: gorp,
      reward: 0.4,
      scale: 1,
      at: at(i),
    }))
    const state = foldEvents(events, p0)
    // Against the piece itself, not a one-hot: with the aesthetic block gone, colour is one of
    // twelve dimensions among axes and groups, so no single dimension can dominate the cosine.
    expect(cosineRange(state.p, gorp, 0, STYLE_DIMENSIONS)).toBeGreaterThan(0.85)
    for (const x of state.p) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
    }
    expect(state.n).toBe(20)
  })
})
