import { describe, expect, it } from 'vitest'
import { sumContributions } from './explain'
import { completeTheLookWith, runRecommend, similarProductsWith } from './index'
import { MemoryRetriever } from './retrieve'
import { makeCatalog, makeContext, makeIntent } from './testing/fixtures'
import { fallbackIntentVector } from './intent-vector'

const rows = makeCatalog(2000, 42)
const retriever = new MemoryRetriever(rows)
const context = makeContext()

describe('runRecommend (MemoryRetriever)', () => {
  it('single 中文 intent: hard budget, subcategory and colour honoured, zh summaries, Σ = score', async () => {
    const intent = makeIntent({
      utterance: '幫我找一件黑色的oversize帽T，三千以內',
      locale: 'mixed',
      mode: 'single',
      department: 'women',
      categoryGroups: ['tops'],
      subcategories: ['hoodie'],
      colorFamilies: ['black'],
      fits: ['oversized'],
      budget: { max: 3000, currency: 'TWD', strictness: 'hard', scope: 'per_item' },
    })
    const res = await runRecommend({ intent, limit: 8 }, { retriever, context })
    expect(res.items.length).toBeGreaterThan(0)
    expect(res.items.length).toBeLessThanOrEqual(8)
    expect(res.candidates).toBeGreaterThan(0)
    expect(res.outfits).toEqual([])
    expect(res.intentVector.length).toBe(64)
    expect(res.timings.retrieve).toBeGreaterThanOrEqual(0)
    for (const x of res.items) {
      expect(x.product.price).toBeLessThanOrEqual(3000)
      expect(['women', 'unisex']).toContain(x.product.department)
      expect(x.brandName.length).toBeGreaterThan(0)
      expect(Math.abs(sumContributions(x.explanation.factors) - x.score)).toBeLessThan(1e-9)
      expect(x.explanation.factors.length).toBe(10)
      expect(x.explanation.summary).toMatch(/[一-鿿]/)
    }
    const hoodies = rows.filter(
      (r) =>
        r.subcategory === 'hoodie' &&
        r.colorFamily === 'black' &&
        r.price <= 3000 &&
        r.department !== 'men' &&
        r.department !== 'kids',
    )
    if (hoodies.length >= 20) {
      expect(res.timings['relaxed:subcategories']).toBeUndefined()
      for (const x of res.items) expect(x.product.subcategory).toBe('hoodie')
    } else {
      // the small fixture catalog has too few black hoodies: the ladder relaxes the subcategory and says so
      expect(res.timings['relaxed:subcategories']).toBe(1)
      expect(res.items[0]!.explanation.summary).toContain('放寬了品項條件')
    }
    expect(res.items[0]!.product.colorFamily).toBe('black')
  })

  it('English gift intent for a man keeps men/unisex items and explains in English', async () => {
    const intent = makeIntent({
      utterance: 'gift for my dad under $100, he likes hiking',
      locale: 'en',
      mode: 'single',
      recipient: { kind: 'other', relation: 'father', department: 'men', label: 'my dad' },
      occasion: 'hiking',
      aesthetics: ['gorpcore', 'techwear', 'athleisure'],
      budget: {
        max: 3200,
        currency: 'TWD',
        strictness: 'hard',
        scope: 'per_item',
        original: 'under $100',
      },
      giftCategoryPrior: ['outerwear', 'footwear', 'accessories', 'activewear'],
    })
    const res = await runRecommend({ intent, limit: 10 }, { retriever, context })
    expect(res.items.length).toBe(10)
    for (const x of res.items) {
      expect(['men', 'unisex']).toContain(x.product.department)
      expect(x.product.price).toBeLessThanOrEqual(3200)
      expect(x.explanation.summary).not.toMatch(/[一-鿿]/)
    }
    const brands = new Map<number, number>()
    for (const x of res.items)
      brands.set(x.product.brandId, (brands.get(x.product.brandId) ?? 0) + 1)
    for (const n of brands.values()) expect(n).toBeLessThanOrEqual(2)
  })

  it('outfit intent returns budgeted outfits with required slots and reconciled item scores', async () => {
    const intent = makeIntent({
      utterance: '下週要去朋友婚禮，預算五千，不想太正式',
      locale: 'zh-TW',
      mode: 'outfit',
      department: 'women',
      occasion: 'wedding-guest',
      season: 'autumn',
      aesthetics: ['quiet-luxury', 'romantic', 'glam', 'corporate-chic'],
      colorWeights: { neutral: 0.35, pink: 0.21, blue: 0.21 },
      mustAvoid: ['color:white'],
      axisTargets: { formality: 0.575, coverage: 0.6, boldness: 0.45, warmth: 0.6 },
      budget: { max: 5000, currency: 'TWD', strictness: 'soft', scope: 'total' },
    })
    const res = await runRecommend({ intent, outfitCount: 3 }, { retriever, context })
    expect(res.outfits.length).toBe(3)
    expect(res.items.length).toBeGreaterThan(0)
    const ids = new Set(res.outfits.map((o) => o.id))
    expect(ids.size).toBe(3)
    for (const o of res.outfits) {
      expect(o.total).toBeLessThanOrEqual(5000 * 1.15)
      expect(o.budget).toBe(5000)
      expect(o.total).toBe(o.items.reduce((s, x) => s + x.product.price, 0))
      expect(o.compatibility).toBeGreaterThan(0)
      expect(o.styleVector.length).toBe(64)
      const roles = new Set(o.items.map((x) => x.role))
      expect(roles.has('shoes')).toBe(true)
      expect(roles.has('dress') || (roles.has('top') && roles.has('bottom'))).toBe(true)
      expect(o.items.some((x) => x.product.colorFamily === 'white')).toBe(false)
      expect(o.explanation.summary).toContain('總價')
      for (const x of o.items) {
        expect(Math.abs(sumContributions(x.explanation.factors) - x.score)).toBeLessThan(1e-9)
        expect(x.explanation.factors.find((f) => f.factor === 'compatibility')!.weight).toBeCloseTo(
          0.35,
          9,
        )
      }
      expect(o.items.filter((x) => x.role === 'outer').length).toBeLessThanOrEqual(1)
    }
    // diversified: no two outfits share > 80% of their articles
    for (let i = 0; i < res.outfits.length; i++) {
      for (let j = i + 1; j < res.outfits.length; j++) {
        const a = new Set(res.outfits[i]!.items.map((x) => x.product.id))
        const b = new Set(res.outfits[j]!.items.map((x) => x.product.id))
        let inter = 0
        for (const id of a) if (b.has(id)) inter++
        expect(inter / (a.size + b.size - inter)).toBeLessThanOrEqual(0.8)
      }
    }
  })

  it('gym outfit (sport template) uses activewear and sneakers', async () => {
    const intent = makeIntent({
      utterance: 'gym fit, all black, cheap',
      locale: 'en',
      mode: 'outfit',
      department: 'men',
      occasion: 'gym',
      colorFamilies: ['black'],
      aesthetics: ['athleisure'],
      budget: { max: 4000, currency: 'TWD', strictness: 'soft', scope: 'total' },
    })
    const res = await runRecommend({ intent, outfitCount: 2 }, { retriever, context })
    expect(res.outfits.length).toBeGreaterThan(0)
    for (const o of res.outfits) {
      expect(o.items.some((x) => x.product.categoryGroup === 'activewear')).toBe(true)
      expect(o.items.some((x) => x.product.categoryGroup === 'footwear')).toBe(true)
    }
  })

  it('browse mode relaxes the category filter and uses the browse limit', async () => {
    const intent = makeIntent({
      mode: 'browse',
      locale: 'en',
      categoryGroups: ['swimwear'],
      subcategories: ['bikini-top'],
      department: 'men',
      budget: { max: 150, currency: 'TWD', strictness: 'hard' },
    })
    const res = await runRecommend({ intent, limit: 5 }, { retriever, context })
    expect(res.timings['relaxed:subcategories']).toBe(1)
    expect(res.items.length).toBeGreaterThan(0)
    expect(res.items[0]!.explanation.summary).toContain('relaxed')
  })

  it('accepts an explicit intent vector and weight overrides', async () => {
    const intent = makeIntent({ aesthetics: ['minimalist'], categoryGroups: ['bags'] })
    const vector = fallbackIntentVector(intent)
    const res = await runRecommend(
      { intent, limit: 3, weights: { popularity_prior: 0.5 } },
      { retriever, context, intentVector: vector },
    )
    expect(res.intentVector).toBe(vector)
    expect(res.weights.popularity_prior).toBeGreaterThan(0.3)
    for (const x of res.items) expect(x.product.categoryGroup).toBe('bags')
  })
})

