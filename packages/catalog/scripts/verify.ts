/**
 * Verifies the seeded catalog in the local database: distribution stats and uniqueness
 * assertions (slug, name, duplicate key). Exits 1 on a failed assertion; exits 0 (with a note)
 * when the tables are empty.
 */
import { sql } from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'
import { DEPT_SHARE, GROUP_SHARE, SEASON_TARGET, TIER_TARGET } from '../src/generate/distribution'
import { BRAND_SIZE_MAX, BRAND_SIZE_MIN } from '../src/generate/brands'

loadEnv()

const handle = createLocalDb()
const { db } = handle
const failures: string[] = []
const check = (ok: boolean, message: string): void => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`)
  if (!ok) failures.push(message)
}
const pct = (n: number, total: number): string => `${((n / total) * 100).toFixed(2)}%`
type Count = { k: string; c: number }

try {
  const totals = await db.all<{ total: number }>(sql`select count(*) as total from products`)
  const n = Number(totals[0]?.total ?? 0)
  if (n === 0) {
    console.log('products table is empty — nothing to verify (run pnpm seed:catalog first)')
    process.exit(0)
  }
  const brandRows = await db.all<{ brands: number }>(sql`select count(*) as brands from brands`)
  console.log(`products ${n} · brands ${brandRows[0]?.brands}`)

  const [u] = await db.all<{ slugs: number; names: number; dupkeys: number }>(sql`
    select count(distinct slug) as slugs,
           count(distinct name) as names,
           count(distinct brand_id || '|' || subcategory || '|' || department || '|' || color_name || '|'
                 || material || '|' || pattern || '|' || coalesce(fit, silhouette, '-') || '|'
                 || coalesce(json_extract(attributes, '$.edition'), '1')) as dupkeys
    from products`)
  check(Number(u!.slugs) === n, `slug unique (${u!.slugs}/${n})`)
  check(Number(u!.names) === n, `name unique (${u!.names}/${n})`)
  check(Number(u!.dupkeys) === n, `dupKey unique (${u!.dupkeys}/${n})`)

  const dept = await db.all<Count>(sql`
    select department as k, count(*) as c from products group by 1 order by count(*) desc`)
  console.log('department:')
  for (const row of dept) {
    const share = Number(row.c) / n
    const target = DEPT_SHARE[row.k as keyof typeof DEPT_SHARE] ?? 0
    check(
      Math.abs(share - target) <= 0.03,
      `  ${row.k} ${pct(Number(row.c), n)} (target ${pct(target, 1)})`,
    )
  }
  const tier = await db.all<Count>(sql`
    select tier as k, count(*) as c from products group by 1 order by count(*) desc`)
  console.log('tier:')
  for (const row of tier) {
    const share = Number(row.c) / n
    const target = TIER_TARGET[row.k as keyof typeof TIER_TARGET] ?? 0
    check(
      Math.abs(share - target) <= 0.03,
      `  ${row.k} ${pct(Number(row.c), n)} (target ${pct(target, 1)})`,
    )
  }
  const groups = await db.all<Count>(sql`
    select category_group as k, count(*) as c from products group by 1 order by count(*) desc`)
  console.log('group:')
  for (const row of groups) {
    const share = Number(row.c) / n
    let target = 0
    for (const d of Object.keys(DEPT_SHARE) as Array<keyof typeof DEPT_SHARE>) {
      target +=
        (DEPT_SHARE[d] * (GROUP_SHARE[d][row.k as keyof (typeof GROUP_SHARE)['women']] ?? 0)) / 100
    }
    check(
      Math.abs(share - target) <= 0.03,
      `  ${row.k} ${pct(Number(row.c), n)} (target ${pct(target, 1)})`,
    )
  }
  const seasons = await db.all<Count>(sql`
    select json_extract(seasons, '$[0]') as k, count(*) as c from products group by 1 order by count(*) desc`)
  console.log('primary season (informational; targets are ±3 pp in the spec):')
  for (const row of seasons) {
    const target = SEASON_TARGET[row.k as keyof typeof SEASON_TARGET] ?? 0
    console.log(`     ${row.k} ${pct(Number(row.c), n)} (target ${pct(target, 1)})`)
  }
  const brandShare = await db.all<{ min: number; max: number }>(sql`
    select min(c) * 1.0 / ${n} as min, max(c) * 1.0 / ${n} as max
    from (select count(*) as c from products group by brand_id) t`)
  check(
    (brandShare[0]?.min ?? 0) >= BRAND_SIZE_MIN * 0.8 &&
      (brandShare[0]?.max ?? 1) <= BRAND_SIZE_MAX * 1.2,
    `brand shares within [${pct(BRAND_SIZE_MIN, 1)}, ${pct(BRAND_SIZE_MAX, 1)}] ±20% (min ${pct(brandShare[0]?.min ?? 0, 1)}, max ${pct(brandShare[0]?.max ?? 0, 1)})`,
  )
  const [price] = await db.all<{ min: number; median: number; max: number; mean: number }>(sql`
    select min(price) as min,
           (select price from products order by price limit 1 offset (select count(*) / 2 from products)) as median,
           max(price) as max, cast(avg(price) as integer) as mean from products`)
  console.log(
    `price TWD: min ${price?.min} · median ${price?.median} · mean ${price?.mean} · max ${price?.max}`,
  )
  const [rating] = await db.all<{ rated: number; mean: number; sale: number }>(sql`
    select count(*) filter (where review_count > 0) as rated,
           avg(rating) filter (where review_count > 0) as mean,
           count(*) filter (where json_type(attributes, '$.compareAtPrice') is not null) as sale
    from products`)
  console.log(
    `rated ${pct(Number(rating?.rated), n)} · mean rating ${rating?.mean?.toFixed(2)} · on sale ${pct(Number(rating?.sale), n)}`,
  )
  const aesthetics = await db.all<Count>(sql`
    select json_extract(attributes, '$.primaryAesthetic') as k, count(*) as c from products group by 1 order by count(*) desc`)
  const least = aesthetics[aesthetics.length - 1]
  const most = aesthetics[0]
  console.log(
    `primary aesthetics: ${aesthetics.length} distinct · most ${most?.k} ${pct(Number(most?.c), n)} · least ${least?.k} ${pct(Number(least?.c), n)}`,
  )
  check(aesthetics.length === 32, 'every aesthetic is primary somewhere')
  const [subs] = await db.all<{ subs: number; min: number }>(sql`
    select count(*) as subs, min(c) as min from (select count(*) as c from products group by subcategory) t`)
  check(
    Number(subs?.subs) === 109,
    `109 subcategories present (${subs?.subs}), smallest ${subs?.min}`,
  )
  const [vec] = await db.all<{ bad: number }>(sql`
    select count(*) as bad from products where json_array_length(style_vector) <> 64`)
  check(Number(vec?.bad) === 0, 'every style_vector has 64 dims')
  const [pv] = await db.all<{ missing: number }>(sql`
    select count(*) as missing from products p where not exists (select 1 from product_vectors v where v.product_id = p.id)`)
  check(Number(pv?.missing) === 0, 'every product has a product_vectors row')
  const [fts] = await db.all<{ hits: number }>(sql`
    select count(*) as hits from products_fts where products_fts match '"shirt"*'`)
  console.log(`fts: ${fts?.hits} products match "shirt"*`)

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`)
    process.exitCode = 1
  } else {
    console.log('\nall checks passed')
  }
} finally {
  await handle.close()
}
