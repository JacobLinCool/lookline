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
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ColorFamily, toStyleVector } from '@lookline/catalog'
import {
  FTS_REBUILD_SQL,
  type NewArticle,
  articleVectorsInsertSql,
  articles as articlesTable,
  brands as brandsTable,
  getTableColumns,
  insertAll,
  sql,
  typeAffinity as typeAffinityTable,
} from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import {
  categoryGroupFor,
  colorFamilyOf,
  garmentDetails,
  loadAffinity,
  loadArticles,
  loadSeasons,
  loadStats,
  materialFrom,
  momentumOf,
  placeholderPrice,
  popularityOf,
  sectionMeaning,
  slugFor,
  styleAxes,
  tierFor,
} from '../src/index'

loadEnv()

const dir = process.env.HM_DIR ?? fileURLToPath(new URL('../../../data/hm', import.meta.url))
/** SQLite's bound-parameter ceiling. */
const SQLITE_MAX_PARAMS = 32_766
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

// 442 articles ship without a photo. Scanning the folder once beats an existsSync per row, and
// a key that points at a missing object would render as a broken image.
const webpDir = process.env.IMG_OUT ?? path.join(dir, 'webp')
const haveImage = new Set<string>()
if (existsSync(webpDir)) {
  for (const bucket of readdirSync(webpDir)) {
    const bucketDir = path.join(webpDir, bucket)
    if (!existsSync(bucketDir) || !bucket.match(/^\d{3}$/)) continue
    for (const file of readdirSync(bucketDir)) {
      if (file.endsWith('.webp')) haveImage.add(file.slice(0, -5))
    }
  }
}
console.log(`${haveImage.size} articles have an image`)

const stats = loadStats(`${dir}/article_stats.csv`)
const seasons = loadSeasons(`${dir}/article_seasons.csv`)
const maxSales = Math.max(...[...stats.values()].map((s) => s.salesCount))
console.log(`read ${stats.size} article aggregates, top seller ${maxSales} units`)

const source = loadArticles(`${dir}/articles.csv`)
console.log(`read ${source.length} articles in ${secs(started)}s`)

// The 322 non-apparel rows — furniture, stationery, cosmetics — never enter the catalogue, and
// neither do the 440 H&M never photographed. A shop cannot sell what it cannot show: those rows
// render as an empty tile, the vision pass skips them on the confidence it measured (0.43 against
// 0.947), so they carry no aesthetic, pattern or fit either, and nothing can rank them. Keeping
// them out here rather than filtering them in every query means the table says what the shop
// says, which is what anyone counting rows expects.
const rows: NewArticle[] = []
let noPhoto = 0
for (const a of source) {
  const categoryGroup = categoryGroupFor(a.outfitRole, a.indexGroupName, a.productType)
  if (categoryGroup === null) continue
  if (!haveImage.has(a.articleId)) {
    noPhoto += 1
    continue
  }
  // Real transaction prices where the article ever sold; 995 of them never did.
  const stat = stats.get(a.articleId)
  const price = stat?.price ?? placeholderPrice(categoryGroup, a.articleId)
  const section = sectionMeaning(a.section ?? '')
  const detail = garmentDetails(a.description)
  const material = materialFrom(a.description)
  const articleSeasons = seasons.get(a.articleId) ?? ['all-season']
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
    // H&M's own label goes in H&M's own column; `pattern` beside it is the catalog slug the
    // vision pass reads off the photograph, and `materialize` writes it.
    graphicalAppearance: a.pattern ?? '',
    colorName: a.colourName ?? '',
    colorMaster: a.colourFamily ?? '',
    colorFamily: colorFamilyOf(a.colourFamily ?? '', a.colourName ?? ''),
    colorValue: a.colourValue ?? '',
    categoryGroup,
    outfitRole: a.outfitRole,
    price,
    tier: tierFor(price),
    salesCount: stat?.salesCount ?? 0,
    firstSoldAt: stat?.firstSoldAt ?? null,
    lastSoldAt: stat?.lastSoldAt ?? null,
    onlineRatio: stat?.onlineRatio ?? 0,
    popularity: stat ? popularityOf(stat.salesCount, maxSales) : 0,
    trendScore: stat ? momentumOf(stat.sales30d, stat.sales90d) : 0,
    department: a.department,
    slug: slugFor(a.name, a.articleId),
    colorHex: a.colourHex ?? '#9E9E9E',
    imagePath: haveImage.has(a.articleId)
      ? `images/${a.articleId.slice(0, 3)}/${a.articleId}.webp`
      : null,
    occasions: [...section.occasions],
    seasons: articleSeasons,
    neckline: detail.neckline,
    sleeve: detail.sleeve,
    fit: detail.fit,
    length: detail.length,
    attributes: detail.attributes,
    material,
    styleVector: toStyleVector({
      colorFamily: colorFamilyOf(a.colourFamily ?? '', a.colourName ?? '') as ColorFamily,
      secondaryColorFamily: null,
      axes: styleAxes({
        formality: section.formality,
        material,
        seasons: articleSeasons,
        price,
        trendScore: stat ? momentumOf(stat.sales30d, stat.sales90d) : 0,
      }),
      categoryGroup,
    }),
  })
}

// An insert binds every column of the table, not just the keys set above, so the statement is
// sized against the table and `insertAll` is then told the equivalent budget in row keys.
const columns = Object.keys(getTableColumns(articlesTable)).length
const rowKeys = Object.keys(rows[0] ?? {}).length
const maxParams = Math.floor(SQLITE_MAX_PARAMS / columns) * rowKeys
const inserted = await insertAll(db, articlesTable, rows, { maxParams })
console.log(
  `inserted ${inserted} articles (${source.length - rows.length - noPhoto} non-apparel, ${noPhoto} unphotographed) in ${secs(started)}s`,
)

// The vector channel inner-joins this table, so an article missing from it is invisible to
// every recommendation — even while the vectors themselves are all zero.
const VECTOR_BATCH = 400
for (let i = 0; i < rows.length; i += VECTOR_BATCH) {
  await db.run(
    articleVectorsInsertSql(
      rows.slice(i, i + VECTOR_BATCH).map((r) => ({ id: r.id, styleVector: r.styleVector })),
    ),
  )
}
console.log(`wrote ${rows.length} style vectors in ${secs(started)}s`)

const pairs = loadAffinity(`${dir}/type_affinity.csv`)
await db.delete(typeAffinityTable)
await insertAll(db, typeAffinityTable, pairs)
console.log(`inserted ${pairs.length} co-purchase pairs in ${secs(started)}s`)

await db.run(sql.raw(FTS_REBUILD_SQL))
await db.run(sql.raw('analyze'))
console.log(`rebuilt the full-text index in ${secs(started)}s`)

await handle.close()
