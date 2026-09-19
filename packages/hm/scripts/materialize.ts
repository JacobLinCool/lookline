/**
 * Apply stored vision readings to `articles`: the derived columns, the 64-d style vector, the
 * normalised copy in `article_vectors`, and an FTS rebuild so the new captions are searchable.
 *
 *   pnpm --filter @lookline/hm materialize
 *
 * Separate from the run that produced the readings, and re-runnable: changing a rule in
 * `materializeVision` costs a pass over SQLite, not 105 100 image requests.
 *
 *   LOOKLINE_SQLITE   local database file (default data/lookline.sqlite)
 */
import {
  FTS_REBUILD_SQL,
  articleVision as articleVisionTable,
  articleVectorsInsertSql,
  articles as articlesTable,
  eq,
  sql,
} from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import { materializeVision } from '../src/materialize'
import { parsePrint } from '../src/print-pass'
import { parseVision } from '../src/vision'

loadEnv()

const handle = createLocalDb()
await migrateLocal(handle)
const { db } = handle
console.log(`database ${handle.url}`)

const rows = await db
  .select({ article: articlesTable, payload: articleVisionTable.payload })
  .from(articleVisionTable)
  .innerJoin(articlesTable, eq(articlesTable.id, articleVisionTable.articleId))
  .where(eq(articleVisionTable.pass, 'core'))

// The print pass covers only the articles the core pass found a print on, so it is fetched
// separately and joined in memory rather than left-joined onto every row.
const printByArticle = new Map<string, ReturnType<typeof parsePrint>>()
for (const row of await db
  .select({ id: articleVisionTable.articleId, payload: articleVisionTable.payload })
  .from(articleVisionTable)
  .where(eq(articleVisionTable.pass, 'print'))) {
  const parsed = parsePrint(row.payload)
  if (parsed) printByArticle.set(row.id, parsed)
}
console.log(`${printByArticle.size} of them also have a print reading`)

console.log(`${rows.length} readings to apply`)
if (rows.length === 0) {
  console.log('nothing to do — run `pnpm --filter @lookline/hm vision` first')
  await handle.close()
  process.exit(0)
}

const started = performance.now()
const vectors: Array<{ id: string; styleVector: number[] }> = []
let applied = 0
let skipped = 0

for (const { article, payload } of rows) {
  // Stored payloads are re-validated rather than trusted: a row may predate a vocabulary change,
  // and a slug the catalogue has since dropped must not reach a column.
  const vision = parseVision(payload)
  if (!vision) {
    skipped += 1
    continue
  }
  const next = materializeVision(
    {
      colorFamily: article.colorFamily,
      categoryGroup: article.categoryGroup,
      section: article.section,
      seasons: article.seasons,
      occasions: article.occasions,
      price: article.price,
      trendScore: article.trendScore,
      material: article.material,
      fit: article.fit,
      length: article.length,
      neckline: article.neckline,
      sleeve: article.sleeve,
      closure: article.closure,
      attributes: article.attributes,
    },
    vision,
  )
  const { styleVector, ...columns } = next
  const print = printByArticle.get(article.id)
  await db
    .update(articlesTable)
    .set({
      ...columns,
      styleVector,
      printMotif: print?.motif ?? '',
      printText: print?.text ?? '',
    })
    .where(eq(articlesTable.id, article.id))
  vectors.push({ id: article.id, styleVector })
  applied += 1
}

const VECTOR_BATCH = 400
for (let i = 0; i < vectors.length; i += VECTOR_BATCH) {
  await db.run(articleVectorsInsertSql(vectors.slice(i, i + VECTOR_BATCH)))
}

await db.run(sql.raw(FTS_REBUILD_SQL))

const secs = (performance.now() - started) / 1000
console.log(
  `applied ${applied} readings (${skipped} did not validate) and rewrote ${vectors.length} vectors in ${secs.toFixed(1)}s`,
)
await handle.close()
