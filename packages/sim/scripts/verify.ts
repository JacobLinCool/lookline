/**
 * `pnpm --filter @lookline/sim verify` — SQL checks on the seeded simulation: deep cross-cluster
 * lineages, demo persona completeness, trend signals over the window, manufacturing
 * recommendations. Exit code 1 when a check fails.
 */
import { sql } from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'

loadEnv()
const handle = createLocalDb()
const { db } = handle
let failures = 0

function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failures++
}

const SIM = sql`like 'u\\_%' escape '\\'`

async function main(): Promise<void> {
  const lineage = await db.all<{
    root_look_id: string
    depth: number
    clusters_reached: number
    nodes: number
  }>(
    sql`select root_look_id, depth, clusters_reached, nodes from lineage_stats
        where depth >= 4 and clusters_reached >= 3 order by depth desc, clusters_reached desc limit 5`,
  )
  check(
    'lineage depth ≥ 4 and clustersReached ≥ 3',
    lineage.length >= 1,
    lineage
      .map((r) => `${r.root_look_id} d=${r.depth} c=${r.clusters_reached} n=${r.nodes}`)
      .join('; ') || 'none',
  )

  const demo = await db.all<{
    handle: string
    purchases: number | string
    looks: number | string
    snapshots: number | string
    relationships: number | string
  }>(
    sql`select u.handle,
               (select count(*) from purchases p where p.user_id = u.id) as purchases,
               (select count(*) from looks l where l.owner_id = u.id) as looks,
               (select count(*) from preference_snapshots s where s.user_id = u.id) as snapshots,
               (select count(*) from relationships r where r.a_user_id = u.id or r.b_user_id = u.id) as relationships
        from users u where u.is_persona = 1 and u.id ${SIM} order by u.id`,
  )
  check('demo personas present', demo.length >= 8, `${demo.length} personas`)
  for (const r of demo) {
    const ok =
      Number(r.purchases) >= 3 &&
      Number(r.looks) >= 2 &&
      Number(r.snapshots) >= 1 &&
      Number(r.relationships) >= 1
    check(
      `persona ${r.handle}`,
      ok,
      `purchases=${r.purchases} looks=${r.looks} snapshots=${r.snapshots} relationships=${r.relationships}`,
    )
  }

  const signals = await db.all<{
    days: number | string
    first: string
    last: string
    rows: number | string
  }>(
    sql`select count(distinct day) as days, min(day) as first, max(day) as last, count(*) as rows from trend_signals`,
  )
  const s = signals[0]
  check(
    'trend_signals cover the last 60 days',
    Number(s?.days ?? 0) >= 60,
    `${s?.days ?? 0} days (${s?.first} → ${s?.last}), ${s?.rows ?? 0} rows`,
  )
  const emerging = await db.all<{ n: number | string }>(
    sql`select count(*) as n from trend_signals where emerging = 1 and day = (select max(day) from trend_signals)`,
  )
  console.log(`info  emerging signals on the latest day: ${emerging[0]?.n ?? 0}`)

  const manufacturing = await db.all<{ n: number | string }>(
    sql`select count(*) as n from manufacturing_recommendations`,
  )
  check(
    'manufacturing_recommendations non-empty',
    Number(manufacturing[0]?.n ?? 0) > 0,
    `${manufacturing[0]?.n ?? 0} rows`,
  )

  const gifts = await db.all<{ total: number | string; gifts: number | string }>(
    sql`select count(*) as total, count(*) filter (where for_kind = 'other') as gifts from purchases where user_id ${SIM}`,
  )
  const g = gifts[0]
  const share = Number(g?.total ?? 0) > 0 ? Number(g?.gifts ?? 0) / Number(g?.total ?? 1) : 0
  check(
    'gift purchases ≈ 20 %',
    share >= 0.14 && share <= 0.3,
    `${(share * 100).toFixed(1)} % of ${g?.total}`,
  )

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => handle.close())
