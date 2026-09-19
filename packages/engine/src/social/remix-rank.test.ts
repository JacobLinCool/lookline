import { describe, expect, it } from 'vitest'
import { deriveLookStyle } from '../looks/style'
import { fixtureLook, makeProduct } from '../looks/fixtures'
import {
  chooseRemixItems,
  filterBySize,
  keptAesthetics,
  keptPalette,
  remixExplanation,
  scoreCandidate,
  slotBudget,
  type RemixContext,
  type RemixProduct,
  type RemixSlot,
} from './remix-rank'

const withBrand = (p: ReturnType<typeof makeProduct>): RemixProduct => ({
  ...p,
  brandName: 'Brand',
})

function slots(): RemixSlot[] {
  const [knit, trousers] = fixtureLook().map(withBrand)
  const tops = [
    makeProduct({
      id: 101,
      name: 'Mono Merino Sweater',
      categoryGroup: 'tops',
      outfitRole: 'top',
      subcategory: 'crewneck-sweater',
      colorName: 'Ecru',
      colorHex: '#E9E3D3',
      colorFamily: 'white',
      aesthetics: ['quiet-luxury', 'scandi'],
      price: 2800,
      popularity: 0.8,
    }),
    makeProduct({
      id: 102,
      name: 'Neon Graphic Hoodie',
      categoryGroup: 'tops',
      outfitRole: 'top',
      subcategory: 'hoodie',
      colorName: 'Tangerine',
      colorHex: '#F07E26',
      colorFamily: 'yellow-orange',
      aesthetics: ['streetwear', 'y2k'],
      price: 1900,
      popularity: 0.9,
    }),
    makeProduct({
      id: 103,
      name: 'Stone Cashmere Crewneck',
      categoryGroup: 'tops',
      outfitRole: 'top',
      subcategory: 'crewneck-sweater',
      colorName: 'Stone',
      colorHex: '#B8AD9A',
      colorFamily: 'neutral',
      aesthetics: ['quiet-luxury', 'minimalist'],
      price: 9000,
      popularity: 0.4,
    }),
    makeProduct({
      id: 104,
      name: 'Boxy Tee',
      categoryGroup: 'tops',
      outfitRole: 'top',
      subcategory: 'tee',
      colorName: 'Optic White',
      colorHex: '#F8F8F6',
      colorFamily: 'white',
      aesthetics: ['normcore'],
      price: 600,
      popularity: 0.2,
    }),
  ].map(withBrand)
  const bottoms = [
    makeProduct({
      id: 201,
      name: 'Pleated Wool Trousers',
      categoryGroup: 'bottoms',
      outfitRole: 'bottom',
      subcategory: 'wide-leg-trousers',
      colorName: 'Charcoal',
      colorHex: '#4A4B50',
      colorFamily: 'grey',
      aesthetics: ['quiet-luxury', 'corporate-chic'],
      price: 3600,
      popularity: 0.6,
    }),
    makeProduct({
      id: 202,
      name: 'Cargo Pants',
      categoryGroup: 'bottoms',
      outfitRole: 'bottom',
      subcategory: 'cargo-pants',
      colorName: 'Olive',
      colorHex: '#6E6C3E',
      colorFamily: 'green',
      aesthetics: ['gorpcore'],
      price: 2200,
      popularity: 0.7,
    }),
    makeProduct({
      id: 203,
      name: 'Slate Midi Skirt',
      categoryGroup: 'bottoms',
      outfitRole: 'bottom',
      subcategory: 'midi-skirt',
      colorName: 'Slate',
      colorHex: '#6B7280',
      colorFamily: 'grey',
      aesthetics: ['minimalist', 'scandi'],
      price: 1500,
      popularity: 0.5,
    }),
  ].map(withBrand)
  return [
    { source: knit!, role: 'top', group: 'tops', candidates: tops },
    { source: trousers!, role: 'bottom', group: 'bottoms', candidates: bottoms },
  ]
}

function ctx(overrides: Partial<RemixContext> = {}): RemixContext {
  return {
    sourceVector: deriveLookStyle(fixtureLook()).styleVector,
    preferenceVector: null,
    department: 'women',
    sizes: { alpha: 'M', 'numeric-waist': '28' },
    budget: null,
    ...overrides,
  }
}

