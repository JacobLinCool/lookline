import { describe, expect, it } from 'vitest'
import type { ColorFamily } from '../types'
import { AESTHETICS } from './aesthetics'
import { ATTRIBUTE_SCHEMAS, schemaColumns } from './attribute-schemas'
import {
  CATEGORIES,
  CATEGORY_GROUP_DEFS,
  CATEGORY_GROUPS,
  DEPARTMENTS,
  GROUP_META,
  SILHOUETTE_IDS,
  SUBCATEGORIES,
  SUBCAT_ECON,
  categoryOf,
  findCategory,
  findSubcategory,
  subcategoriesFor,
} from './categories'
import {
  COLOR_FAMILIES,
  COLOR_FAMILY_DEFS,
  COLOR_PRIOR,
  COLORS,
  DEPT_COLOR_MULT,
  JEANS_COLORS,
  colorByHex,
  colorFamilyWeight,
  colorsInFamily,
  findColor,
} from './colors'
import {
  CLOSURES,
  FITS,
  LENGTHS,
  NECKLINES,
  SILHOUETTE_VALUES,
  SLEEVES,
  fitAdjustments,
} from './fits'
import { AXES, findAesthetic } from './index'
import {
  KIDS_EXCLUDED_MATERIALS,
  MATERIAL_PRIOR,
  MATERIALS,
  findMaterial,
  materialsFor,
} from './materials'
import {
  ADJACENT_SEASON,
  OCCASIONS,
  SEASON_DEFS,
  SEASON_PRIOR,
  SEASONS,
  occasionFavours,
  seasonPriorFor,
} from './occasions'
import { MATERIAL_PATTERN_RULES, PATTERNLESS_MATERIALS, PATTERNS, patternsFor } from './patterns'
import { SIZE_RUNS, medianSize, sizeRunFor, sizeSystemFor } from './sizes'

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

const expectUniqueKebabSlugs = (slugs: readonly string[]): void => {
  expect(new Set(slugs).size).toBe(slugs.length)
  for (const slug of slugs) expect(slug, `slug ${slug}`).toMatch(KEBAB)
}

const expectLexical = (
  rows: ReadonlyArray<{ labelZh: string; synonyms: readonly string[] }>,
): void => {
  for (const row of rows) {
    expect(row.labelZh.length).toBeGreaterThan(0)
    expect(row.synonyms.length).toBeGreaterThan(0)
    for (const s of row.synonyms) {
      expect(s).toBe(s.toLowerCase())
      expect(s.trim()).toBe(s)
      expect(s.length).toBeGreaterThan(0)
    }
  }
}

describe('fixed orders (docs/ARCHITECTURE.md)', () => {
  it('CATEGORY_GROUPS matches dims 52–63', () => {
    expect([...CATEGORY_GROUPS]).toEqual([
      'tops',
      'bottoms',
      'dresses',
      'outerwear',
      'footwear',
      'bags',
      'accessories',
      'jewelry',
      'activewear',
      'swimwear',
      'loungewear',
      'tailoring',
    ])
    expect(CATEGORY_GROUP_DEFS.map((g) => g.slug)).toEqual([...CATEGORY_GROUPS])
  })

  it('COLOR_FAMILIES matches dims 32–43', () => {
    expect([...COLOR_FAMILIES]).toEqual([
      'black',
      'white',
      'grey',
      'neutral',
      'brown',
      'red',
      'pink',
      'yellow-orange',
      'green',
      'blue',
      'purple',
      'multi-metallic',
    ])
    expect(COLOR_FAMILY_DEFS.map((f) => f.slug)).toEqual([...COLOR_FAMILIES])
  })

  it('AXES matches dims 44–51', () => {
    expect([...AXES]).toEqual([
      'formality',
      'warmth',
      'boldness',
      'structure',
      'price-tier',
      'coverage',
      'texture',
      'trendiness',
    ])
  })

  it('DEPARTMENTS and SEASONS are the contract tuples', () => {
    expect([...DEPARTMENTS]).toEqual(['women', 'men', 'unisex', 'kids'])
    expect([...SEASONS]).toEqual(['spring', 'summer', 'autumn', 'winter', 'all-season'])
    expect(SEASON_DEFS.map((s) => s.slug)).toEqual([...SEASONS])
  })
})

