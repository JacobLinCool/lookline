import { describe, expect, it } from 'vitest'
import {
  attributeMatch,
  brandAffinity,
  budgetFit,
  diversity,
  popularityPrior,
  socialSignal,
  styleSimilarity,
  trendMomentum,
  userPreference,
} from './factors'
import type { RankUser } from './factors'
import { candidate, makeIntent, makeRankContext, product } from './testing/fixtures'

const hoodie = product({
  id: 1,
  name: 'Wold Supply Ink Fleece Hoodie',
  department: 'women',
  categoryGroup: 'tops',
  subcategory: 'hoodie',
  colorFamily: 'black',
  colorHex: '#111114',
  fit: 'oversized',
  material: 'fleece',
  pattern: 'solid',
  aesthetics: ['streetwear', 'k-street'],
  seasons: ['autumn', 'winter'],
  price: 1950,
  popularity: 0.5,
  brandId: 7,
  brandName: 'Wold Supply',
})
const tee = product({
  id: 2,
  department: 'women',
  categoryGroup: 'tops',
  subcategory: 'tee',
  colorFamily: 'black',
  colorHex: '#111114',
  fit: 'relaxed',
  material: 'cotton-jersey',
  pattern: 'solid',
  aesthetics: ['normcore'],
  seasons: ['summer'],
  price: 600,
  popularity: 0.1,
  brandId: 8,
  brandName: 'Daily Thread',
})

const baseUser = (overrides: Partial<RankUser> = {}): RankUser => ({
  id: 'u_1',
  department: 'women',
  eventCount: 0,
  giftEventCount: 0,
  preference: null,
  giftPreference: null,
  budgetHint: null,
  brandCounts: new Map(),
  trusted: [],
  ...overrides,
})

describe('style_similarity', () => {
  it('is in [0, 1], names the top aesthetics and adds the channel bonus', () => {
    const intent = makeIntent({ aesthetics: ['streetwear', 'k-street'], colorFamilies: ['black'] })
    const ctx = makeRankContext(intent)
    const plain = styleSimilarity(candidate(hoodie), ctx)
    const social = styleSimilarity(candidate(hoodie, 0.8, ['vector', 'social']), ctx)
    expect(plain.applicable).toBe(true)
    expect(plain.value).toBeGreaterThan(0.5)
    expect(plain.value).toBeLessThanOrEqual(1)
    expect(plain.evidence).toMatch(/matches streetwear \(0\.\d+\)/)
    expect(plain.evidence).toContain('colour black')
    expect(social.value).toBeCloseTo(Math.min(1, plain.value + 0.05), 9)
  })
  it('renders zh evidence for zh-TW intents', () => {
    const intent = makeIntent({ locale: 'zh-TW', aesthetics: ['streetwear'] })
    const r = styleSimilarity(candidate(hoodie), makeRankContext(intent))
    expect(r.evidence).toContain('風格對到街頭')
  })
})

describe('attribute_match', () => {
  it('weights the specified sub-checks and applies fit adjacency', () => {
    const intent = makeIntent({
      subcategories: ['hoodie'],
      colorFamilies: ['black'],
      fits: ['oversized'],
    })
    const ctx = makeRankContext(intent)
    const exact = attributeMatch(candidate(hoodie), ctx)
    expect(exact.value).toBeCloseTo(1, 9)
    expect(exact.evidence).toBe('checks: hoodie, black, oversized')
    const partial = attributeMatch(candidate(tee), ctx)
    // same group .5 × .30 + colour 1 × .25 + adjacent fit .5 × .10, over .65
    expect(partial.value).toBeCloseTo((0.15 + 0.25 + 0.05) / 0.65, 9)
  })
  it('is not applicable when nothing is specified and scores axes and season', () => {
    const none = attributeMatch(candidate(hoodie), makeRankContext(makeIntent()))
    expect(none.applicable).toBe(false)
    const intent = makeIntent({
      season: 'winter',
      axisTargets: { formality: hoodie.styleVector[44]! },
    })
    const r = attributeMatch(candidate(hoodie), makeRankContext(intent))
    expect(r.value).toBeCloseTo(1, 9)
    expect(r.evidence).toContain('suits winter')
    expect(r.evidence).toContain('formality within 0')
    const off = attributeMatch(candidate(tee), makeRankContext(makeIntent({ season: 'winter' })))
    expect(off.value).toBeCloseTo(0.3, 9)
  })
  it('counts mustHave text tokens and the gift category prior', () => {
    const intent = makeIntent({
      mustHave: ['text:fleece', 'text:nike'],
      giftCategoryPrior: ['tops'],
    })
    const r = attributeMatch(candidate(hoodie), makeRankContext(intent))
    expect(r.value).toBeCloseTo((0.1 * 0.5 + 0.1 * 1) / 0.2, 9)
  })
})

