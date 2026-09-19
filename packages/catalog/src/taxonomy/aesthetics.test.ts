import { describe, expect, it } from 'vitest'
import { COLORS, FITS, MATERIALS, PATTERNS, SUBCATEGORIES } from './index'
import {
  AESTHETIC_BG,
  AESTHETIC_COLOR_PRIOR,
  AESTHETIC_COLORS,
  AESTHETIC_DEPT_MULT,
  AESTHETIC_META,
  AESTHETIC_PRIOR,
  AESTHETIC_SLUGS,
  AESTHETICS,
  ATTRIBUTE_BOOSTS,
  COLOR_SLUG_FAMILY,
  HOME_BRAND_BIAS,
  NEIGHBOURS,
  SUBCATEGORY_GROUP,
  aestheticBySlug,
  attributeBoost,
  neighboursOf,
} from './aesthetics'

const SPEC_ORDER = [
  'minimalist',
  'quiet-luxury',
  'streetwear',
  'y2k',
  'grunge',
  'gorpcore',
  'preppy',
  'cottagecore',
  'coastal',
  'dark-academia',
  'balletcore',
  'techwear',
  'boho',
  'athleisure',
  'romantic',
  'retro-70s',
  'workwear',
  'clean-girl',
  'avant-garde',
  'coquette',
  'normcore',
  'scandi',
  'city-boy',
  'glam',
  'punk',
  'mob-wife',
  'western',
  'resort',
  'goth',
  'kidcore',
  'corporate-chic',
  'k-street',
]

