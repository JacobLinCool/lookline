import { AESTHETICS, AXES, findAesthetic } from '@lookline/catalog'
import { describe, expect, it } from 'vitest'
import { AESTHETIC_TABLE, aestheticName, humanizeSlug, resolveAestheticTables } from './constants'

describe('resolveAestheticTables', () => {
  it('gives every catalog slug a row with all eight axes and a colour prior', () => {
    const table = resolveAestheticTables()
    expect(table.size).toBe(AESTHETICS.length)
    for (const def of AESTHETICS) {
      const row = table.get(def.slug)!
      expect(row).toBeDefined()
      expect(Object.keys(row.axes).toSorted()).toEqual([...AXES].toSorted())
      for (const axis of AXES) {
        expect(row.axes[axis]).toBeGreaterThanOrEqual(0)
        expect(row.axes[axis]).toBeLessThanOrEqual(1)
      }
      expect(Object.keys(row.colors).length).toBeGreaterThan(0)
      expect(row.index).toBe(def.index)
    }
  })

  it('drops overrides for unknown slugs and applies known ones', () => {
    const table = resolveAestheticTables(AESTHETICS, {
      'korean-minimal': { name: 'nope' },
      minimalist: { name: 'Minimal' },
    })
    expect(table.has('korean-minimal')).toBe(false)
    expect(table.get('minimalist')?.name).toBe('Minimal')
    expect(AESTHETIC_TABLE.get('minimalist')?.name).toBe(findAesthetic('minimalist')!.name)
  })

  it('names fall back to a humanised slug', () => {
    expect(aestheticName('quiet-luxury')).toBe(findAesthetic('quiet-luxury')!.name)
    expect(aestheticName('not-a-slug')).toBe('Not a slug')
    expect(humanizeSlug('aesthetic_category')).toBe('Aesthetic category')
  })
})
