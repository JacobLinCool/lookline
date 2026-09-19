/**
 * Catalog seed (CATALOG_SPEC §11.4): clears `products`, `product_vectors` and `brands` (and every
 * row that references a product), inserts the 150 brands and `CATALOG_SIZE` products into the
 * local SQLite database in batches, fills the cosine columns, rebuilds the FTS index, runs
 * ANALYZE and prints a summary. Ship the result to D1 with `pnpm d1:local` / `pnpm d1:remote`.
 *
 *   CATALOG_SEED      default 20260918
 *   CATALOG_SIZE      default 100000
 *   LOOKLINE_SQLITE   local database file (default data/lookline.sqlite)
 */
import { createHash } from 'node:crypto'
import {
  FTS_REBUILD_SQL,
  brands as brandsTable,
  insertAll,
  productVectorsInsertSql,
  products as productsTable,
  sql,
} from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import {
  CATALOG_VERSION,
  DEFAULT_CATALOG_SEED,
  DEFAULT_CATALOG_SIZE,
} from '../src/generate/constants'
import { generateBrands } from '../src/generate/brands'
import { iterateCatalog } from '../src/generate/catalog'
import { digestLine } from '../src/generate/digest'

loadEnv()

const seed = Number(process.env.CATALOG_SEED ?? DEFAULT_CATALOG_SEED)
const size = Number(process.env.CATALOG_SIZE ?? DEFAULT_CATALOG_SIZE)
const BATCH = 1000
/** SQLite's own bound-parameter ceiling is 32 766; products have ~40 columns. */
const LOCAL_MAX_PARAMS = 30_000

if (!Number.isInteger(seed) || !Number.isInteger(size) || size < 1) {
  throw new Error(`CATALOG_SEED / CATALOG_SIZE must be positive integers (got ${seed}, ${size})`)
}

console.log(`lookline catalog seed · version ${CATALOG_VERSION} · seed ${seed} · size ${size}`)
console.log(
  'WARNING: clearing products and brands also removes every purchase, look product, ' +
    'interaction, ask response and feedback event that references a product.',
)

const started = performance.now()
const secs = (from: number): string => ((performance.now() - from) / 1000).toFixed(1)
const handle = createLocalDb()
const { db } = handle
console.log(`database ${handle.url}`)

/** Tables that reference products, cleared first (foreign keys are enforced). */
const DEPENDENTS = [
  'feedback_events',
  'ask_responses',
  'interactions',
  'purchases',
  'look_products',
  'product_vectors',
  'products',
  'brands',
]

try {
  await migrateLocal(handle)
  const tTruncate = performance.now()
  for (const table of DEPENDENTS) await db.run(sql.raw(`delete from "${table}"`))
  console.log(`cleared in ${secs(tTruncate)}s`)

  const brandRecords = generateBrands(seed)
  await insertAll(
    db,
    brandsTable,
    brandRecords.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      tier: b.tier,
      homeAesthetics: b.homeAesthetics,
      homeDepartments: b.homeDepartments,
      priceMultiplier: b.priceMultiplier,
      origin: b.origin,
      description: b.description,
    })),
    { maxParams: LOCAL_MAX_PARAMS },
  )
  console.log(`inserted ${brandRecords.length} brands`)

  const tInsert = performance.now()
  const digest = createHash('sha256')
  let generateMs = 0
  let inserted = 0
  let nextLog = 10_000
  const iterator = iterateCatalog({ seed, size, brands: brandRecords, chunk: BATCH })
  // Each multi-row statement is its own implicit transaction (libsql resets manual BEGINs).
  for (;;) {
    const tGen = performance.now()
    const next = iterator.next()
    generateMs += performance.now() - tGen
    if (next.done) break
    const chunk = next.value
    for (const { product } of chunk) digest.update(digestLine(product) + '\n')
    const rows = chunk.map(({ product, createdAt }) => ({ ...product, createdAt }))
    await insertAll(db, productsTable, rows, { maxParams: LOCAL_MAX_PARAMS })
    for (let i = 0; i < rows.length; i += 250) {
      await db.run(
        productVectorsInsertSql(
          rows.slice(i, i + 250).map((r) => ({ id: r.id, styleVector: r.styleVector })),
        ),
      )
    }
    inserted += rows.length
    if (inserted >= nextLog || inserted === size) {
      const elapsed = (performance.now() - tInsert) / 1000
      console.log(
        `${inserted}/${size} products · ${elapsed.toFixed(1)}s · ${Math.round(inserted / elapsed)} rows/s`,
      )
      while (nextLog <= inserted) nextLog += 10_000
    }
  }
  const insertSecs = (performance.now() - tInsert) / 1000
  console.log(
    `inserted ${inserted} products in ${insertSecs.toFixed(1)}s (generation ${(generateMs / 1000).toFixed(1)}s of that, on the main thread)`,
  )

  const tIndex = performance.now()
  await db.run(sql.raw(FTS_REBUILD_SQL))
  await db.run(sql`analyze`)
  console.log(`rebuilt the FTS index and analyzed in ${secs(tIndex)}s`)

  // Summary
  const byDept = await db.all<{ department: string; n: number }>(sql`
    select department, count(*) as n from products group by department order by count(*) desc`)
  const byGroup = await db.all<{ category_group: string; n: number }>(sql`
    select category_group, count(*) as n from products group by category_group order by count(*) desc`)
  const byTier = await db.all<{ tier: string; n: number }>(sql`
    select tier, count(*) as n from products group by tier order by count(*) desc`)
  const [price] = await db.all<{ min: number; median: number; max: number }>(sql`
    select min(price) as min,
           (select price from products order by price limit 1 offset (select count(*) / 2 from products)) as median,
           max(price) as max
    from products`)
  const [uniq] = await db.all<{ total: number; names: number; slugs: number }>(sql`
    select count(*) as total, count(distinct name) as names, count(distinct slug) as slugs
    from products`)
  const fmt = (rows: Array<Record<string, string | number>>, key: string): string =>
    rows
      .map((r) => `${r[key]} ${Number(r.n)} (${((Number(r.n) / size) * 100).toFixed(1)}%)`)
      .join(' · ')
  console.log('department:', fmt(byDept, 'department'))
  console.log('group:', fmt(byGroup, 'category_group'))
  console.log('tier:', fmt(byTier, 'tier'))
  console.log(`price TWD: min ${price?.min} · median ${price?.median} · max ${price?.max}`)
  console.log(
    `unique names ${uniq?.names}/${uniq?.total} · unique slugs ${uniq?.slugs}/${uniq?.total}` +
      (uniq && (uniq.names !== uniq.total || uniq.slugs !== uniq.total) ? '  <-- NOT UNIQUE' : ''),
  )
  console.log(`catalog ${CATALOG_VERSION} digest ${digest.digest('hex')}`)
  console.log(`done in ${secs(started)}s`)
} finally {
  await handle.close()
}