const at = (price: number, budget: { min?: number; max?: number }) => {
  const intent = makeIntent({ budget: { ...budget, currency: 'TWD', strictness: 'hard' } })
  return budgetFit(candidate(product({ id: 3, price })), makeRankContext(intent))
}

describe('budget_fit', () => {
  it('follows the over-budget ladder', () => {
    expect(at(500, { max: 1000 }).value).toBe(1)
    expect(at(1000, { max: 1000 }).value).toBe(1)
    expect(at(1100, { max: 1000 }).value).toBeCloseTo(0.8, 9)
    expect(at(1250, { max: 1000 }).value).toBeCloseTo(0.5, 9)
    expect(at(1500, { max: 1000 }).value).toBe(0)
    expect(at(1100, { max: 1000 }).evidence).toBe('NT$1,100, 10% over budget')
    expect(at(900, { max: 1000 }).evidence).toBe('NT$900, within NT$1,000')
  })
  it('penalises prices under the minimum and uses the budget hint when no budget', () => {
    expect(at(500, { min: 1000 }).value).toBeCloseTo(0.5, 9)
    const none = budgetFit(candidate(hoodie), makeRankContext(makeIntent()))
    expect(none.applicable).toBe(false)
    const hinted = budgetFit(
      candidate(hoodie),
      makeRankContext(makeIntent(), { user: baseUser({ budgetHint: 1500 }) }),
    )
    expect(hinted.applicable).toBe(true)
    expect(hinted.value).toBeCloseTo(1 - (1950 - 1500) / 750, 9)
    expect(hinted.evidence).toContain('around your usual NT$1,500')
  })
  it('uses the slot share in outfit mode', () => {
    const intent = makeIntent({
      mode: 'outfit',
      budget: { max: 5000, currency: 'TWD', scope: 'total' },
    })
    const r = budgetFit(candidate(hoodie), makeRankContext(intent, { slotBudgetMax: 1500 }))
    expect(r.value).toBeCloseTo(1 - (1950 - 1500) / 750, 9)
  })
})

describe('user_preference', () => {
  it('is not applicable without 3 events and routes gifts to the gift vector', () => {
    const cold = userPreference(
      candidate(hoodie),
      makeRankContext(makeIntent(), {
        user: baseUser({ preference: hoodie.styleVector, eventCount: 2 }),
      }),
    )
    expect(cold.applicable).toBe(false)
    const warm = userPreference(
      candidate(hoodie),
      makeRankContext(makeIntent(), {
        user: baseUser({ preference: hoodie.styleVector, eventCount: 5 }),
      }),
    )
    expect(warm.applicable).toBe(true)
    expect(warm.value).toBeCloseTo(1, 6)
    expect(warm.evidence).toContain('(5 signals)')
    const giftIntent = makeIntent({
      recipient: { kind: 'other', relation: 'father', department: 'men' },
    })
    const gift = userPreference(
      candidate(hoodie),
      makeRankContext(giftIntent, {
        user: baseUser({
          preference: tee.styleVector,
          eventCount: 5,
          giftPreference: hoodie.styleVector,
          giftEventCount: 3,
        }),
      }),
    )
    expect(gift.value).toBeCloseTo(1, 6)
    expect(gift.evidence).toContain('for others')
    const giftCold = userPreference(
      candidate(hoodie),
      makeRankContext(giftIntent, {
        user: baseUser({ preference: hoodie.styleVector, eventCount: 5, giftEventCount: 1 }),
      }),
    )
    expect(giftCold.value).toBeCloseTo(0.75, 6)
    expect(giftCold.evidence).toContain('not much gift history')
  })
})

