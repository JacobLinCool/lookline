import { describe, expect, it } from 'vitest'
import { hashSeed } from '../rng'
import { DEPARTMENTS, KIDS_EXCLUDED_MATERIALS } from '../taxonomy'
import { generateBrands } from './brands'
import { cellSelection, comboHash, fnvFinish } from './cell'
import { DEFAULT_CATALOG_SEED, DEFAULT_CATALOG_SIZE } from './constants'
import { createPlan } from './plan'

const seed = DEFAULT_CATALOG_SEED
const brands = generateBrands(seed)
const plan = createPlan(seed, DEFAULT_CATALOG_SIZE, brands)

describe('combo hash', () => {
  it('equals hashSeed(seed, "combo", cellId, k) across digit rollovers', () => {
    for (const k of [
      0, 1, 9, 10, 99, 100, 101, 999, 1000, 12_345, 99_999, 100_000, 4_294_967_295,
    ]) {
      expect(comboHash(seed, 12_034, k)).toBe(hashSeed(seed, 'combo', 12_034, k))
    }
    expect(fnvFinish(0x811c9dc5 >>> 0, 7)).toBe(hashSeed(7))
  })
})

describe('cellSelection', () => {
  it('draws distinct combos per cell, honours the department layout and the kids material rule', () => {
    let checked = 0
    for (const cell of plan.cells) {
      if (checked > 400 && cell.n < 100) continue
      const sel = cellSelection(plan, cell)
      expect(sel.colour).toHaveLength(cell.n)
      const combos = new Set<string>()
      const counts = { women: 0, men: 0, unisex: 0, kids: 0 }
      for (let j = 0; j < cell.n; j++) {
        combos.add(
          `${sel.colour[j]}|${sel.material[j]}|${sel.pattern[j]}|${sel.fit[j]}|${sel.edition[j]}`,
        )
        const dept = DEPARTMENTS[sel.department[j]!]!
        counts[dept]++
        const material = sel.materials[sel.material[j]!]!.slug
        if (dept === 'kids' && KIDS_EXCLUDED_MATERIALS.includes(material)) {
          expect(material === 'shearling' && cell.subcategory.group === 'footwear').toBe(true)
        }
        if (cell.subcategory.group !== 'jewelry') expect(sel.edition[j]).toBe(1)
      }
      expect(combos.size).toBe(cell.n)
      expect(counts).toEqual(cell.deptCounts)
      if (cell.subcategory.group !== 'jewelry')
        expect(sel.positiveCombos).toBeGreaterThanOrEqual(cell.n)
      else expect(sel.positiveCombos).toBeGreaterThanOrEqual(1)
      checked++
    }
    expect(checked).toBeGreaterThan(400)
  })

  it('is memoised per plan and cell', () => {
    const cell = plan.cells[10]!
    expect(cellSelection(plan, cell)).toBe(cellSelection(plan, cell))
  })
})