describe('AESTHETICS', () => {
  it('has 32 rows with index = position in spec order and unique slugs', () => {
    expect(AESTHETICS).toHaveLength(32)
    AESTHETICS.forEach((a, i) => expect(a.index).toBe(i))
    expect(AESTHETICS.map((a) => a.slug)).toEqual(SPEC_ORDER)
    expect(new Set(AESTHETICS.map((a) => a.slug)).size).toBe(32)
    expect(new Set(AESTHETICS.map((a) => a.name)).size).toBe(32)
    expect(AESTHETIC_SLUGS).toEqual(SPEC_ORDER)
  })

  it('every row is bilingual with a definition and axes', () => {
    for (const a of AESTHETICS) {
      expect(a.labelZh.length).toBeGreaterThan(0)
      expect(a.synonyms.length).toBeGreaterThan(0)
      expect(a.definition.length).toBeGreaterThan(10)
      expect(typeof a.axes.trendiness).toBe('number')
      expect(typeof a.axes.formality).toBe('number')
      expect(typeof a.axes.boldness).toBe('number')
      expect(a.axes.trendiness).toBeGreaterThanOrEqual(0)
      expect(a.axes.trendiness).toBeLessThanOrEqual(1)
      expect(a.axes.boldness).toBeGreaterThanOrEqual(0)
      expect(a.axes.boldness).toBeLessThanOrEqual(1)
    }
  })

  it('favours are non-empty string lists and derived groups/families resolve', () => {
    for (const a of AESTHETICS) {
      const f = a.favours
      for (const list of [f.subcategories, f.materials, f.patterns, f.fits]) {
        expect(list.length).toBeGreaterThan(0)
        for (const s of list) expect(typeof s).toBe('string')
      }
      expect(f.categoryGroups.length).toBeGreaterThan(0)
      expect(f.colorFamilies.length).toBeGreaterThan(0)
      for (const sub of f.subcategories) expect(SUBCATEGORY_GROUP[sub], sub).toBeDefined()
      for (const c of AESTHETIC_COLORS[a.slug as keyof typeof AESTHETIC_COLORS]) {
        expect(COLOR_SLUG_FAMILY[c], c).toBeDefined()
      }
    }
  })

  it('favourite ids resolve against the taxonomy tables when those are filled', () => {
    if (SUBCATEGORIES.length > 0) {
      const slugs = new Set(SUBCATEGORIES.map((s) => s.slug))
      for (const a of AESTHETICS)
        for (const s of a.favours.subcategories) expect(slugs, s).toContain(s)
      for (const s of Object.keys(SUBCATEGORY_GROUP)) expect(slugs, s).toContain(s)
    }
    if (COLORS.length > 0) {
      const names = new Set(COLORS.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')))
      for (const c of Object.keys(COLOR_SLUG_FAMILY)) expect(names, c).toContain(c)
    }
    if (MATERIALS.length > 0) {
      const slugs = new Set(MATERIALS.map((m) => m.slug))
      for (const a of AESTHETICS) for (const m of a.favours.materials) expect(slugs, m).toContain(m)
    }
    if (PATTERNS.length > 0) {
      const slugs = new Set(PATTERNS.map((p) => p.slug))
      for (const a of AESTHETICS) for (const p of a.favours.patterns) expect(slugs, p).toContain(p)
    }
    if (FITS.length > 0) {
      const slugs = new Set([
        ...FITS.map((f) => f.slug),
        'a-line',
        'bodycon',
        'shift',
        'fit-and-flare',
        'wrap',
        'slip',
        'column',
        'tiered',
        'pencil',
        'pleated',
      ])
      for (const a of AESTHETICS) for (const f of a.favours.fits) expect(slugs, f).toContain(f)
    }
  })
})

describe('extra tables', () => {
  it('NEIGHBOURS has 4 existing slugs per aesthetic, none self-referencing', () => {
    for (const a of AESTHETICS) {
      const n = NEIGHBOURS[a.slug as keyof typeof NEIGHBOURS]
      expect(n).toHaveLength(4)
      for (const s of n) {
        expect(typeof s).toBe('string')
        expect(aestheticBySlug(s), s).toBeDefined()
        expect(s).not.toBe(a.slug)
      }
      expect(neighboursOf(a.slug)).toEqual(n)
    }
    expect(neighboursOf('nope')).toEqual([])
  })

  it('priors sum to 1 ± 1e-6', () => {
    const sum = Object.values(AESTHETIC_PRIOR).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6)
    expect(AESTHETIC_META.reduce((a, m) => a + m.prior, 0)).toBeCloseTo(1, 6)
  })

  it('department multipliers and backgrounds are well-formed', () => {
    for (const a of AESTHETICS) {
      const d = AESTHETIC_DEPT_MULT[a.slug as keyof typeof AESTHETIC_DEPT_MULT]
      for (const k of ['women', 'men', 'unisex', 'kids'] as const) {
        expect(d[k]).toBeGreaterThanOrEqual(0)
        expect(d[k]).toBeLessThanOrEqual(1)
      }
      expect(AESTHETIC_BG[a.slug as keyof typeof AESTHETIC_BG]).toMatch(/^#[0-9A-F]{6}$/)
    }
    expect(AESTHETIC_DEPT_MULT.kidcore.kids).toBe(1)
    expect(AESTHETIC_DEPT_MULT.balletcore.men).toBe(0)
  })

  it('colour priors are in (0, 1] with a 1 per aesthetic', () => {
    for (const a of AESTHETICS) {
      const p = AESTHETIC_COLOR_PRIOR[a.slug as keyof typeof AESTHETIC_COLOR_PRIOR]
      const values = Object.values(p)
      expect(values.length).toBeGreaterThan(0)
      expect(Math.max(...values)).toBe(1)
      for (const v of values) expect(v).toBeGreaterThan(0)
    }
    expect(AESTHETIC_COLOR_PRIOR.goth.black).toBe(1)
  })

  it('attribute boosts resolve, including prefix matches', () => {
    for (const table of Object.values(ATTRIBUTE_BOOSTS)) {
      for (const values of Object.values(table)) {
        for (const mult of Object.values(values)) expect(mult).toBeGreaterThan(1)
      }
    }
    expect(attributeBoost('romantic', 'sleeve', 'puff')).toBe(3)
    expect(attributeBoost('avant-garde', 'buttons', 'double-6')).toBe(2)
    expect(attributeBoost('avant-garde', 'buttons', 'single-2')).toBe(1)
    expect(attributeBoost('kidcore', 'closure', 'velcro')).toBe(5)
    expect(attributeBoost('minimalist', 'closure', 'velcro')).toBe(1)
    expect(HOME_BRAND_BIAS.home).toBe(1)
    expect(HOME_BRAND_BIAS.other).toBe(0.6)
  })
})
