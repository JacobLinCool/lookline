/**
 * `searchProducts` against a migrated in-memory SQLite database (D1's dialect). The unit tests
 * cover the plan and the facet aggregation; this one runs the SQL, which is where the facet query
 * broke: an unfiltered search builds no conditions, `and()` of nothing is `undefined`, and the raw
 * `where ${undefined}` left a dangling keyword that SQLite rejects. Every other search on the site
 * has at least one filter, so only the bare /shop — the page with the most to show — went blank.
 */
import { brands, eq, insertAll, articles } from '@lookline/db'
import type { CategoryGroup } from '@lookline/catalog'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureBrands, makeProduct } from './testing/fixtures'
import { searchProducts } from './search'

const SEED = 20260918
const fixtureRows = (brandRecords: ReturnType<typeof fixtureBrands>) =>
  [1, 2, 3, 4, 5]
    .map((i) => makeProduct(i, SEED, brandRecords))
    .map(({ brandName: _brandName, ...row }) => row)

let handle: DbHandle
let rows: ReturnType<typeof fixtureRows>

beforeAll(async () => {
  handle = await createTestDb()
  const brandRecords = fixtureBrands(SEED)
  await insertAll(
    handle.db,
    brands,
    brandRecords.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      tier: b.tier,
      homeAesthetics: b.homeAesthetics,
      homeDepartments: b.homeDepartments,
      priceMultiplier: b.priceMultiplier,
      origin: null,
      description: null,
    })),
    { maxParams: 30_000 },
  )
  rows = fixtureRows(brandRecords)
  await insertAll(handle.db, articles, rows, { maxParams: 20_000 })
})

afterAll(async () => {
  await handle.close()
})

describe('searchProducts (SQLite integration)', () => {
  it('runs with no filter at all and still counts facets', async () => {
    const result = await searchProducts(handle.db, {})
    expect(result.total).toBe(5)
    expect(result.items).toHaveLength(5)
    expect(result.facets?.categoryGroups.length).toBeGreaterThan(0)
    const counted = result.facets!.categoryGroups.reduce((n, g) => n + g.count, 0)
    expect(counted).toBe(5)
  })

  it('leaves out an article H&M never photographed, in the rows and in the counts', async () => {
    // 440 of the real 105 220 have no `image_path`. `ProductImage` renders an empty tonal ground
    // for them and the vision pass skips them, so they carry no aesthetic, pattern or fit either
    // — a blank tile that nothing can rank.
    const [first] = rows
    await handle.db.update(articles).set({ imagePath: null }).where(eq(articles.id, first!.id))
    const result = await searchProducts(handle.db, {})
    expect(result.total).toBe(4)
    expect(result.items.map((i) => i.id)).not.toContain(first!.id)
    const counted = result.facets!.categoryGroups.reduce((n, g) => n + g.count, 0)
    expect(counted).toBe(4)
    await handle.db
      .update(articles)
      .set({ imagePath: first!.imagePath })
      .where(eq(articles.id, first!.id))
  })

  it('runs with a filter and counts only what the filter matched', async () => {
    const all = await searchProducts(handle.db, {})
    const group = all.facets!.categoryGroups[0]!
    const filtered = await searchProducts(handle.db, {
      categoryGroups: [group.key as CategoryGroup],
    })
    expect(filtered.total).toBe(group.count)
  })
})