describe('similarProductsWith / completeTheLookWith', () => {
  it('similar articles share the group, sit within [0.5, 2]× the price and exclude the anchor', async () => {
    const anchor = rows.find((r) => r.categoryGroup === 'tops' && r.department === 'women')!
    const items = await similarProductsWith(anchor, { retriever, context }, { limit: 6 })
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(6)
    for (const x of items) {
      expect(x.product.id).not.toBe(anchor.id)
      expect(x.product.categoryGroup).toBe('tops')
      expect(x.product.price).toBeGreaterThanOrEqual(anchor.price * 0.5)
      expect(x.product.price).toBeLessThanOrEqual(anchor.price * 2 * 1.25 + 1)
      expect(Math.abs(sumContributions(x.explanation.factors) - x.score)).toBeLessThan(1e-9)
    }
  })
  it('complete the look pins the product and stays under the budget', async () => {
    const anchor = rows.find(
      (r) => r.categoryGroup === 'tops' && r.department === 'women' && r.price < 2000,
    )!
    const outfits = await completeTheLookWith(
      anchor,
      { retriever, context },
      { budget: 9000, count: 2 },
    )
    expect(outfits.length).toBeGreaterThan(0)
    expect(outfits.length).toBeLessThanOrEqual(2)
    for (const o of outfits) {
      expect(o.items[0]!.product.id).toBe(anchor.id)
      expect(o.items.filter((x) => x.product.categoryGroup === 'tops').length).toBe(1)
      expect(o.total).toBeLessThanOrEqual(9000)
      expect(o.items.some((x) => x.product.categoryGroup === 'bottoms')).toBe(true)
      expect(o.items.some((x) => x.product.categoryGroup === 'footwear')).toBe(true)
    }
  })
})
