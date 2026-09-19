import { describe, expect, it } from 'vitest'
import { hardFilters, rank, scoreCandidate } from './score'
import { candidate, makeCatalog, makeIntent, makeRankContext, product } from './testing/fixtures'
import { sumContributions } from './explain'

const rows = makeCatalog(600, 42)

describe('rank', () => {
  it('Σ contribution === score (±1e-9) for every item, including the MMR diversity factor', () => {
    const intent = makeIntent({
      mode: 'single',
      categoryGroups: ['tops'],
      aesthetics: ['minimalist'],
      colorFamilies: ['black'],
      budget: { max: 3000, currency: 'TWD' },
    })
    const ctx = makeRankContext(intent)
    const cands = rows.filter((r) => r.categoryGroup === 'tops').map((r) => candidate(r, 0.7))
    const items = rank(cands, ctx, { limit: 24 })
    expect(items.length).toBe(24)
    for (const x of items) {
      expect(x.explanation.factors.length).toBe(10)
      expect(Math.abs(sumContributions(x.explanation.factors) - x.score)).toBeLessThan(1e-9)
      expect(x.explanation.summary.length).toBeGreaterThan(0)
      expect(x.brandName.length).toBeGreaterThan(0)
      for (const f of x.explanation.factors) expect(f.evidence.length).toBeGreaterThan(0)
    }
    const diversity = items[1]!.explanation.factors.find((f) => f.factor === 'diversity')!
    expect(diversity.contribution).toBeLessThanOrEqual(0)
  })

  it('breaks ties by popularity then id', () => {
    const base = rows[0]!
    const a = product({ ...base, id: 101, popularity: 0.2, brandId: 1 })
    const b = product({ ...base, id: 102, popularity: 0.9, brandId: 2, subcategory: 'tee' })
    const c = product({ ...base, id: 103, popularity: 0.2, brandId: 3, subcategory: 'cardigan' })
    const ctx = makeRankContext(makeIntent(), { popularityMax: 1 })
    const scores = [a, b, c].map((p) => scoreCandidate(candidate(p), ctx).score)
    expect(scores[1]).toBeGreaterThan(scores[0]!)
    const items = rank(
      [c, a, b].map((p) => candidate(p)),
      ctx,
      { limit: 3, lambda: 0 },
    )
    expect(items.map((i) => i.product.id)).toEqual(['0000000102', '0000000101', '0000000103'])
  })

  it('MMR reduces near-duplicates compared with λ = 0', () => {
    const base = rows.find((r) => r.categoryGroup === 'tops')!
    const clones = Array.from({ length: 6 }, (_, i) =>
      product({ ...base, id: 200 + i, brandId: base.brandId, popularity: 0.9 }),
    )
    const others = rows
      .filter((r) => r.categoryGroup === 'tops' && r.brandId !== base.brandId)
      .slice(0, 20)
    const intent = makeIntent({
      aesthetics: [],
      colorFamilies: [base.colorFamily as never],
    })
    const ctx = makeRankContext(intent, { popularityMax: 1 })
    const cands = [...clones, ...others].map((r) => candidate(r))
    const clonesInTop = (lambda: number): number =>
      rank(cands, ctx, { limit: 5, lambda, maxPerBrand: 99, maxPerSubcategory: 99 }).filter(
        (i) => Number(i.product.id) >= 200,
      ).length
    expect(clonesInTop(0)).toBeGreaterThan(clonesInTop(0.5))
    expect(clonesInTop(1)).toBeLessThanOrEqual(2)
  })

  it('caps brands at 2 and subcategories at 4 in the top 20', () => {
    const tops = rows.filter((r) => r.categoryGroup === 'tops')
    const sameBrand = tops
      .slice(0, 12)
      .map((r, i) => product({ ...r, id: 300 + i, brandId: 5, popularity: 1 }))
    const rest = tops
      .slice(12, 60)
      .map((r, i) =>
        product({ ...r, id: 400 + i, brandId: r.brandId === 5 ? 6 : r.brandId, popularity: 0.1 }),
      )
    const items = rank(
      [...sameBrand, ...rest].map((r) => candidate(r)),
      makeRankContext(makeIntent(), { popularityMax: 1 }),
      { limit: 20 },
    )
    const brand5 = items.filter((i) => i.product.brandId === 5).length
    expect(brand5).toBeLessThanOrEqual(2)
    const bySub = new Map<string, number>()
    for (const i of items)
      bySub.set(i.product.subcategory, (bySub.get(i.product.subcategory) ?? 0) + 1)
    for (const n of bySub.values()) expect(n).toBeLessThanOrEqual(4)
  })
})

describe('hardFilters', () => {
  // Sizes are gone from the filter: the catalogue ships none, so nothing can mismatch.
  it('drops text avoids and kids mismatches', () => {
    const p = product({ id: 1, name: 'Nike Air Runner', department: 'men' })
    const q = product({ id: 2, name: 'Plain Tee', department: 'men' })
    const k = product({ id: 3, name: 'Kid Tee', department: 'kids' })
    const intent = makeIntent({ mustAvoid: ['text:nike'], sizes: { 'eu-shoe': '42' } })
    const kept = hardFilters(
      [p, q, k].map((r) => candidate(r)),
      makeRankContext(intent),
    )
    expect(kept.map((c) => c.product.id)).toEqual(['0000000002'])
    const shoe = product({ id: 4, name: 'Trail Runner', department: 'men' })
    expect(
      hardFilters(
        [shoe].map((r) => candidate(r)),
        makeRankContext(intent),
      ).length,
    ).toBe(1)
    const kidsIntent = makeIntent({ department: 'kids' })
    expect(
      hardFilters(
        [q, k].map((r) => candidate(r)),
        makeRankContext(kidsIntent),
      ).map((c) => c.product.id),
    ).toEqual(['0000000003'])
    const patternIntent = makeIntent({ mustAvoid: ['pattern:plaid'] })
    const plaid = product({ id: 5, pattern: 'plaid', department: 'men' })
    expect(
      hardFilters(
        [plaid, q].map((r) => candidate(r)),
        makeRankContext(patternIntent),
      ).map((c) => c.product.id),
    ).toEqual(['0000000002'])
  })
})
