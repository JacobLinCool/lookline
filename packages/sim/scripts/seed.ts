/**
 * `pnpm --filter @lookline/sim seed` — replace the simulated social history in the local SQLite
 * database: delete previous simulation rows (users `u_…` and everything hanging off them, never
 * articles/brands), generate personas, simulate 60 days of purchases / Looks / Asks / remixes /
 * Together editions / shares / feedback through the engine write paths, run the analytics and
 * print a summary. Ship the result to D1 with `pnpm d1:local` / `pnpm d1:remote`.
 *
 *   --seed 20260918   --n 1200   --days 60   --now 2026-09-18T12:00:00Z   --concurrency 1
 */
import { sql } from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import { runAnalytics } from '@lookline/engine'
import { generatePersonas } from '../src/personas'
import { simulateSocial } from '../src/simulate'
import { createDbSink } from '../src/sink/db'

loadEnv()

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const seed = Number(arg('seed') ?? process.env.SIM_SEED ?? process.env.CATALOG_SEED ?? 20260918)
const n = Number(arg('n') ?? process.env.SIM_USERS ?? 1200)
const days = Number(arg('days') ?? 60)
const nowArg = arg('now') ?? process.env.SIM_NOW
// The script is the runtime boundary: the clock is read once here and passed down as `now`.
const now = nowArg ? new Date(nowArg) : new Date()
// SQLite serialises writes on one connection; a strict sequential order keeps ids deterministic.
const concurrency = Number(arg('concurrency') ?? 1)

const handle = createLocalDb()
const { db } = handle
const t0 = performance.now()
const elapsed = (): string => `${((performance.now() - t0) / 1000).toFixed(1)}s`

/** `LIKE 'u\_%'` — the underscore is escaped so only simulation ids match. */
const SIM = sql`like 'u\\_%' escape '\\'`

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const rows = await db.all<{ n: number | string }>(query)
  return Number(rows[0]?.n ?? 0)
}

async function cleanup(): Promise<void> {
  const statements = [
    sql`delete from feedback_events where user_id ${SIM}`,
    sql`delete from preference_snapshots where user_id ${SIM}`,
    sql`delete from ask_responses where responder_user_id ${SIM} or ask_id in (select id from asks where asker_id ${SIM} or target_user_id ${SIM})`,
    sql`delete from interactions where actor_user_id ${SIM} or target_user_id ${SIM}`,
    sql`delete from purchases where user_id ${SIM} or for_user_id ${SIM}`,
    sql`delete from asks where asker_id ${SIM} or target_user_id ${SIM}`,
    sql`delete from look_participants where user_id ${SIM}`,
    sql`delete from lineage_stats where root_look_id in (select id from looks where owner_id ${SIM})`,
    sql`delete from looks where owner_id ${SIM}`,
    sql`delete from relationships where a_user_id ${SIM} or b_user_id ${SIM}`,
    sql`delete from intent_sessions where user_id ${SIM}`,
    sql`delete from sessions where user_id ${SIM}`,
    sql`delete from sim_personas where user_id ${SIM}`,
    sql`delete from users where id ${SIM}`,
  ]
  for (const statement of statements) await db.run(statement)
}

