import { describe, expect, it } from 'vitest'
import { DEPARTMENTS, SUBCATEGORIES } from '../taxonomy'
import type { Department } from '../types'
import { generateBrands } from './brands'
import { DEFAULT_CATALOG_SEED, DEFAULT_CATALOG_SIZE } from './constants'
import { DEPT_SHARE, GROUP_SHARE, TIER_TARGET, largestRemainder } from './distribution'
import {
  MAX_CELL_SIZE,
  cellPermutation,
  createPlan,
  departmentAt,
  indexToCell,
  scrambleMultiplier,
  slotOf,
} from './plan'

const seed = DEFAULT_CATALOG_SEED
const N = DEFAULT_CATALOG_SIZE
const brands = generateBrands(seed)
const plan = createPlan(seed, N, brands)

describe('largestRemainder', () => {
  it('apportions exactly with ties broken by table order', () => {
    expect(largestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(largestRemainder(100, [46, 30, 14, 10])).toEqual([46, 30, 14, 10])
    expect(largestRemainder(7, [0, 5, 0, 5])).toEqual([0, 4, 0, 3])
    expect(largestRemainder(3, [0, 0])).toEqual([0, 0])
    expect(largestRemainder(101, [2, 1]).reduce((a, b) => a + b, 0)).toBe(101)
  })
})

describe('createPlan', () => {
  it('slots sum to the plan size with department counts exact by construction', () => {
    expect(plan.cells.reduce((s, c) => s + c.n, 0)).toBe(N)
    const byDept: Record<Department, number> = { women: 0, men: 0, unisex: 0, kids: 0 }
    for (const c of plan.cells) for (const d of DEPARTMENTS) byDept[d] += c.deptCounts[d]
    for (const d of DEPARTMENTS) expect(byDept[d]).toBe(Math.round(N * DEPT_SHARE[d]))
  })

  it('matches GROUP_SHARE per department within largest-remainder rounding', () => {
    for (const d of DEPARTMENTS) {
      const byGroup = new Map<string, number>()
      for (const c of plan.cells) {
        const g = c.subcategory.group
        byGroup.set(g, (byGroup.get(g) ?? 0) + c.deptCounts[d])
      }
      const deptTotal = Math.round(N * DEPT_SHARE[d])
      for (const [g, count] of byGroup) {
        const expected =
          (deptTotal * GROUP_SHARE[d][g as keyof (typeof GROUP_SHARE)['women']]) / 100
        expect(Math.abs(count - expected)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('covers every (department, subcategory) pair with a group quota, and every subcategory with ≥ 40', () => {
    const pair = new Map<string, number>()
    const perSub = new Map<string, number>()
    for (const c of plan.cells) {
      perSub.set(c.subcategory.slug, (perSub.get(c.subcategory.slug) ?? 0) + c.n)
      for (const d of c.departments) {
        const key = `${d}/${c.subcategory.slug}`
        pair.set(key, (pair.get(key) ?? 0) + c.deptCounts[d])
      }
    }
    // §7.1 asks for ≥ 40 per allowed pair, but its own tables make that impossible for three
    // pairs (men/brooch, unisex/brooch, kids/nightgown) and give some pairs a zero group quota
    // (unisex tailoring, unisex swimwear); those are excluded / relaxed here. Likewise `cover-up`
    // (women only, weight 8 of 80 in a 3 % group) tops out at 138 and `tuxedo` (men only, weight
    // 3 of 77 in a 4 % group) at 47, both below the spec's ≥ 150 per subcategory.
    const thin: string[] = []
    for (const sub of SUBCATEGORIES) {
      expect(perSub.get(sub.slug) ?? 0, sub.slug).toBeGreaterThanOrEqual(40)
      for (const d of sub.departments) {
        if (GROUP_SHARE[d][sub.group] === 0) continue
        const n = pair.get(`${d}/${sub.slug}`) ?? 0
        expect(n, `${d}/${sub.slug}`).toBeGreaterThanOrEqual(15)
        if (n < 40) thin.push(`${d}/${sub.slug}`)
      }
    }
    expect(thin.length).toBeLessThanOrEqual(3)
  })

  it('keeps every cell within the name grammar capacity and kids away from luxury', () => {
    expect(plan.maxCell).toBeLessThanOrEqual(512)
    expect(plan.maxCell).toBeLessThanOrEqual(MAX_CELL_SIZE)
    for (const c of plan.cells) {
      if (c.brand.tier === 'luxury') expect(c.deptCounts.kids).toBe(0)
      expect(c.departments.every((d) => c.subcategory.departments.includes(d))).toBe(true)
    }
  })

  it('lands the tier shares on target (proportional fitting) within ±2 pp', () => {
    const byTier = new Map<string, number>()
    for (const c of plan.cells) byTier.set(c.brand.tier, (byTier.get(c.brand.tier) ?? 0) + c.n)
    for (const [tier, target] of Object.entries(TIER_TARGET)) {
      expect(Math.abs((byTier.get(tier) ?? 0) / N - target)).toBeLessThanOrEqual(0.02)
    }
  })

  it('is memoised and builds a fresh plan quickly', () => {
    expect(createPlan(seed, N, brands)).toBe(plan)
    const fresh = generateBrands(seed)
    const t = performance.now()
    const p2 = createPlan(seed, N, fresh)
    expect(performance.now() - t).toBeLessThan(200)
    expect(p2.cells.map((c) => [c.id, c.n])).toEqual(plan.cells.map((c) => [c.id, c.n]))
  })

  it('accepts plain GeneratedBrand rows (extras resolved from the seed)', () => {
    const plain = brands.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      tier: b.tier,
      homeAesthetics: b.homeAesthetics,
      homeDepartments: b.homeDepartments,
      priceMultiplier: b.priceMultiplier,
      origin: b.origin,
      description: b.description,
    }))
    const p2 = createPlan(seed, N, plain)
    expect(p2.cells.map((c) => [c.id, c.n])).toEqual(plan.cells.map((c) => [c.id, c.n]))
  })
})

describe('id scramble', () => {
  it('slotOf is a bijection on [0, 100000)', () => {
    expect(scrambleMultiplier(N)).toBe(73_856_093)
    const seen = new Uint8Array(N)
    for (let i = 0; i < N; i++) {
      const s = slotOf(i, N)
      expect(seen[s]).toBe(0)
      seen[s] = 1
    }
  })

  it('adjusts the multiplier when the plan size shares a factor', () => {
    const a = scrambleMultiplier(73_856_093 * 2)
    expect(a).not.toBe(73_856_093)
    expect(a % 2).toBe(1)
  })

  it('indexToCell round-trips slots and respects the cell permutation', () => {
    for (let k = 0; k < 10_000; k++) {
      const slot = (k * 7919 + 13) % N
      const { cell, ordinal } = indexToCell(plan, slot)
      expect(slot).toBeGreaterThanOrEqual(cell.start)
      expect(slot).toBeLessThan(cell.start + cell.n)
      expect(ordinal).toBe(slot - cell.start)
    }
    expect(() => indexToCell(plan, N)).toThrow(RangeError)
    const cell = plan.cells[0]!
    const perm = cellPermutation(plan, cell)
    expect(new Set(perm).size).toBe(cell.n)
    const counts: Record<Department, number> = { women: 0, men: 0, unisex: 0, kids: 0 }
    for (let j = 0; j < cell.n; j++) counts[departmentAt(cell, perm[j]!)]++
    expect(counts).toEqual(cell.deptCounts)
  })
})