describe('category groups and categories', () => {
  it('has 12 groups with meta and 46 categories', () => {
    expect(CATEGORY_GROUP_DEFS).toHaveLength(12)
    expect(CATEGORIES).toHaveLength(46)
    expectUniqueKebabSlugs(CATEGORIES.map((c) => c.slug))
    expectLexical(CATEGORY_GROUP_DEFS)
    for (const g of CATEGORY_GROUP_DEFS) {
      expect(g.solidShare).toBeGreaterThan(0)
      expect(g.solidShare).toBeLessThanOrEqual(1)
      expect(GROUP_META[g.slug]).toBe(g)
    }
  })

  it('every category belongs to a group and lists at least one existing subcategory', () => {
    const listed: string[] = []
    for (const c of CATEGORIES) {
      expect(CATEGORY_GROUPS).toContain(c.group)
      expect(c.labelZh.length).toBeGreaterThan(0)
      expect(c.subcategories.length).toBeGreaterThan(0)
      for (const s of c.subcategories) {
        const sub = findSubcategory(s)
        expect(sub, `subcategory ${s} of ${c.slug}`).toBeDefined()
        expect(sub?.category).toBe(c.slug)
        expect(sub?.group).toBe(c.group)
        listed.push(s)
      }
    }
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed).toHaveLength(109)
    expect(findCategory('nope')).toBeUndefined()
  })
})

