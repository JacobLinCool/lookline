import { describe, expect, it } from 'vitest'
import { AESTHETICS } from '../taxonomy'
import {
  BRAND_SIZE_MAX,
  BRAND_SIZE_MIN,
  CITIES,
  FIXED_BRANDS,
  ROSTER,
  TAGLINES,
  TIER_PRICE_BAND,
  brandSizes,
  generateBrands,
  slugifyBrand,
} from './brands'

const SEED = 20260918
const brands = generateBrands(SEED)

describe('generateBrands', () => {
  it('returns 150 brands with ids 1..150, unique names and slugs', () => {
    expect(brands).toHaveLength(150)
    brands.forEach((b, i) => expect(b.id).toBe(i + 1))
    expect(new Set(brands.map((b) => b.slug)).size).toBe(150)
    expect(new Set(brands.map((b) => b.name)).size).toBe(150)
    for (const b of brands) expect(b.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(FIXED_BRANDS).toHaveLength(50)
    expect(ROSTER).toHaveLength(100)
  })

  it('has tier counts 30/70/34/16', () => {
    const count = (tier: string) => brands.filter((b) => b.tier === tier).length
    expect(count('budget')).toBe(30)
    expect(count('mid')).toBe(70)
    expect(count('premium')).toBe(34)
    expect(count('luxury')).toBe(16)
  })

  it('slugifies diacritics and ampersands', () => {
    expect(slugifyBrand('Étoile Enfant')).toBe('etoile-enfant')
    expect(slugifyBrand('Kōri')).toBe('kori')
    expect(slugifyBrand('Fern & Co.')).toBe('fern-and-co')
    expect(brands.find((b) => b.id === 45)?.slug).toBe('maison-elodie')
  })

  it('home aesthetics exist, weights sum to 1, every aesthetic is home to ≥ 2 brands', () => {
    const slugs = new Set(AESTHETICS.map((a) => a.slug))
    const homes = new Map<string, number>()
    for (const b of brands) {
      expect(b.homeAesthetics.length).toBeGreaterThanOrEqual(1)
      expect(b.homeAesthetics.length).toBeLessThanOrEqual(2)
      expect(b.homeWeights).toHaveLength(b.homeAesthetics.length)
      expect(Math.abs(b.homeWeights.reduce((x, y) => x + y, 0) - 1)).toBeLessThan(1e-6)
      for (const h of b.homeAesthetics) {
        expect(slugs, `${b.name}: ${h}`).toContain(h)
        homes.set(h, (homes.get(h) ?? 0) + 1)
      }
    }
    // The spec asks for ≥ 3, but its own roster gives grunge and retro-70s exactly 2 homes.
    for (const a of AESTHETICS) expect(homes.get(a.slug) ?? 0, a.slug).toBeGreaterThanOrEqual(2)
  })

  it('departments, groups and price bands are consistent', () => {
    for (const b of brands) {
      expect(b.homeDepartments.length).toBeGreaterThan(0)
      for (const d of b.homeDepartments) expect(b.departmentWeights[d as never]).toBeGreaterThan(0)
      expect(Object.keys(b.groupWeights).length).toBeGreaterThan(0)
      const [lo, hi] = TIER_PRICE_BAND[b.tier]
      expect(b.priceMultiplier).toBeGreaterThanOrEqual(lo)
      expect(b.priceMultiplier).toBeLessThanOrEqual(hi)
      expect(b.popularity).toBeGreaterThanOrEqual(0.2)
      expect(b.popularity).toBeLessThanOrEqual(0.95)
      expect(b.trend).toBeGreaterThanOrEqual(0.3)
      expect(b.trend).toBeLessThanOrEqual(0.9)
      expect(b.origin.length).toBeGreaterThan(0)
      expect(b.description.length).toBeGreaterThan(0)
      expect(b.founded).toBeGreaterThanOrEqual(1958)
      expect(b.founded).toBeLessThanOrEqual(2022)
    }
    // kids never luxury
    for (const lux of brands.filter((b) => b.tier === 'luxury')) {
      expect(lux.departmentWeights.kids ?? 0).toBe(0)
    }
    // generalists fill every department and group
    for (const id of [1, 4, 13]) {
      const b = brands.find((x) => x.id === id)!
      expect(b.generalist).toBe(true)
      expect(Object.keys(b.groupWeights)).toHaveLength(12)
      expect(Object.keys(b.departmentWeights)).toHaveLength(4)
    }
    expect(brands.filter((b) => b.generalist)).toHaveLength(3)
  })

  it('applies the roster name-suffix rules', () => {
    const byName = (n: string) => brands.find((b) => b.name === n)!
    expect(byName('Urban Swim').groupWeights).toEqual({ swimwear: 1, accessories: 0.3 })
    expect(byName('Reed Active').groupWeights).toEqual({ activewear: 1, footwear: 0.4 })
    expect(byName('Plain Jewels').groupWeights).toEqual({ jewelry: 1, accessories: 0.3 })
    expect(byName('Pike Tailors').groupWeights).toEqual({ tailoring: 1, tops: 0.4 })
    expect(byName('Metro Lounge').groupWeights).toEqual({ loungewear: 1, tops: 0.3 })
    expect(byName('Sorrel Kids').departmentWeights).toEqual({ kids: 1 })
    expect(byName('Sorrel Kids').homeDepartments).toEqual(['kids'])
    const fold = byName('Basic Fold')
    expect(fold.departmentWeights).toEqual({ women: 1, men: 0.8, unisex: 0.8 })
    expect(fold.homeWeights).toEqual([0.6, 0.4])
    expect(fold.groupWeights.tops).toBe(1)
    expect(fold.groupWeights.accessories).toBeGreaterThanOrEqual(0.3)
    for (const b of brands.slice(50)) {
      expect(TAGLINES[b.voice]).toContain(b.description)
      expect(CITIES[b.homeAesthetics[0]!]).toContain(b.origin)
    }
  })

  it('brand sizes are within [0.12 %, 1.5 %] and sum to 1', () => {
    const total = brands.reduce((s, b) => s + b.size, 0)
    expect(Math.abs(total - 1)).toBeLessThan(1e-9)
    for (const b of brands) {
      expect(b.size).toBeGreaterThanOrEqual(BRAND_SIZE_MIN - 1e-12)
      expect(b.size).toBeLessThanOrEqual(BRAND_SIZE_MAX + 1e-12)
    }
    const sizes = brandSizes(SEED, brands)
    expect(sizes.size).toBe(150)
  })

  it('is deterministic for a seed and varies roster fields with the seed', () => {
    const again = generateBrands(SEED)
    expect(again).toEqual(brands)
    const other = generateBrands(SEED + 1)
    expect(other.slice(0, 50).map((b) => b.priceMultiplier)).toEqual(
      brands.slice(0, 50).map((b) => b.priceMultiplier),
    )
    expect(other.slice(50).map((b) => b.priceMultiplier)).not.toEqual(
      brands.slice(50).map((b) => b.priceMultiplier),
    )
    expect(other.map((b) => b.name)).toEqual(brands.map((b) => b.name))
  })

  it('transcribes the fixed rows', () => {
    const arlo = brands[0]!
    expect(arlo).toMatchObject({
      name: 'Arlo Basics',
      slug: 'arlo-basics',
      tier: 'budget',
      homeAesthetics: ['normcore', 'minimalist'],
      homeWeights: [0.6, 0.4],
      priceMultiplier: 0.55,
      popularity: 0.95,
      trend: 0.3,
      voice: 'crisp',
      origin: 'Taipei',
      founded: 2011,
      description: 'Everyday, done properly.',
    })
    expect(arlo.departmentWeights).toEqual({ women: 1, men: 1, unisex: 0.8, kids: 0.6 })
    const kori = brands.find((b) => b.id === 48)!
    expect(kori.homeWeights).toEqual([0.7, 0.3])
    expect(kori.departmentWeights).toEqual({ unisex: 1, women: 0.9, men: 0.8 })
    expect(kori.homeDepartments).toEqual(['women', 'men', 'unisex'])
  })
})
