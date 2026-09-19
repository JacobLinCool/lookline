import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import { AESTHETICS } from '../taxonomy'
import { NEIGHBOURS, AESTHETIC_DEPT_MULT, type AestheticSlug } from '../taxonomy/aesthetics'
import { toStyleVector } from '../vectors'
import { generateBrands } from './brands'
import {
  aestheticWeights,
  affinityTerms,
  explainAesthetics,
  homeWeightsOf,
  type AffinityInput,
} from './affinity'

const brands = generateBrands(20260918)
const arlo = brands[0]! // normcore .6, minimalist .4
const riot = brands.find((b) => b.name === 'Riot Club')! // punk .6, grunge .4

const tee: AffinityInput = {
  subcategory: 'tee',
  categoryGroup: 'tops',
  color: 'Navy',
  colorFamily: 'blue',
  material: 'cotton-jersey',
  pattern: 'solid',
  fit: 'regular',
  department: 'men',
}

describe('affinityTerms', () => {
  it('scores the five terms per §3.2', () => {
    const normcore = AESTHETICS.find((a) => a.slug === 'normcore')!
    const t = affinityTerms(normcore, tee, 0.6)
    expect(t).toMatchObject({ cat: 1, col: 1, mat: 1, pat: 1, fit: 1 })
    expect(t.raw).toBeCloseTo(1, 9)
    expect(t.score).toBeCloseTo(1 * 1 * AESTHETIC_DEPT_MULT.normcore.men, 9)
    const mobWife = AESTHETICS.find((a) => a.slug === 'mob-wife')!
    const g = affinityTerms(mobWife, tee, 0)
    expect(g).toMatchObject({ cat: 0, col: 0, mat: 0.25, pat: 1, fit: 0.4 })
    expect(g.raw).toBeCloseTo(0.15 * 0.25 + 0.1 + 0.04, 9)
    expect(g.deptMult).toBe(0.05)
    expect(g.score).toBeCloseTo(g.raw * 0.6 * 0.05, 9)
    // glam favours bodysuit, so a tee scores .5 through the tops group
    const glam = AESTHETICS.find((a) => a.slug === 'glam')!
    expect(affinityTerms(glam, tee, 0).cat).toBe(0.5)
    // partial credit: group of a favourite (.5) and family of a favourite colour (.5)
    const minimalist = AESTHETICS.find((a) => a.slug === 'minimalist')!
    const m = affinityTerms(
      minimalist,
      { ...tee, subcategory: 'hoodie', color: 'dove-grey', colorFamily: 'grey' },
      0,
    )
    expect(m.cat).toBe(0.5)
    expect(m.col).toBe(0.5)
    // colour by slug or name, group and family derived when omitted
    const byName = affinityTerms(normcore, { ...tee, categoryGroup: null, colorFamily: null }, 0)
    expect(byName.cat).toBe(1)
    expect(byName.col).toBe(1)
  })
})

