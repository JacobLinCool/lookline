import { AESTHETICS, AXES, COLOR_FAMILIES, findAesthetic } from '@lookline/catalog'
import { describe, expect, it } from 'vitest'
import {
  AESTHETIC_AXIS_PRIOR,
  AESTHETIC_COLOR_PRIOR,
  neutralAxisRow,
  neutralColorRow,
  resolveAestheticTables,
} from './aesthetic-tables'

describe('resolveAestheticTables', () => {
  it('gives every catalog slug an axis row and a colour row', () => {
    const tables = resolveAestheticTables(AESTHETICS)
    expect(tables.slugs).toEqual(AESTHETICS.map((a) => a.slug))
    for (const a of AESTHETICS) {
      const axes = tables.axes[a.slug]
      expect(axes).toBeDefined()
      for (const axis of AXES) {
        const v = axes![axis]
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      const colours = tables.colors[a.slug]
      expect(colours).toBeDefined()
      expect(Object.keys(colours!).length).toBeGreaterThan(0)
      for (const [family, w] of Object.entries(colours!)) {
        expect(COLOR_FAMILIES).toContain(family)
        expect(w).toBeGreaterThan(0)
        expect(w).toBeLessThanOrEqual(1)
      }
    }
    expect(AESTHETIC_AXIS_PRIOR).toEqual(tables.axes)
    expect(AESTHETIC_COLOR_PRIOR).toEqual(tables.colors)
  })

  it('derives formality from the catalog fAdj, trendiness/boldness verbatim, price-tier neutral', () => {
    const corporate = findAesthetic('corporate-chic')!
    expect(AESTHETIC_AXIS_PRIOR['corporate-chic']!.formality).toBeCloseTo(
      0.5 + (corporate.axes.formality ?? 0),
      10,
    )
    expect(AESTHETIC_AXIS_PRIOR['corporate-chic']!.formality).toBeCloseTo(0.7, 10)
    expect(AESTHETIC_AXIS_PRIOR['kidcore']!.formality).toBeCloseTo(0.3, 10)
    expect(AESTHETIC_AXIS_PRIOR['glam']!.boldness).toBe(findAesthetic('glam')!.axes.boldness)
    expect(AESTHETIC_AXIS_PRIOR['y2k']!.trendiness).toBe(findAesthetic('y2k')!.axes.trendiness)
    for (const a of AESTHETICS) expect(AESTHETIC_AXIS_PRIOR[a.slug]!['price-tier']).toBe(0.5)
    // colours follow the favoured colour families
    expect(AESTHETIC_COLOR_PRIOR['techwear']!.black).toBe(1)
    expect(AESTHETIC_COLOR_PRIOR['coquette']!.pink).toBe(1)
  })

  it('drops override rows for unknown slugs and fills missing rows with the neutral row', () => {
    const subset = AESTHETICS.slice(0, 3)
    const tables = resolveAestheticTables(subset, {
      axes: { 'old-money': { formality: 0.9 }, [subset[0]!.slug]: { warmth: 0.9 } },
      colors: { harajuku: { pink: 0.5 } },
    })
    expect(Object.keys(tables.axes)).toEqual(subset.map((a) => a.slug))
    expect(Object.keys(tables.colors)).toEqual(subset.map((a) => a.slug))
    expect(tables.axes[subset[0]!.slug]!.warmth).toBe(0.9)
    expect(tables.axes['old-money']).toBeUndefined()
    expect(tables.colors['harajuku']).toBeUndefined()
    expect(neutralAxisRow()).toEqual(Object.fromEntries(AXES.map((a) => [a, 0.5])))
    expect(neutralColorRow()).toEqual({ black: 0.4, white: 0.4, neutral: 0.4 })
    // a def without axes or favoured colours gets the neutral rows
    const bare = {
      ...subset[0]!,
      slug: 'bare',
      axes: {},
      favours: { ...subset[0]!.favours, colorFamilies: [] },
    }
    const t2 = resolveAestheticTables([bare])
    expect(t2.axes['bare']).toEqual(neutralAxisRow())
    expect(t2.colors['bare']).toEqual(neutralColorRow())
  })
})
