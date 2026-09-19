/**
 * `searchProducts` against a migrated in-memory SQLite database (D1's dialect). The unit tests
 * cover the plan and the facet aggregation; this one runs the SQL, which is where the facet query
 * broke: an unfiltered search builds no conditions, `and()` of nothing is `undefined`, and the raw
 * `where ${undefined}` left a dangling keyword that SQLite rejects. Every other search on the site
 * has at least one filter, so only the bare /shop — the page with the most to show — went blank.
 */
import { FTS_REBUILD_SQL, brands, eq, insertAll, articles, sql } from '@lookline/db'
import type { CategoryGroup } from '@lookline/catalog'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureBrands, makeProduct } from './testing/fixtures'
import { countFacet, searchProducts } from './search'

const SEED = 20260918
let handle: DbHandle

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
  const rows = [1, 2, 3, 4, 5]
    .map((i) => makeProduct(i, SEED, brandRecords))
    .map(({ brandName: _brandName, ...row }) => row)
  await insertAll(handle.db, articles, rows, { maxParams: 20_000 })
  // One article the vision pass has reached: a caption with a motif, a print subject, a design
  // detail and a silhouette. The other four stay as the import left them — unknown, not "no".
  await handle.db
    .update(articles)
    .set({
      styleCaption: 'A relaxed navy hoodie with a playful cartoon whale print across the chest.',
      printSubject: 'animal',
      silhouette: 'a-line',
      sleeve: 'long',
      attributes: { pockets: true, laceTrim: true },
    })
    .where(eq(articles.id, rows[0]!.id))
  await handle.db.run(sql.raw(FTS_REBUILD_SQL))
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

  it('runs with a filter and counts only what the filter matched', async () => {
    const all = await searchProducts(handle.db, {})
    const group = all.facets!.categoryGroups[0]!
    const filtered = await searchProducts(handle.db, {
      categoryGroups: [group.key as CategoryGroup],
    })
    expect(filtered.total).toBe(group.count)
  })

  it('finds a keyword only in the caption, through the rowid the index is keyed on', async () => {
    const first = (await searchProducts(handle.db, {}))!.items
    const tagged = first.find((a) => a.printSubject === 'animal')!
    for (const keywords of [['whale'], ['whale|orca'], ['orca|whale', 'cartoon']]) {
      const hit = await searchProducts(handle.db, { keywords, sort: 'relevance' })
      expect(hit.total).toBe(1)
      expect(hit.items.map((a) => a.id)).toEqual([tagged.id])
    }
    expect((await searchProducts(handle.db, { keywords: ['unicorn'] })).total).toBe(0)
    // Free text in `q` rides the same join; bm25 ordering must not lose the row.
    expect((await searchProducts(handle.db, { q: 'chest', sort: 'relevance' })).total).toBe(1)
  })

  it('narrows on construction facets, counts them, and keeps unknown rows out of a negative', async () => {
    const pockets = await searchProducts(handle.db, { details: ['pockets'] })
    expect(pockets.total).toBe(1)
    // Per search only the semantic facets are counted; a construction facet is counted on ask.
    expect(pockets.facets?.details).toBeUndefined()
    expect(pockets.facets?.categoryGroups.reduce((n, g) => n + g.count, 0)).toBe(1)
    expect(await countFacet(handle.db, { details: ['pockets'] }, 'detail')).toEqual(
      expect.arrayContaining([
        { key: 'pockets', count: 1 },
        { key: 'laceTrim', count: 1 },
      ]),
    )
    expect(await countFacet(handle.db, {}, 'silhouette')).toEqual([{ key: 'a-line', count: 1 }])
    expect(await countFacet(handle.db, {}, 'printSubject')).toEqual([{ key: 'animal', count: 1 }])
    expect(await countFacet(handle.db, {}, 'sleeve')).toEqual([{ key: 'long', count: 1 }])
    // Four articles are not known to lack lace trim; they are kept, the tagged one is dropped.
    const noLace = await searchProducts(handle.db, { excludedDetails: ['laceTrim'] })
    expect(noLace.total).toBe(4)
    expect(await countFacet(handle.db, { excludedDetails: ['laceTrim'] }, 'detail')).toEqual([])
    const noAnimal = await searchProducts(handle.db, { excludedPrintSubjects: ['animal'] })
    expect(noAnimal.total).toBe(4)
    expect((await searchProducts(handle.db, { silhouettes: ['a-line', 'wrap'] })).total).toBe(1)
    expect(
      (await searchProducts(handle.db, { silhouettes: ['a-line'], sleeves: ['sleeveless'] })).total,
    ).toBe(0)
  })
})
