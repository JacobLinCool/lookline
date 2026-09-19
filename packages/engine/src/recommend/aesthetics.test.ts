import { AESTHETICS, AXES, COLOR_FAMILIES } from '@lookline/catalog'
import { describe, expect, it } from 'vitest'
import { AESTHETIC_TABLES, resolveAestheticTables, templateForOccasion } from './aesthetics'

describe('resolveAestheticTables', () => {
  it('has one row per catalog slug with all axes and colour families', () => {
    const tables = resolveAestheticTables(AESTHETICS)
    expect(tables.size).toBe(AESTHETICS.length)
    for (const a of AESTHETICS) {
      const row = tables.get(a.slug)
      expect(row, a.slug).toBeDefined()
      expect(row!.index).toBe(a.index)
      for (const axis of AXES) {
        const v = row!.axes[axis]
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      for (const f of COLOR_FAMILIES) expect(row!.colorPrior[f]).toBeGreaterThanOrEqual(0)
      expect(Object.values(row!.colorPrior).some((w) => w > 0)).toBe(true)
    }
  })

  it('drops rows whose slug is not in the catalog and defaults missing axes to 0.5', () => {
    const tables = resolveAestheticTables([{ ...AESTHETICS[0]!, axes: {} }])
    expect(tables.size).toBe(1)
    expect(tables.get(AESTHETICS[0]!.slug)!.axes.warmth).toBe(0.5)
    expect(AESTHETIC_TABLES.has('not-a-real-aesthetic')).toBe(false)
  })
})

describe('templateForOccasion', () => {
  it('maps engine and catalog occasion slugs and synonyms', () => {
    expect(templateForOccasion('wedding-guest')).toBe('formal')
    expect(templateForOccasion('office')).toBe('work')
    expect(templateForOccasion('gym')).toBe('sport')
    expect(templateForOccasion('workout')).toBe('sport')
    expect(templateForOccasion('hiking')).toBe('outdoor')
    expect(templateForOccasion('everyday')).toBe('casual')
    expect(templateForOccasion('婚禮')).toBe('formal')
    expect(templateForOccasion(null)).toBe('casual')
    expect(templateForOccasion('something else entirely')).toBe('casual')
  })
})
