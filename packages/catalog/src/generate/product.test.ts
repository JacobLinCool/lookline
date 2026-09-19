import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AESTHETICS,
  ATTRIBUTE_SCHEMAS,
  CATEGORY_GROUPS,
  COLORS,
  OCCASIONS,
  SEASONS,
  findSubcategory,
  materialsFor,
  patternsFor,
  sizeRunFor,
  sizeSystemFor,
} from '../taxonomy'
import type { GeneratedProduct } from '../types'
import { aestheticIndex, categoryGroupIndex, productStyleInput, toStyleVector } from '../vectors'
import { generateBrands } from './brands'
import { generateCatalog, iterateCatalog } from './catalog'
import { CATALOG_VERSION, DEFAULT_CATALOG_SEED } from './constants'
import { catalogDigest } from './digest'
import { computeAxes } from './axes'
import { duplicateKey, generateProduct, generateProductRow } from './product'
import { priceBounds } from './pricing'

const seed = DEFAULT_CATALOG_SEED
const brands = generateBrands(seed)
const SAMPLE = 5000
type Full = Required<GeneratedProduct>
const sample: Full[] = []
for (let i = 1; i <= SAMPLE; i++) sample.push(generateProduct(i, seed, brands) as Full)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(here, '../../test-fixtures')

describe('determinism', () => {
  it('returns identical products for the same (i, seed) and different ones for another seed', () => {
    for (const i of [1, 2, 77, 500, 4321, 99_999, 100_000]) {
      const a = generateProduct(i, seed, brands)
      const b = generateProduct(i, seed, brands)
      expect(b).toEqual(a)
      expect(b).not.toBe(a)
    }
    const other = generateBrands(seed + 1)
    const diff = [1, 2, 3, 4, 5].filter((i) => {
      const p = generateProduct(i, seed + 1, other)
      const q = generateProduct(i, seed, brands)
      return p.name !== q.name || p.price !== q.price || p.colorName !== q.colorName
    })
    expect(diff.length).toBeGreaterThan(0)
  })

  it('is order-independent: product 500 equals whether or not 1..499 were generated', () => {
    const fresh = generateBrands(seed)
    const direct = generateProduct(500, seed, fresh)
    for (let i = 1; i < 500; i++) generateProduct(i, seed, fresh)
    expect(generateProduct(500, seed, fresh)).toEqual(direct)
    expect(direct).toEqual(sample[499])
    const viaCatalog = [...generateCatalog({ seed, size: 500, brands })]
    expect(viaCatalog).toHaveLength(500)
    expect(viaCatalog[499]).toEqual(direct)
  })

  it('makes a smaller catalog the exact id-prefix of the 100k one', () => {
    for (const i of [1, 17, 999, 5000]) {
      expect(generateProduct(i, seed, brands, 5000)).toEqual(sample[i - 1])
    }
    expect(() => generateProduct(5001, seed, brands, 5000)).toThrow(RangeError)
    expect(() => generateProduct(0, seed, brands)).toThrow(RangeError)
  })

  it('matches the golden fixture for the first 50 products at CATALOG_VERSION', () => {
    const first50 = JSON.parse(
      readFileSync(path.join(fixtures, 'first50.json'), 'utf8'),
    ) as GeneratedProduct[]
    const digestFile = readFileSync(path.join(fixtures, 'digest.txt'), 'utf8')
    expect(digestFile).toContain(`version ${CATALOG_VERSION}\n`)
    const expected = /first50 ([0-9a-f]{64})/.exec(digestFile)?.[1]
    expect(first50).toHaveLength(50)
    expect(sample.slice(0, 50)).toEqual(first50)
    expect(catalogDigest(sample.slice(0, 50))).toBe(expected)
  })

  it('iterateCatalog yields chunks with release dates inside the drop year', () => {
    const chunks = [...iterateCatalog({ seed, size: 25, brands, chunk: 10 })]
    expect(chunks.map((c) => c.length)).toEqual([10, 10, 5])
    for (const row of chunks.flat()) {
      expect(row.createdAt.getUTCFullYear()).toBe(row.product.attributes?.dropYear)
      expect(row.product).toEqual(sample[row.product.id - 1])
    }
    expect(generateProductRow(3, seed, brands).createdAt.toISOString()).toMatch(/^202[456]-/)
  })
})