describe('subcategories', () => {
  it('has 109 rows with unique kebab slugs and injective nouns', () => {
    expect(SUBCATEGORIES).toHaveLength(109)
    expectUniqueKebabSlugs(SUBCATEGORIES.map((s) => s.slug))
    expect(new Set(SUBCATEGORIES.map((s) => s.noun)).size).toBe(109)
    expect(new Set(SUBCATEGORIES.map((s) => s.name)).size).toBe(109)
    expectLexical(SUBCATEGORIES)
  })

  it('every row resolves its category and group and carries a known silhouette and schema', () => {
    for (const s of SUBCATEGORIES) {
      const category = findCategory(s.category)
      expect(category, s.slug).toBeDefined()
      expect(category?.subcategories).toContain(s.slug)
      expect(category?.group).toBe(s.group)
      expect(categoryOf(s.slug)).toBe(category)
      expect(CATEGORY_GROUPS).toContain(s.group)
      expect(s.silhouetteId.length).toBeGreaterThan(0)
      expect(SILHOUETTE_IDS, `${s.slug} silhouette ${s.silhouetteId}`).toContain(s.silhouetteId)
      expect(ATTRIBUTE_SCHEMAS[s.schema], `${s.slug} schema ${s.schema}`).toBeDefined()
      expect(s.departments.length).toBeGreaterThan(0)
      for (const d of s.departments) expect(DEPARTMENTS).toContain(d)
      expect(new Set(s.departments).size).toBe(s.departments.length)
      expect(['alpha', 'numeric-waist', 'eu-shoe', 'one-size']).toContain(s.sizeSystem)
      expect(['A', 'S', 'W', 'T', 'Y']).toContain(s.seasonCode)
      expect(s.weight).toBeGreaterThan(0)
    }
  })

  it('carries the §5.1 axis bases and economics', () => {
    for (const s of SUBCATEGORIES) {
      const econ = SUBCAT_ECON[s.slug]
      expect(econ).toBeDefined()
      expect(s.formality).toBe(econ?.formality)
      expect(s.coverage).toBe(econ?.coverage)
      expect(s.structure).toBe(econ?.structure)
      expect(s.basePrice).toBe(econ?.basePrice)
      expect(Number.isInteger(s.basePrice)).toBe(true)
      expect(s.sigma).toBeGreaterThan(0)
      expect(s.minTier).toBeGreaterThanOrEqual(0)
      expect(s.minTier).toBeLessThanOrEqual(3)
      for (const v of [s.formality, s.coverage, s.structure]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
    expect(Object.keys(SUBCAT_ECON)).toHaveLength(109)
    expect(findSubcategory('tee')?.basePrice).toBe(890)
    expect(findSubcategory('tuxedo')?.formality).toBe(1)
    expect(findSubcategory('tote')?.coverage).toBe(0)
  })

  it('derives attributes from the schema columns', () => {
    for (const s of SUBCATEGORIES) {
      const schema = ATTRIBUTE_SCHEMAS[s.schema]
      expect(schema).toBeDefined()
      if (!schema) continue
      expect([...s.attributes]).toEqual(schemaColumns(schema))
    }
    expect([...(findSubcategory('tee')?.attributes ?? [])]).toEqual([
      'fit',
      'length',
      'neckline',
      'sleeve',
      'closure',
    ])
    expect([...(findSubcategory('mini-skirt')?.attributes ?? [])]).toEqual([
      'silhouette',
      'length',
      'closure',
    ])
    expect([...(findSubcategory('necklace')?.attributes ?? [])]).toEqual([])
  })

  it('subcategoriesFor filters by group and department', () => {
    const tops = subcategoriesFor('tops')
    expect(tops.map((s) => s.slug)).toContain('tee')
    expect(tops.every((s) => s.group === 'tops')).toBe(true)
    const menTops = subcategoriesFor('tops', 'men')
    expect(menTops.map((s) => s.slug)).not.toContain('blouse')
    expect(menTops.map((s) => s.slug)).toContain('tee')
    expect(subcategoriesFor('jewelry', 'kids')).toHaveLength(0)
  })

  it('numeric-waist rows are exactly the five trouser subcategories', () => {
    expect(
      SUBCATEGORIES.filter((s) => s.sizeSystem === 'numeric-waist').map((s) => s.slug),
    ).toEqual(['jeans', 'chinos', 'wide-leg-trousers', 'cargo-pants', 'tailored-trousers'])
  })
})

describe('colours', () => {
  it('has 48 colours, unique hex/slug/name, exactly 4 per family in family order', () => {
    expect(COLORS).toHaveLength(48)
    expectUniqueKebabSlugs(COLORS.map((c) => c.slug))
    expect(new Set(COLORS.map((c) => c.hex)).size).toBe(48)
    expect(new Set(COLORS.map((c) => c.name)).size).toBe(48)
    expectLexical(COLORS)
    for (const c of COLORS) {
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/)
      expect(COLOR_FAMILIES).toContain(c.family)
      expect(c.boldness).toBeGreaterThanOrEqual(0)
      expect(c.boldness).toBeLessThanOrEqual(1)
      expect(['L', 'M', 'D']).toContain(c.lightness)
      expect(c.trend).toBeGreaterThanOrEqual(0)
      expect(c.trend).toBeLessThanOrEqual(1)
    }
    const families = COLORS.map((c) => c.family)
    const order = COLOR_FAMILIES.flatMap((f) => [f, f, f, f])
    expect(families).toEqual(order)
    for (const f of COLOR_FAMILIES) expect(colorsInFamily(f)).toHaveLength(4)
  })

  it('findColor accepts name or slug; colorByHex is case-insensitive', () => {
    expect(findColor('Jet Black')?.slug).toBe('jet-black')
    expect(findColor('jet-black')?.name).toBe('Jet Black')
    expect(findColor('jet black')?.slug).toBe('jet-black')
    expect(findColor('nope')).toBeUndefined()
    expect(colorByHex('#111114')?.slug).toBe('jet-black')
    expect(colorByHex('#f8f8f6')?.slug).toBe('optic-white')
  })

  it('COLOR_PRIOR covers every group × family with positive weights; DEPT multipliers apply', () => {
    for (const g of CATEGORY_GROUPS) {
      for (const f of COLOR_FAMILIES) expect(COLOR_PRIOR[g][f]).toBeGreaterThan(0)
    }
    expect(COLOR_PRIOR.jewelry['multi-metallic']).toBe(65)
    expect(COLOR_PRIOR.bottoms.blue).toBe(24)
    expect(DEPT_COLOR_MULT.women).toEqual({})
    expect(colorFamilyWeight('tops', 'men', 'pink')).toBeCloseTo(6 * 0.3)
    expect(colorFamilyWeight('tops', 'women', 'pink')).toBe(6)
    expect(colorFamilyWeight('footwear', 'kids', 'black')).toBeCloseTo(11)
    for (const c of JEANS_COLORS) expect(findColor(c)).toBeDefined()
  })
})

describe('materials', () => {
  it('has 37 materials with valid groups and ranges', () => {
    expect(MATERIALS).toHaveLength(37)
    expectUniqueKebabSlugs(MATERIALS.map((m) => m.slug))
    expectLexical(MATERIALS)
    for (const m of MATERIALS) {
      expect(m.groups.length).toBeGreaterThan(0)
      for (const g of m.groups) expect(CATEGORY_GROUPS).toContain(g)
      for (const v of [m.warmth, m.texture, m.structure]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      expect(m.priceFactor).toBeGreaterThan(0)
      expect(m.adj.length).toBeGreaterThan(0)
    }
    expect(findMaterial('linen')?.labelZh).toBe('亞麻')
    for (const m of KIDS_EXCLUDED_MATERIALS) expect(findMaterial(m)).toBeDefined()
    for (const m of PATTERNLESS_MATERIALS) expect(findMaterial(m)).toBeDefined()
    for (const m of Object.keys(MATERIAL_PATTERN_RULES)) expect(findMaterial(m)).toBeDefined()
  })

  it('MATERIAL_PRIOR covers every subcategory and references real materials', () => {
    for (const s of SUBCATEGORIES) {
      const prior = MATERIAL_PRIOR[s.slug]
      expect(prior, s.slug).toBeDefined()
      for (const [m, w] of Object.entries(prior ?? {})) {
        expect(findMaterial(m), `${s.slug}: ${m}`).toBeDefined()
        expect(w).toBeGreaterThan(0)
      }
    }
    expect(MATERIAL_PRIOR['performance-tee']).toEqual({
      'performance-knit': 60,
      'recycled-polyester': 25,
      mesh: 15,
    })
    expect(MATERIAL_PRIOR.tee?.['cotton-jersey']).toBe(60)
  })

  it('materialsFor merges the prior with group-applicable materials and applies kids exclusions', () => {
    const tee = materialsFor('tee', 'women')
    const byslug = Object.fromEntries(tee.map(([m, w]) => [m.slug, w]))
    expect(byslug['cotton-jersey']).toBe(60)
    expect(byslug.linen).toBe(6)
    expect(byslug.wool).toBe(1)
    expect(byslug.leather).toBeUndefined()
    const kidsTee = materialsFor('tee', 'kids').map(([m]) => m.slug)
    expect(kidsTee).not.toContain('silk')
    expect(kidsTee).not.toContain('lace')
    const kidsSandal = materialsFor('flat-sandal', 'kids').map(([m]) => m.slug)
    expect(kidsSandal).toContain('shearling')
    expect(materialsFor('nope', 'women')).toEqual([])
  })
})

describe('patterns', () => {
  it('has 15 patterns; solid applies everywhere', () => {
    expect(PATTERNS).toHaveLength(15)
    expectUniqueKebabSlugs(PATTERNS.map((p) => p.slug))
    expectLexical(PATTERNS)
    expect(PATTERNS[0]?.slug).toBe('solid')
    expect([...(PATTERNS[0]?.groups ?? [])]).toEqual([...CATEGORY_GROUPS])
    for (const p of PATTERNS) {
      for (const g of p.groups) expect(CATEGORY_GROUPS).toContain(g)
      expect(p.boldness).toBeGreaterThanOrEqual(0)
      expect(p.boldness).toBeLessThanOrEqual(1)
      expect(p.prior).toBeGreaterThan(0)
    }
  })

  it('patternsFor applies group and material rules', () => {
    expect(patternsFor('jewelry').map((p) => p.slug)).toEqual(['solid', 'geometric'])
    expect(patternsFor('footwear', 'leather').map((p) => p.slug)).toEqual(['solid'])
    expect(patternsFor('dresses', 'velvet').map((p) => p.slug)).toEqual(['solid', 'leopard'])
    expect(patternsFor('tops', 'denim').map((p) => p.slug)).toEqual(['solid', 'breton-stripe'])
    expect(patternsFor('bottoms', 'denim').map((p) => p.slug)).toEqual(['solid', 'camo'])
    expect(patternsFor('outerwear', 'denim').map((p) => p.slug)).toEqual(['solid'])
    expect(patternsFor('tops', 'cotton-jersey').map((p) => p.slug)).toContain('tie-dye')
  })
})

describe('fits and column vocabularies', () => {
  it('has the §2.5 counts with unique kebab slugs', () => {
    expect(FITS).toHaveLength(12)
    expect(SILHOUETTE_VALUES).toHaveLength(10)
    expect(LENGTHS).toHaveLength(12)
    expect(NECKLINES).toHaveLength(14)
    expect(SLEEVES).toHaveLength(8)
    expect(CLOSURES).toHaveLength(12)
    for (const list of [FITS, SILHOUETTE_VALUES, LENGTHS, NECKLINES, SLEEVES, CLOSURES]) {
      expectUniqueKebabSlugs(list.map((v) => v.slug))
      expectLexical(list)
    }
    for (const f of FITS) {
      expect(f.structure).toBeGreaterThan(0)
      expect(f.structure).toBeLessThanOrEqual(1)
    }
  })

  it('fitAdjustments follows §2.5', () => {
    expect(fitAdjustments('oversized')).toEqual({
      coverage: 0.03,
      boldness: 0.05,
      structure: -0.05,
    })
    expect(fitAdjustments('fitted')).toEqual({ coverage: -0.03, boldness: 0.05 })
    expect(fitAdjustments(null, 'bodycon')).toEqual({ coverage: -0.03, boldness: 0.05 })
    expect(fitAdjustments('regular')).toEqual({})
    expect(fitAdjustments(null, null)).toEqual({})
  })
})

describe('sizes', () => {
  it('SIZE_RUNS matches §1.5 and kids never use numeric-waist', () => {
    expect([...SIZE_RUNS.alpha.women]).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
    expect([...SIZE_RUNS.alpha.kids]).toEqual(['XS', 'S', 'M', 'L', 'XL'])
    expect([...SIZE_RUNS['numeric-waist'].men]).toEqual(['28', '30', '32', '34', '36', '38', '40'])
    expect([...SIZE_RUNS['eu-shoe'].kids]).toEqual(['35', '36', '37', '38', '39'])
    expect([...SIZE_RUNS['one-size'].unisex]).toEqual(['OS'])
    expect(sizeSystemFor('jeans', 'kids')).toBe('alpha')
    expect(sizeSystemFor('jeans', 'men')).toBe('numeric-waist')
    expect(sizeSystemFor('numeric-waist', 'kids')).toBe('alpha')
    expect(sizeSystemFor('sneaker', 'kids')).toBe('eu-shoe')
    expect([...sizeRunFor('numeric-waist', 'kids')]).toEqual([...SIZE_RUNS.alpha.kids])
    expect([...sizeRunFor('eu-shoe', 'women')]).toEqual(['35', '36', '37', '38', '39', '40', '41'])
    expect(medianSize(['XS', 'S', 'M', 'L', 'XL'])).toBe('M')
    expect(medianSize(['XS', 'S', 'M', 'L', 'XL', 'XXL'])).toBe('L')
  })
})

describe('occasions and seasons', () => {
  it('has 12 occasions whose favourites resolve to subcategories or groups', () => {
    expect(OCCASIONS).toHaveLength(12)
    expectUniqueKebabSlugs(OCCASIONS.map((o) => o.slug))
    expectLexical(OCCASIONS)
    for (const o of OCCASIONS) {
      expect(o.formality).toBeGreaterThanOrEqual(0)
      expect(o.formality).toBeLessThanOrEqual(1)
      for (const f of o.favoured) {
        const ok =
          findSubcategory(f) !== undefined || (CATEGORY_GROUPS as readonly string[]).includes(f)
        expect(ok, `${o.slug} favours ${f}`).toBe(true)
      }
    }
    expect(occasionFavours('workout', 'sports-bra')).toBe(true)
    expect(occasionFavours('workout', 'running-shoe')).toBe(true)
    expect(occasionFavours('workout', 'tuxedo')).toBe(false)
    expect(occasionFavours('nope', 'tee')).toBe(false)
  })

  it('season priors sum to 1 and the warmth override moves .2 of mass', () => {
    for (const code of ['A', 'S', 'W', 'T', 'Y'] as const) {
      const sum = Object.values(SEASON_PRIOR[code]).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 6)
    }
    const warm = seasonPriorFor('Y', 0.9)
    expect(Object.values(warm).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
    expect(warm.spring + warm.summer).toBeCloseTo(0.15, 6)
    expect(warm.autumn + warm.winter).toBeCloseTo(0.55, 6)
    const cool = seasonPriorFor('W', 0.1)
    expect(cool.autumn + cool.winter).toBeCloseTo(0.6, 6)
    expect(cool.summer).toBeCloseTo(0, 6)
    expect(seasonPriorFor('S')).toEqual(SEASON_PRIOR.S)
    expect(ADJACENT_SEASON['all-season']).toBeUndefined()
    expect(ADJACENT_SEASON.spring).toBe('summer')
  })
})

describe('aesthetics (sibling-owned, may still be empty)', () => {
  it('is ordered by index when filled', () => {
    expect(AESTHETICS.length === 0 || AESTHETICS.length === 32).toBe(true)
    AESTHETICS.forEach((a, i) => {
      expect(a.index).toBe(i)
      expect(a.slug).toMatch(KEBAB)
    })
    if (AESTHETICS.length > 0) {
      expect(findAesthetic(AESTHETICS[0]?.slug ?? '')).toBe(AESTHETICS[0])
    }
    expect(findAesthetic('no-such-aesthetic')).toBeUndefined()
  })
})

describe('cross-table integrity', () => {
  it('every colour family appears in COLOR_FAMILIES exactly once', () => {
    const families = new Set<ColorFamily>(COLOR_FAMILIES)
    expect(families.size).toBe(12)
  })
})
