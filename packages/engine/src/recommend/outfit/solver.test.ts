import type { CategoryGroup } from '@lookline/catalog'
import { describe, expect, it } from 'vitest'
import type { RankedItem } from '../../types'
import { product } from '../testing/fixtures'
import { diversify, solveOutfits } from './solver'
import type { SolverPlan, SolverSlot } from './solver'

let nextId = 1000
const item = (opts: {
  price: number
  score: number
  group: string
  sub: string
  colour?: [string, string]
  brandId?: number
}): RankedItem => {
  const id = nextId++
  const p = product({
    id,
    price: opts.price,
    categoryGroup: opts.group as CategoryGroup,
    subcategory: opts.sub,
    colorFamily: opts.colour?.[0] ?? 'black',
    colorHex: opts.colour?.[1] ?? '#111114',
    brandId: opts.brandId ?? id,
    seasons: ['all-season'],
  })
  return {
    product: p,
    brandName: `B${p.brandId}`,
    score: opts.score,
    explanation: { summary: '', factors: [] },
  }
}

const slot = (
  key: string,
  role: SolverSlot['role'],
  required: boolean,
  core: boolean,
  candidates: RankedItem[],
): SolverSlot => ({
  key,
  role,
  groups: [],
  subcategories: null,
  required,
  core,
  candidates: candidates.toSorted(
    (a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id),
  ),
})

function plan(): SolverPlan {
  const tops = [
    item({ price: 900, score: 0.7, group: 'tops', sub: 'tee', colour: ['white', '#F8F8F6'] }),
    item({ price: 1500, score: 0.8, group: 'tops', sub: 'blouse', colour: ['black', '#111114'] }),
    item({
      price: 4000,
      score: 0.9,
      group: 'tops',
      sub: 'crewneck-sweater',
      colour: ['neutral', '#D6C3A5'],
    }),
  ]
  const bottoms = [
    item({ price: 1200, score: 0.7, group: 'bottoms', sub: 'jeans', colour: ['blue', '#1C2A4A'] }),
    item({
      price: 2500,
      score: 0.85,
      group: 'bottoms',
      sub: 'wide-leg-trousers',
      colour: ['black', '#111114'],
    }),
  ]
  const shoes = [
    item({
      price: 1400,
      score: 0.75,
      group: 'footwear',
      sub: 'sneaker',
      colour: ['white', '#F8F8F6'],
    }),
    item({
      price: 3200,
      score: 0.9,
      group: 'footwear',
      sub: 'loafer',
      colour: ['brown', '#B98B55'],
    }),
  ]
  const bags = [
    item({ price: 2600, score: 0.6, group: 'bags', sub: 'tote', colour: ['neutral', '#CDB58F'] }),
  ]
  return {
    key: 'casual:B',
    slots: [
      slot('tops', 'top', true, true, tops),
      slot('bottoms', 'bottom', true, true, bottoms),
      slot('footwear', 'shoes', true, false, shoes),
      slot('bags', 'bag', false, false, bags),
    ],
  }
}

describe('solveOutfits', () => {
  it('respects a hard budget and fills every required slot', () => {
    const out = solveOutfits([plan()], { budgetMax: 5000, strictness: 'hard', returnK: 3 })
    expect(out.length).toBeGreaterThan(0)
    for (const o of out) {
      expect(o.cost).toBeLessThanOrEqual(5000)
      expect(o.overBudget).toBe(false)
      for (const key of ['tops', 'bottoms', 'footwear'])
        expect(o.items.some((x) => x.slotKey === key)).toBe(true)
      expect(o.items.filter((x) => x.role === 'bag').length).toBeLessThanOrEqual(1)
    }
  })
  it('allows 15% over a soft budget but never more', () => {
    const out = solveOutfits([plan()], { budgetMax: 5000, strictness: 'soft', returnK: 3 })
    expect(out.length).toBeGreaterThan(0)
    for (const o of out) expect(o.cost).toBeLessThanOrEqual(5000 * 1.15)
  })
  it('returns the cheapest complete outfit flagged when the budget is impossible', () => {
    const out = solveOutfits([plan()], { budgetMax: 200, strictness: 'hard', returnK: 3 })
    expect(out.length).toBe(1)
    expect(out[0]!.overBudget).toBe(true)
    expect(out[0]!.cost).toBe(900 + 1200 + 1400)
    expect(out[0]!.items.some((x) => x.role === 'bag')).toBe(false)
  })
  it('is deterministic and skips the optional slot when it lowers f', () => {
    const shared = plan()
    const a = solveOutfits([shared], { budgetMax: 5000, strictness: 'hard', returnK: 3 })
    const b = solveOutfits([shared], { budgetMax: 5000, strictness: 'hard', returnK: 3 })
    expect(a.map((o) => o.items.map((x) => x.item.product.id))).toEqual(
      b.map((o) => o.items.map((x) => x.item.product.id)),
    )
    const noBudget = solveOutfits([plan()], { budgetMax: null, strictness: 'flexible', returnK: 1 })
    expect(noBudget.length).toBe(1)
    // the low-scoring bag lowers the item mean; the solver leaves it out
    expect(noBudget[0]!.items.some((x) => x.role === 'bag')).toBe(false)
  })
  it('uses pinned items and the item bonus', () => {
    const anchor = item({
      price: 1000,
      score: 0.5,
      group: 'outerwear',
      sub: 'denim-jacket',
      colour: ['blue', '#5E7EA8'],
    })
    const out = solveOutfits([plan()], {
      budgetMax: 8000,
      strictness: 'hard',
      returnK: 1,
      pinned: [{ item: anchor, slotKey: 'pinned:outerwear', role: 'outer', pinned: true }],
      itemBonus: (x) => (x.product.subcategory === 'tee' ? 1 : 0),
    })
    expect(out[0]!.items[0]!.item.product.id).toBe(anchor.product.id)
    expect(out[0]!.cost).toBeGreaterThanOrEqual(1000)
    expect(out[0]!.items.some((x) => x.item.product.subcategory === 'tee')).toBe(true)
  })
})

describe('diversify', () => {
  it('rejects near-identical outfits under the Jaccard rule and relaxes when needed', () => {
    const base = solveOutfits([plan()], {
      budgetMax: 9000,
      strictness: 'hard',
      returnK: 1,
      beam: 20,
    })[0]!
    const clone = { ...base, items: [...base.items] }
    const out = diversify([base, clone], 2)
    expect(out.length).toBe(1)
  })
})
