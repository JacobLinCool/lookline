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
  getTableColumns,
  brands as brandsTable,
  insertAll,
  sql,
} from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import {
  categoryGroupFor,
  loadArticles,
  placeholderPrice,
  sizeSystemFor,
  slugFor,
  tierFor,
} from '../src/index'

loadEnv()

const dir = process.env.HM_DIR ?? fileURLToPath(new URL('../../../data/hm', import.meta.url))
/** SQLite's bound-parameter ceiling. */
const SQLITE_MAX_PARAMS = 32_766
const HM_BRAND_ID = 1
/** Nothing encodes the style space yet, so every article starts at the origin. */
const ZERO_VECTOR: number[] = Array.from({ length: 64 }, () => 0)

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

// The 322 non-apparel rows — furniture, stationery, cosmetics — never enter the catalogue.
const rows: NewArticle[] = []
for (const a of source) {
  const categoryGroup = categoryGroupFor(a.outfitRole, a.indexGroupName, a.productType)
  if (categoryGroup === null) continue
  const price = placeholderPrice(categoryGroup, a.articleId)
  rows.push({
    id: a.articleId,
    brandId: HM_BRAND_ID,
    productCode: a.productCode,
    name: a.name,
    description: a.description ?? '',
    subcategory: a.productType,
    productGroup: a.productGroup,
    category: a.garmentGroup ?? '',
    section: a.section ?? '',
    indexName: a.indexName,
    indexGroupName: a.indexGroupName,
    pattern: a.pattern ?? '',
    colorName: a.colourName ?? '',
    colorFamily: a.colourFamily ?? '',
    colorValue: a.colourValue ?? '',
    categoryGroup,
    outfitRole: a.outfitRole,
    price,
    tier: tierFor(price),
    department: a.department,
    slug: slugFor(a.name, a.articleId),
    colorHex: a.colourHex ?? '#9E9E9E',
    sizeSystem: sizeSystemFor(a.outfitRole),
    sizes: [],
    // Filled when the images are uploaded to R2 — not every article ships with a photo, and the
    // key must not point at an object that is not there.
    imagePath: null,
    occasions: [],
    aesthetics: [],
    styleVector: ZERO_VECTOR,
  })
}

// An insert binds every column of the table, not just the keys set above, so the statement is
// sized against the table and `insertAll` is then told the equivalent budget in row keys.
const columns = Object.keys(getTableColumns(articlesTable)).length
const rowKeys = Object.keys(rows[0] ?? {}).length
const maxParams = Math.floor(SQLITE_MAX_PARAMS / columns) * rowKeys
const inserted = await insertAll(db, articlesTable, rows, { maxParams })
console.log(
  `inserted ${inserted} articles (${source.length - rows.length} non-apparel skipped) in ${secs(started)}s`,
)

await db.run(sql.raw(FTS_REBUILD_SQL))
await db.run(sql.raw('analyze'))
console.log(`rebuilt the full-text index in ${secs(started)}s`)

await handle.close()