describe('aestheticWeights', () => {
  it('picks the primary by biased score, secondary from NEIGHBOURS and floors the weights', () => {
    const r = aestheticWeights(tee, arlo)
    expect(r.primary).toBe('normcore')
    expect(r.weights.normcore).toBeGreaterThanOrEqual(0.85)
    expect(r.aesthetics[0]).toBe('normcore')
    for (const slug of r.aesthetics.slice(1)) {
      expect(r.weights[slug]).toBeLessThan(r.weights.normcore!)
    }
    // A grey tee ties normcore and minimalist at raw 1.0 at a brand that is home to both;
    // ties resolve to the lower dim (minimalist, dim 0).
    const tie = aestheticWeights({ ...tee, color: 'heather-grey', colorFamily: 'grey' }, arlo)
    expect(tie.primary).toBe('minimalist')
    expect(tie.aesthetics.slice(0, 2)).toEqual(['minimalist', 'normcore'])
    expect(r.aesthetics.length).toBeGreaterThanOrEqual(1)
    expect(r.aesthetics.length).toBeLessThanOrEqual(5)
    if (r.secondary) {
      expect(NEIGHBOURS[r.primary as AestheticSlug]).toContain(r.secondary)
      expect(r.weights[r.secondary]).toBeGreaterThanOrEqual(0.55)
    }
    for (const slug of r.aesthetics) {
      expect(r.weights[slug]).toBeGreaterThanOrEqual(0.15)
      expect(r.weights[slug]).toBeLessThanOrEqual(1)
      expect(r.evidence[slug]!.length).toBeGreaterThanOrEqual(1)
    }
    expect(r.evidence.normcore).toContain('Arlo Basics (brand)')
    expect(r.evidence.normcore!.some((e) => /^(Tee|T-Shirt) \(category\)$/.test(e))).toBe(true)
    expect(r.evidence.normcore!.some((e) => e.endsWith('(colour)'))).toBe(true)
    expect(r.terms).toHaveLength(32)
  })

  it('lets attributes override the home brand (a plaid flannel overshirt at a minimalist brand)', () => {
    const halden = brands.find((b) => b.name === 'Halden Row')! // minimalist .6, scandi .4
    const r = aestheticWeights(
      {
        subcategory: 'overshirt',
        color: 'chocolate',
        material: 'flannel',
        pattern: 'plaid',
        fit: 'relaxed',
        department: 'men',
      },
      halden,
    )
    expect(['workwear', 'grunge']).toContain(r.primary)
    expect(r.aesthetics[0]).toBe(r.primary)
  })

  it('falls back to a home aesthetic when nothing favours the subcategory', () => {
    const r = aestheticWeights(
      {
        subcategory: 'tuxedo',
        color: 'jet-black',
        material: 'wool',
        pattern: 'solid',
        fit: 'slim',
        department: 'men',
      },
      { name: 'Test', homeAesthetics: ['kidcore'] },
    )
    // minimalist and corporate-chic both reach S_cat .5 through the tailoring group with the
    // same colour/material/pattern/fit hits; the tie resolves to the lower dim.
    expect(r.primary).toBe('minimalist')
    expect(r.terms.find((t) => t.slug === 'corporate-chic')!.score).toBeCloseTo(
      r.terms.find((t) => t.slug === 'minimalist')!.score,
      9,
    )
    const none = aestheticWeights(
      {
        subcategory: 'unknown-thing',
        categoryGroup: null,
        color: 'nothing',
        material: 'x',
        pattern: 'y',
        department: 'kids',
      },
      { name: 'Test', homeAesthetics: ['balletcore', 'goth'] },
    )
    expect(none.primary).toBe('balletcore')
    expect(none.weights.balletcore).toBe(0.85)
    expect(none.evidence.balletcore).toEqual(['Test (brand)'])
  })

  it('respects department multipliers (no balletcore primary for men)', () => {
    const r = aestheticWeights(
      {
        subcategory: 'cardigan',
        color: 'blush',
        material: 'mohair-blend',
        pattern: 'solid',
        fit: 'fitted',
        department: 'men',
      },
      riot,
    )
    expect(r.primary).not.toBe('balletcore')
  })

  it('every kept aesthetic has evidence and secondary ∈ NEIGHBOURS over random inputs', () => {
    const rng = createRng(77)
    const subcategories = Array.from(new Set(AESTHETICS.flatMap((a) => a.favours.subcategories)))
    const colours = Array.from(new Set(AESTHETICS.flatMap((a) => a.favours.colorFamilies)))
    const materials = Array.from(new Set(AESTHETICS.flatMap((a) => a.favours.materials)))
    const patterns = Array.from(new Set(AESTHETICS.flatMap((a) => a.favours.patterns)))
    const fits = Array.from(new Set(AESTHETICS.flatMap((a) => a.favours.fits)))
    const departments = ['women', 'men', 'unisex', 'kids'] as const
    let strong = 0
    const n = 2000
    for (let i = 0; i < n; i++) {
      const brand = rng.pick(brands)
      const input: AffinityInput = {
        subcategory: rng.pick(subcategories),
        color: rng.pick(['optic-white', 'jet-black', 'navy', 'blush', 'olive', 'camel', 'gold']),
        colorFamily: rng.pick(colours),
        material: rng.pick(materials),
        pattern: rng.pick(patterns),
        fit: rng.pick(fits),
        department: rng.pick(departments),
      }
      const r = aestheticWeights(input, brand)
      expect(r.aesthetics[0]).toBe(r.primary)
      expect(r.aesthetics.length).toBeLessThanOrEqual(5)
      expect(new Set(r.aesthetics).size).toBe(r.aesthetics.length)
      if (r.secondary) expect(NEIGHBOURS[r.primary as AestheticSlug]).toContain(r.secondary)
      for (const slug of r.aesthetics) expect(r.evidence[slug]!.length).toBeGreaterThan(0)
      const primaryTerms = r.terms.find((t) => t.slug === r.primary)!
      if (primaryTerms.raw >= 0.6) strong++
      // vector round trip: argmax of dims 0–31 is the primary at ≥ .85, ≤ 5 non-zero
      const v = toStyleVector({ aesthetics: r.weights, colorFamily: 'black', axes: {} })
      const block = v.slice(0, 32)
      expect(block.filter((x) => x > 0).length).toBeLessThanOrEqual(5)
      const top = block.indexOf(Math.max(...block))
      expect(AESTHETICS[top]!.slug).toBe(r.primary)
      expect(block[top]).toBeGreaterThanOrEqual(0.85)
    }
    expect(strong / n).toBeGreaterThan(0.5)
  })

  it('homeWeightsOf defaults', () => {
    expect([...homeWeightsOf({ homeAesthetics: ['a', 'b'] })]).toEqual([
      ['a', 0.6],
      ['b', 0.4],
    ])
    expect([...homeWeightsOf({ homeAesthetics: ['a'] })]).toEqual([['a', 1]])
    expect([...homeWeightsOf({ homeAesthetics: ['a', 'b'], homeWeights: [0.7, 0.3] })]).toEqual([
      ['a', 0.7],
      ['b', 0.3],
    ])
  })
})

describe('explainAesthetics', () => {
  it('returns weight + evidence per non-zero aesthetic, reading weights from the style vector', () => {
    const r = aestheticWeights(tee, arlo)
    const styleVector = toStyleVector({ aesthetics: r.weights, colorFamily: 'blue', axes: {} })
    const out = explainAesthetics(
      {
        subcategory: 'tee',
        categoryGroup: 'tops',
        colorName: 'Navy',
        colorFamily: 'blue',
        material: 'cotton-jersey',
        pattern: 'solid',
        fit: 'regular',
        brandId: 1,
        department: 'men',
        styleVector,
      },
      brands,
    )
    expect(out[0]).toMatchObject({ slug: 'normcore', weight: r.weights.normcore })
    for (const row of out) {
      expect(row.evidence.length).toBeGreaterThan(0)
      expect(row.weight).toBeGreaterThan(0)
    }
    // Falls back to the default brand list (home aesthetics do not depend on the seed).
    const again = explainAesthetics({
      subcategory: 'tee',
      colorName: 'Navy',
      material: 'cotton-jersey',
      pattern: 'solid',
      fit: 'regular',
      brandId: 1,
      department: 'men',
    })
    expect(again.map((x) => x.slug)).toEqual(out.map((x) => x.slug))
  })
})