async function summary(): Promise<void> {
  const users = await count(sql`select count(*) as n from users where id ${SIM}`)
  const personas = await count(
    sql`select count(*) as n from users where is_persona = 1 and id ${SIM}`,
  )
  const purchases = await count(sql`select count(*) as n from purchases where user_id ${SIM}`)
  const gifts = await count(
    sql`select count(*) as n from purchases where user_id ${SIM} and for_kind = 'other'`,
  )
  const fromLooks = await count(
    sql`select count(*) as n from purchases where user_id ${SIM} and source_look_id is not null`,
  )
  const looksByKind = await db.all<{ kind: string; n: number | string }>(
    sql`select kind, count(*) as n from looks where owner_id ${SIM} group by kind order by kind`,
  )
  const lineage = await db.all<{
    max_depth: number
    cross: number | string
    deep: number | string
  }>(
    sql`select coalesce(max(depth), 0) as max_depth,
               count(*) filter (where clusters_reached >= 3) as cross,
               count(*) filter (where depth >= 4) as deep
        from lineage_stats`,
  )
  const asksTotal = await count(sql`select count(*) as n from asks where asker_id ${SIM}`)
  const asksAnswered = await count(
    sql`select count(*) as n from asks where asker_id ${SIM} and status = 'answered'`,
  )
  const interactions = await db.all<{ type: string; n: number | string }>(
    sql`select type, count(*) as n from interactions where actor_user_id ${SIM} group by type order by count(*) desc`,
  )
  const feedback = await count(sql`select count(*) as n from feedback_events where user_id ${SIM}`)
  const snapshots = await count(
    sql`select count(distinct user_id) as n from preference_snapshots where user_id ${SIM}`,
  )
  const relationships = await count(sql`select count(*) as n from relationships`)
  const signals = await count(sql`select count(*) as n from trend_signals`)
  const signalDays = await count(sql`select count(distinct day) as n from trend_signals`)
  const manufacturing = await count(sql`select count(*) as n from manufacturing_recommendations`)
  const intents = await count(sql`select count(*) as n from intent_sessions where user_id ${SIM}`)

  console.log('\n=== simulation summary ===')
  console.log(`users            ${users} (${personas} demo personas)`)
  console.log(
    `purchases        ${purchases} (${gifts} gifts = ${purchases > 0 ? Math.round((100 * gifts) / purchases) : 0} %, ${fromLooks} attributed to a Look)`,
  )
  console.log(`looks            ${looksByKind.map((r) => `${r.kind}=${r.n}`).join(', ')}`)
  console.log(
    `lineages         max depth ${lineage[0]?.max_depth ?? 0}, ${lineage[0]?.deep ?? 0} with depth ≥ 4, ${lineage[0]?.cross ?? 0} reaching ≥ 3 taste clusters`,
  )
  console.log(`asks             ${asksAnswered}/${asksTotal} answered`)
  console.log(`interactions     ${interactions.map((r) => `${r.type}=${r.n}`).join(', ')}`)
  console.log(`feedback events  ${feedback} (${snapshots} users with preference snapshots)`)
  console.log(`intent sessions  ${intents}`)
  console.log(`relationships    ${relationships}`)
  console.log(`trend signals    ${signals} rows over ${signalDays} days`)
  console.log(`manufacturing    ${manufacturing} recommendations`)
  console.log(`wall time        ${elapsed()}`)
}

async function main(): Promise<void> {
  console.log(`seed=${seed} n=${n} days=${days} now=${now.toISOString()} db=${handle.url}`)
  await migrateLocal(handle)
  const articles = await count(sql`select count(*) as n from articles`)
  if (articles === 0) {
    throw new Error('articles table is empty — run `pnpm seed:catalog` first')
  }
  await cleanup()
  console.log(`cleaned previous simulation rows (${elapsed()})`)

  const personas = generatePersonas(seed, n)
  const sink = createDbSink(db, { maxParams: 30_000 })
  const result = await simulateSocial(sink, {
    seed,
    now,
    days,
    personas,
    concurrency,
    log: (m) => console.log(`[sim ${elapsed()}] ${m}`),
  })
  console.log(
    `simulated: ${result.purchases} purchases, looks ${JSON.stringify(result.looks)}, ${result.asks} asks, ${result.answers} answers, ${result.interactions} direct interactions, ${result.feedback} direct feedback events (${(result.durationMs / 1000).toFixed(1)} s)`,
  )
  for (const s of result.trendSeeds)
    console.log(`  trend seed ${s.slug}: root ${s.rootLookId} by ${s.carrierId}, ${s.looks} Looks`)
  const skipped = Object.entries(result.skipped).filter(([, v]) => v > 0)
  if (skipped.length > 0)
    console.log(`  skipped: ${skipped.map(([k, v]) => `${k}=${v}`).join(', ')}`)

  console.log(`running analytics (${elapsed()})`)
  const analytics = await runAnalytics(db, { now })
  console.log(
    `analytics: ${analytics.relationships} relationships, ${analytics.clusters} taste clusters, ${analytics.lineages} lineages, ${analytics.trendSignals} trend signals, ${analytics.manufacturing} manufacturing rows (${analytics.durationMs} ms)`,
  )
  await summary()
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => handle.close())
