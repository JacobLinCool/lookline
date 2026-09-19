import { describe, expect, it } from 'vitest'
import { CLUSTER_ARCHETYPES, CLUSTER_COUNT } from './clusters'
import { DEMO_PERSONAS, GIFT_SHARE, generatePersonas } from './personas'

describe('generatePersonas', () => {
  const personas = generatePersonas(7, 1200)

  it('is deterministic for a seed and differs across seeds', () => {
    expect(generatePersonas(7, 1200)).toEqual(personas)
    const other = generatePersonas(8, 1200)
    expect(other.map((p) => p.handle)).not.toEqual(personas.map((p) => p.handle))
    // demo personas keep their handles regardless of the seed
    expect(other.slice(0, 10).map((p) => p.handle)).toEqual(
      personas.slice(0, 10).map((p) => p.handle),
    )
  })

  it('produces n personas with unique ids and handles', () => {
    expect(personas).toHaveLength(1200)
    expect(new Set(personas.map((p) => p.id)).size).toBe(1200)
    expect(new Set(personas.map((p) => p.handle)).size).toBe(1200)
    expect(personas[0]?.id).toBe('u_000001')
    expect(personas[1199]?.id).toBe('u_001200')
    for (const p of personas) expect(p.handle).toMatch(/^[a-z0-9.]+$/)
  })

  it('has the ten demo personas first, flagged isPersona, everybody else not', () => {
    const demo = personas.slice(0, DEMO_PERSONAS.length)
    expect(demo.map((p) => p.handle)).toEqual(DEMO_PERSONAS.map((d) => d.handle))
    expect(demo.every((p) => p.isPersona)).toBe(true)
    expect(personas.slice(DEMO_PERSONAS.length).some((p) => p.isPersona)).toBe(false)
    expect(demo.every((p) => p.bio.length > 60)).toBe(true)
    // distinct tastes: no two demo personas share the same top aesthetic pair
    const pairs = demo.map((p) => p.primaryAesthetics.slice(0, 2).join('/'))
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('spreads personas over all 24 clusters and samples tastes around the archetype', () => {
    const sizes = new Map<number, number>()
    for (const p of personas) sizes.set(p.socialCluster, (sizes.get(p.socialCluster) ?? 0) + 1)
    expect(sizes.size).toBe(CLUSTER_COUNT)
    for (const n of sizes.values()) expect(n).toBeGreaterThan(30)
    for (const p of personas) {
      const archetype = CLUSTER_ARCHETYPES[p.socialCluster]!
      expect(p.archetype).toBe(archetype.slug)
      expect(p.hiddenVector).toHaveLength(64)
      expect(p.hiddenVector.every((x) => x >= 0 && x <= 1)).toBe(true)
      expect(p.primaryAesthetics[0]).toBe(archetype.aesthetics[0])
    }
  })

  it('gives roughly 40 % of personas a distinct gift taste', () => {
    const withGift = personas.filter((p) => p.giftHiddenVector !== null)
    const share = withGift.length / personas.length
    expect(share).toBeGreaterThan(GIFT_SHARE - 0.06)
    expect(share).toBeLessThan(GIFT_SHARE + 0.06)
    for (const p of withGift) {
      expect(p.giftLabel).toBeTruthy()
      expect(p.giftDepartment).toBeTruthy()
      expect(p.giftHiddenVector).not.toEqual(p.hiddenVector)
    }
  })

  it('fills department-specific sizes, a budget and behaviour parameters', () => {
    for (const p of personas) {
      expect(p.sizes['alpha']).toBeTruthy()
      expect(p.sizes['numeric-waist']).toBeTruthy()
      expect(p.sizes['eu-shoe']).toBeTruthy()
      expect(p.budgetHint).toBeGreaterThanOrEqual(1000)
      expect(p.budgetHint).toBeLessThanOrEqual(20000)
      expect(p.params.activity).toBeGreaterThan(0)
      expect(p.params.activity).toBeLessThan(1)
      expect(p.params.shareRadius).toBeGreaterThanOrEqual(1)
      expect(p.params.shareRadius).toBeLessThanOrEqual(6)
    }
    const chinese = personas.filter((p) => /[一-鿿]/.test(p.displayName)).length
    expect(chinese).toBeGreaterThan(100)
  })
})