describe('uniqueness (5 000 products)', () => {
  it('has unique dupKey, name and slug', () => {
    expect(new Set(sample.map(duplicateKey)).size).toBe(SAMPLE)
    expect(new Set(sample.map((p) => p.name)).size).toBe(SAMPLE)
    expect(new Set(sample.map((p) => p.slug)).size).toBe(SAMPLE)
    // Jewelry cells have ≤ 7 admissible combos (metal → colour rule), so they wrap around with
    // `edition` > 1; every other group stays inside its combo space.
    for (const p of sample) {
      if (p.categoryGroup !== 'jewelry') expect(p.attributes?.edition, p.slug).toBeUndefined()
    }
    expect(duplicateKey(sample[0]!)).toMatch(/^\d+\|[a-z-]+\|(women|men|unisex|kids)\|.+\|1$/)
  })
})

describe('validity (5 000 products)', () => {
  it('every column is consistent with the taxonomy, sizes, prices and vectors', () => {
    const groupSet = new Set<string>(CATEGORY_GROUPS)
    for (const p of sample) {
      const sub = findSubcategory(p.subcategory)
      expect(sub, p.subcategory).toBeDefined()
      if (!sub) continue
      const brand = brands[p.brandId - 1]!
      expect(brand.id).toBe(p.brandId)
      expect(p.tier).toBe(brand.tier)
      expect(sub.departments).toContain(p.department)
      expect(p.categoryGroup).toBe(sub.group)
      expect(p.category).toBe(sub.category)
      expect(groupSet.has(p.categoryGroup)).toBe(true)

      // sizes
      expect(p.sizeSystem).toBe(sizeSystemFor(sub.sizeSystem, p.department))
      const run = sizeRunFor(sub.sizeSystem, p.department)
      expect(p.sizes.length).toBeGreaterThan(0)
      for (const s of p.sizes) expect(run).toContain(s)
      const soldOut = String(p.attributes.soldOutSizes)
      for (const s of soldOut === '' ? [] : soldOut.split(',')) expect(p.sizes).toContain(s)
      if (p.stock === 0) expect(soldOut).toBe(p.sizes.join(','))

      // price
      const [lo, hi] = priceBounds(sub.basePrice)
      expect(Number.isInteger(p.price)).toBe(true)
      expect(p.price).toBeGreaterThanOrEqual(lo)
      expect(p.price).toBeLessThanOrEqual(hi)
      expect(p.price).toBeGreaterThanOrEqual(0.25 * sub.basePrice)
      expect(p.price).toBeLessThanOrEqual(42 * sub.basePrice)
      if (p.attributes.compareAtPrice !== undefined) {
        expect(p.attributes.compareAtPrice).toBeGreaterThan(p.price)
      }

      // colour, material, pattern
      const colour = COLORS.find((c) => c.name === p.colorName)
      expect(colour).toBeDefined()
      expect(p.colorHex).toBe(colour?.hex)
      expect(p.colorFamily).toBe(colour?.family)
      const materials = materialsFor(p.subcategory, p.department).map(([m]) => m.slug)
      expect(materials).toContain(p.material)
      expect(patternsFor(sub.group, p.material).map((x) => x.slug)).toContain(p.pattern)
      if (p.pattern === 'solid' && !['footwear', 'bags'].includes(sub.group)) {
        expect(p.secondaryColorHex).toBeNull()
      }
      if (p.pattern !== 'solid') expect(p.secondaryColorHex).not.toBeNull()

      // schema columns: null wherever the schema has no such column
      const schema = ATTRIBUTE_SCHEMAS[sub.schema]!
      for (const col of ['fit', 'silhouette', 'length', 'neckline', 'sleeve', 'closure'] as const) {
        if (!schema.columns[col]) expect(p[col], `${p.subcategory}.${col}`).toBeNull()
      }
      if (p.sleeve === 'sleeveless') expect(['turtle', 'collar']).not.toContain(p.neckline)
      if (p.fit === 'fitted' || p.fit === 'compression') expect(p.length).not.toBe('longline')
      if (p.attributes.hood !== undefined && p.attributes.hood !== 'none')
        expect(p.neckline).toBeNull()
      if (p.department === 'kids') {
        expect(['stiletto', 'kitten']).not.toContain(p.attributes.heel)
        expect(p.attributes.rise).not.toBe('low')
        expect(p.attributes.coverage).not.toBe('minimal')
      }
      if (p.subcategory === 'jeans') expect(typeof p.attributes.wash).toBe('string')

      // occasions, seasons, aesthetics
      expect(p.occasions.length).toBeGreaterThanOrEqual(1)
      expect(p.occasions.length).toBeLessThanOrEqual(3)
      expect(new Set(p.occasions).size).toBe(p.occasions.length)
      for (const o of p.occasions) expect(OCCASIONS.some((x) => x.slug === o)).toBe(true)
      expect(p.seasons.length).toBeGreaterThanOrEqual(1)
      expect(p.seasons.length).toBeLessThanOrEqual(2)
      for (const s of p.seasons) expect(SEASONS).toContain(s)
      expect(p.aesthetics.length).toBeGreaterThanOrEqual(1)
      expect(p.aesthetics.length).toBeLessThanOrEqual(5)
      expect(p.attributes.primaryAesthetic).toBe(p.aesthetics[0])
      for (const a of p.aesthetics) expect(AESTHETICS.some((x) => x.slug === a)).toBe(true)
      expect(String(p.attributes.collection)).toMatch(/^(SS|AW|CORE)\d{2}$/)
      expect([2024, 2025, 2026]).toContain(p.attributes.dropYear)

      // rating, stock, popularity
      if (p.reviewCount === 0) expect(p.rating).toBe(0)
      else {
        expect(p.rating).toBeGreaterThanOrEqual(3.2)
        expect(p.rating).toBeLessThanOrEqual(5)
        expect(Math.round(p.rating * 10) / 10).toBe(p.rating)
      }
      expect(p.stock).toBeGreaterThanOrEqual(0)
      expect(p.stock).toBeLessThanOrEqual(400)
      expect(p.popularity).toBeGreaterThanOrEqual(0)
      expect(p.popularity).toBeLessThanOrEqual(1)
      expect(p.trendScore).toBe(0)
      expect(p.heroImageUrl).toBeNull()
      expect(p.imageSeed).toBeGreaterThanOrEqual(0)
      for (const v of Object.values(p.attributes ?? {}))
        expect(['string', 'number', 'boolean']).toContain(typeof v)

      // copy
      expect(p.name.startsWith(`${brand.name} `)).toBe(true)
      expect(p.name.endsWith(sub.noun) || p.name.includes(`${sub.noun} in `)).toBe(true)
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-\d+$/)
      expect(p.slug.endsWith(`-${p.id}`)).toBe(true)
      expect(p.description.length).toBeGreaterThanOrEqual(40)
      expect(p.description.length).toBeLessThanOrEqual(420)
      expect(p.description).not.toContain('{')
      expect(p.description.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeGreaterThanOrEqual(2)
      expect(p.silhouetteId.length).toBeGreaterThan(0)

      // vector
      const v = p.styleVector
      expect(v).toHaveLength(64)
      for (const x of v) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(1)
      }
      const aestheticDims = v.slice(0, 32)
      expect(aestheticDims.filter((x) => x > 0).length).toBeLessThanOrEqual(5)
      const argmax = aestheticDims.indexOf(Math.max(...aestheticDims))
      expect(argmax).toBe(aestheticIndex(p.aesthetics?.[0] ?? ''))
      expect(aestheticDims[argmax]).toBeGreaterThanOrEqual(0.85)
      const groups = v.slice(52, 64)
      expect(groups.filter((x) => x === 1).length).toBe(1)
      expect(groups[categoryGroupIndex(p.categoryGroup as never) - 52]).toBe(1)
      const colourBlock = v.slice(32, 44).reduce((a, b) => a + b, 0)
      expect([1, 1.4]).toContain(Math.round(colourBlock * 10) / 10)
      expect(toStyleVector(productStyleInput(p))).toEqual(v)
      const axes = computeAxes(p, brand)
      expect(v.slice(44, 52)).toEqual([
        axes.formality,
        axes.warmth,
        axes.boldness,
        axes.structure,
        axes['price-tier'],
        axes.coverage,
        axes.texture,
        axes.trendiness,
      ])
    }
  })

  it('axes behave sensibly across the sample', () => {
    const formality = (g: string) =>
      mean(sample.filter((p) => p.categoryGroup === g).map((p) => p.styleVector[44]!))
    expect(formality('tailoring')).toBeGreaterThan(formality('activewear') + 0.4)
    const warmth = (s: string) =>
      mean(sample.filter((p) => p.seasons?.[0] === s).map((p) => p.styleVector[45]!))
    expect(warmth('winter')).toBeGreaterThan(warmth('summer') + 0.2)
  })
})
