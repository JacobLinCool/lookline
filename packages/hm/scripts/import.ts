/**
 * Import the H&M catalogue into the local SQLite database: one brand row, then every article from
 * `data/hm/articles.csv`. Clears `articles` first, so a re-run replaces the catalogue rather than
 * appending to it.
 *
 * Prices, sales counts and trend scores stay at their defaults until `transactions_train.csv` is
 * aggregated — those 31.8M rows are processed offline and never reach D1.
 *
 *   HM_DIR            directory holding the Kaggle csv files (default <repo>/data/hm)
 *   LOOKLINE_SQLITE   local database file (default data/lookline.sqlite)
 */
import { fileURLToPath } from 'node:url'
import {
  FTS_REBUILD_SQL,
  type NewArticle,
  articles as articlesTable,
  brands as brandsTable,
  insertAll,
  sql,
} from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import { loadArticles, sizeSystemFor, slugFor } from '../src/index'

loadEnv()

const dir = process.env.HM_DIR ?? fileURLToPath(new URL('../../../data/hm', import.meta.url))
/**
 * SQLite's bound-parameter ceiling is 32 766. An insert binds every column of `articles`, not just
 * the ones set here, so the batch is sized against the wider table rather than the row literal.
 */
const LOCAL_MAX_PARAMS = 20_000
const HM_BRAND_ID = 1

const secs = (from: number): string => ((performance.now() - from) / 1000).toFixed(1)
const started = performance.now()
const handle = createLocalDb()
await migrateLocal(handle)
const { db } = handle

console.log(`database ${handle.url}`)

// The catalogue is one retailer. Every article points at this row so the ranking factors that
// read a brand keep working.
await db.delete(articlesTable)
await db.delete(brandsTable)
await insertAll(db, brandsTable, [
  {
    id: HM_BRAND_ID,
    slug: 'hm',
    name: 'H&M',
    tier: 'budget' as const,
    homeAesthetics: [],
    homeDepartments: ['women', 'men', 'kids', 'unisex'],
    priceMultiplier: 1,
    origin: 'Sweden',
    description: 'H&M Group, 53 online markets and roughly 4850 stores.',
  },
])

const source = loadArticles(`${dir}/articles.csv`)
console.log(`read ${source.length} articles in ${secs(started)}s`)

const rows: NewArticle[] = source.map((a) => ({
  id: a.articleId,
  brandId: HM_BRAND_ID,
  productCode: a.productCode,
  name: a.name,
  description: a.description,
  subcategory: a.productType,
  productGroup: a.productGroup,
  category: a.garmentGroup,
  section: a.section,
  indexName: a.indexName,
  indexGroupName: a.indexGroupName,
  pattern: a.pattern,
  colorName: a.colourName,
  colorFamily: a.colourFamily,
  colorValue: a.colourValue,
  categoryGroup: a.outfitRole,
  department: a.department,
  slug: slugFor(a.name, a.articleId),
  colorHex: a.colourHex,
  sizeSystem: sizeSystemFor(a.outfitRole),
  sizes: [],
  // Filled when the images are uploaded to R2 — not every article ships with a photo, and the
  // key must not point at an object that is not there.
  imagePath: null,
  occasions: [],
  aesthetics: [],
  styleVector: null,
}))

const inserted = await insertAll(db, articlesTable, rows, { maxParams: LOCAL_MAX_PARAMS })
console.log(`inserted ${inserted} articles in ${secs(started)}s`)

await db.run(sql.raw(FTS_REBUILD_SQL))
await db.run(sql.raw('analyze'))
console.log(`rebuilt the full-text index in ${secs(started)}s`)

await handle.close()
