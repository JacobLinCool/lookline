import { CATEGORIES, SUBCATEGORIES } from '@lookline/catalog'
import { articles } from '@lookline/db'
import { createLocalDb } from '@lookline/db/node'
import { afterAll, describe, expect, it } from 'vitest'
import { MATCHED_TYPES, garmentLabel, isStocked, subcategoryWhere } from './catalogue'

describe('subcategoryWhere', () => {
  const handle = createLocalDb(':memory:')
  afterAll(async () => {
    await handle.close()
  })
  /** The WHERE clause alone; the select list names every column and would match anything. */
  const clause = (slugs: string[]): string => {
    const where = subcategoryWhere(slugs)
    if (!where) return ''
    const { sql } = handle.db.select({ id: articles.id }).from(articles).where(where).toSQL()
    return sql.slice(sql.indexOf(' where '))
  }

  it('keys on real taxonomy slugs', () => {
    // A typo here is invisible: the slug simply never matches and the garment silently drops
    // back to free text, which is the failure this table exists to fix.
    const known = new Set([...SUBCATEGORIES.map((s) => s.slug), ...CATEGORIES.map((c) => c.slug)])
    const stocked = [...SUBCATEGORIES, ...CATEGORIES].filter((r) => isStocked(r.slug))
    expect(stocked.length).toBeGreaterThan(100)
    for (const row of stocked) expect(known.has(row.slug)).toBe(true)
  })

  it('narrows a subcategory and leaves a category coarse', () => {
    // H&M files every pair of jeans as `Trousers`; the denim is the only thing separating them.
    expect(clause(['jeans'])).toContain('"material"')
    // A category asks for the product types alone: `裙子` is every skirt, including the ones
    // the vision pass read no length off.
    expect(clause(['skirts'])).not.toContain('"length"')
    // Nothing stocked, no filter — the caller falls back to text instead of an empty page.
    expect(subcategoryWhere(['brooch'])).toBeNull()
  })

  it('has a noun for every product type it maps onto', () => {
    // A missing one is not an error, it is English leaking into Chinese copy: `黑色Trousers`.
    const unnamed = MATCHED_TYPES.filter((t) => garmentLabel(t, 'zh') === t)
    expect(unnamed).toEqual([])
    expect(garmentLabel('Hat/beanie', 'en')).toBe('beanie')
    // A taxonomy slug is not this table's job; `subcategoryLabel` resolves those first.
    expect(garmentLabel('hoodie', 'zh')).toBe('hoodie')
  })
})