describe('social_signal', () => {
  it('is 1 − e^{−s} over trusted evidence', () => {
    const trusted = [{ userId: 'u_2', displayName: 'Alice', strength: 0.8 }]
    const ctx = makeRankContext(makeIntent(), { user: baseUser({ trusted }) })
    const c = candidate(hoodie, 0.8, ['vector', 'social'])
    c.socialEvidence.push({
      userId: 'u_2',
      displayName: 'Alice',
      kind: 'look',
      strength: 0.8,
      at: new Date(ctx.now.getTime() - 3 * 86_400_000),
    })
    const r = socialSignal(c, ctx)
    expect(r.value).toBeCloseTo(1 - Math.exp(-0.8), 9)
    expect(r.evidence).toBe('Alice wore this in a Look this week')
    const guest = socialSignal(candidate(hoodie), makeRankContext(makeIntent()))
    expect(guest.applicable).toBe(false)
  })
})

describe('trend_momentum', () => {
  it('is .3 when nothing matches and momentum/100 otherwise', () => {
    const empty = trendMomentum(candidate(hoodie), makeRankContext(makeIntent()))
    expect(empty.applicable).toBe(false)
    const trend = new Map([
      ['aesthetic:hoodie', { momentum: 72, velocity: 1, emerging: true, crossCluster: 0.4 }],
    ])
    const hit = trendMomentum(candidate(hoodie), makeRankContext(makeIntent(), { trend }))
    expect(hit.value).toBeCloseTo(0.72, 9)
    expect(hit.evidence).toContain('spreading across taste circles')
    const miss = trendMomentum(candidate(tee), makeRankContext(makeIntent(), { trend }))
    expect(miss.value).toBe(0.3)
    expect(miss.applicable).toBe(true)
  })
})

describe('brand_affinity and popularity_prior', () => {
  it('follow the formulas', () => {
    const counts = new Map([[7, { purchases: 2, saves: 1, dismisses: 0 }]])
    const ctx = makeRankContext(makeIntent(), {
      user: baseUser({ brandCounts: counts }),
      popularityMax: 1,
    })
    const b = brandAffinity(candidate(hoodie), ctx)
    expect(b.value).toBeCloseTo(0.4 + 0.3 + 0.05, 9)
    expect(b.evidence).toBe("you've bought Wold Supply 2 times")
    expect(brandAffinity(candidate(tee), ctx).value).toBe(0.4)
    expect(brandAffinity(candidate(tee), makeRankContext(makeIntent())).applicable).toBe(false)
    const p = popularityPrior(candidate(hoodie), ctx)
    expect(p.value).toBeCloseTo(Math.log1p(0.5) / Math.log1p(1), 9)
  })
})

describe('diversity', () => {
  it('is 0 for the first item and ≤ 0 afterwards', () => {
    const first = diversity(candidate(hoodie), [], 'en')
    expect(first.value).toBe(0)
    const clone = product({ ...hoodie, id: 9 })
    const r = diversity(candidate(clone), [{ product: hoodie, position: 1 }], 'en')
    expect(r.value).toBeLessThan(0)
    expect(r.value).toBeGreaterThanOrEqual(-1)
    expect(r.evidence).toMatch(/similar to #1 \(/)
  })
})