describe('remix ranking', () => {
  it('scores with factors whose contributions sum to the score', () => {
    const s = slots()[0]!
    const c = ctx()
    for (const cand of s.candidates) {
      const item = scoreCandidate(cand, s, c, 0.9)
      const sum = item.explanation.factors.reduce((a, f) => a + f.contribution, 0)
      expect(Math.abs(sum - item.score)).toBeLessThan(1e-6)
      expect(item.role).toBe('top')
      expect(item.explanation.summary).toContain('instead of Ridge Cashmere Crewneck')
      expect(item.explanation.factors.map((f) => f.factor)).toEqual([
        'style_similarity',
        'user_preference',
        'attribute_match',
        'budget_fit',
        'popularity_prior',
      ])
    }
  })

  it('prefers pieces that keep the source mood and fit the remixer', () => {
    const free = chooseRemixItems(slots(), ctx())
    expect(free.map((i) => i.role)).toEqual(['top', 'bottom'])
    // no budget: the stone crewneck keeps both the neutral palette and the subcategory
    expect(free[0]!.product.id).toBe('0000000103')
    expect(free[1]!.product.id).toBe('0000000201')
    expect(free[0]!.explanation.summary).toMatch(/instead of/)
    expect(free.every((item) => item.product.id !== '0000000102')).toBe(true)
    // with a budget the NT$9,000 crewneck loses to the ecru merino sweater in size M
    const budgeted = chooseRemixItems(slots(), ctx({ budget: 8000 }))
    expect(budgeted[0]!.product.id).toBe('0000000101')
    expect(budgeted.reduce((s, item) => s + item.product.price, 0)).toBeLessThanOrEqual(8000)
  })

  // Sizes no longer filter — the catalogue ships none, so every candidate is kept.
  it('keeps every candidate and swaps to cheaper options under a budget', () => {
    expect(filterBySize(slots()[0]!.candidates, ctx()).map((p) => p.id)).toEqual([
      '0000000101',
      '0000000102',
      '0000000103',
      '0000000104',
    ])
    const cheap = chooseRemixItems(slots(), ctx({ budget: 4000 }))
    const total = cheap.reduce((s, item) => s + item.product.price, 0)
    expect(total).toBeLessThanOrEqual(4000)
    expect(slotBudget('tops', 10000)).toBe(3000)
    expect(slotBudget('tops', null)).toBeNull()
  })

  it('uses the learned preference when present', () => {
    const streetwear = deriveLookStyle([slots()[0]!.candidates[1]!]).styleVector
    const items = chooseRemixItems(slots(), ctx({ preferenceVector: streetwear, sizes: {} }))
    const pref = items[0]!.explanation.factors.find((f) => f.factor === 'user_preference')!
    expect(pref.value).toBeGreaterThan(0)
    expect(pref.evidence).toMatch(/learned taste/)
  })

  it('reports kept aesthetics, palette and a kept/swapped explanation', () => {
    const s = slots()
    const items = chooseRemixItems(s, ctx())
    const kept = keptAesthetics(['quiet-luxury', 'minimalist', 'preppy'], items)
    expect(kept).toEqual(['quiet-luxury', 'minimalist'])
    const palette = keptPalette(fixtureLook().map(withBrand), items)
    expect(palette).toEqual(['#D9CDB8', '#4A4B50'])
    const explanation = remixExplanation(s, items, kept, palette)
    expect(explanation.summary).toMatch(
      /^Kept: palette neutral\/grey, aesthetics Quiet Luxury, Minimalist; swapped: /,
    )
    expect(explanation.summary).toMatch(/\(new colour\/brand\)/)
    const sum = explanation.factors.reduce((a, f) => a + f.contribution, 0)
    const mean = items.reduce((a, item) => a + item.score, 0) / items.length
    expect(Math.abs(sum - mean)).toBeLessThan(1e-2)
    expect(remixExplanation(s, [], [], []).summary).toMatch(/No pieces/)
    expect(keptAesthetics(['boho'], [])).toEqual(['boho'])
  })
})
