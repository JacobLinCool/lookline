import { describe, expect, it } from 'vitest'
import { AESTHETICS, CATEGORY_GROUPS, DEPARTMENTS } from '../taxonomy'
import { generateBrands } from './brands'
import { DEFAULT_CATALOG_SEED } from './constants'
import { DEPT_SHARE, GROUP_SHARE, TIER_TARGET } from './distribution'
import type { GeneratedProduct } from '../types'
import { generateProduct } from './product'

const seed = DEFAULT_CATALOG_SEED
const brands = generateBrands(seed)
const N = 20_000
const counts = {
  dept: new Map<string, number>(),
  group: new Map<string, number>(),
  tier: new Map<string, number>(),
  primary: new Map<string, number>(),
  sale: 0,
  rated: 0,
  ratingSum: 0,
}
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
for (let i = 1; i <= N; i++) {
  const p = generateProduct(i, seed, brands) as Required<GeneratedProduct>
  bump(counts.dept, p.department)
  bump(counts.group, p.categoryGroup)
  bump(counts.tier, p.tier)
  bump(counts.primary, String(p.attributes.primaryAesthetic))
  if (p.attributes.compareAtPrice !== undefined) counts.sale++
  if (p.reviewCount > 0) {
    counts.rated++
    counts.ratingSum += p.rating
  }
}
const share = (m: Map<string, number>, k: string) => (m.get(k) ?? 0) / N

describe('distribution over 20 000 products', () => {
  it('department shares are within ±3 pp of the targets', () => {
    for (const d of DEPARTMENTS)
      expect(Math.abs(share(counts.dept, d) - DEPT_SHARE[d])).toBeLessThanOrEqual(0.03)
  })

  it('group shares are within ±3 pp of the department-weighted GROUP_SHARE', () => {
    for (const g of CATEGORY_GROUPS) {
      let target = 0
      for (const d of DEPARTMENTS) target += (DEPT_SHARE[d] * GROUP_SHARE[d][g]) / 100
      expect(Math.abs(share(counts.group, g) - target), g).toBeLessThanOrEqual(0.03)
    }
  })

  it('tier shares are within ±3 pp of the targets', () => {
    for (const [tier, target] of Object.entries(TIER_TARGET)) {
      expect(Math.abs(share(counts.tier, tier) - target), tier).toBeLessThanOrEqual(0.03)
    }
  })

  it('every aesthetic is primary somewhere and none dominates', () => {
    for (const a of AESTHETICS) expect(counts.primary.get(a.slug) ?? 0, a.slug).toBeGreaterThan(0)
    for (const [slug, n] of counts.primary) expect(n / N, slug).toBeLessThanOrEqual(0.12)
  })

  it('sale share and ratings are in range', () => {
    expect(counts.sale / N).toBeGreaterThanOrEqual(0.12)
    expect(counts.sale / N).toBeLessThanOrEqual(0.3)
    const meanRating = counts.ratingSum / Math.max(1, counts.rated)
    expect(meanRating).toBeGreaterThanOrEqual(4.1)
    expect(meanRating).toBeLessThanOrEqual(4.4)
  })
})
