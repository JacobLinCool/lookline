import { sql } from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import { runAnalytics } from '@lookline/engine'
import { simulateCanonical } from '../src/simulate'

loadEnv()

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const seed = Number(arg('seed') ?? process.env.SIM_SEED ?? 20_260_918)
const users = Number(arg('n') ?? process.env.SIM_USERS ?? 120)
const days = Number(arg('days') ?? 60)
const now = new Date(arg('now') ?? process.env.SIM_NOW ?? Date.now())
const handle = createLocalDb()

async function cleanup(): Promise<void> {
  const statements = [
    sql`delete from collection_members where collection_id like 'sim_col_%'`,
    sql`delete from collections where id like 'sim_col_%'`,
    sql`delete from feedback_events where user_id like 'sim_u_%'`,
    sql`delete from purchases where user_id like 'sim_u_%'`,
    sql`delete from cards where id like 'sim_card_%'`,
    sql`delete from card_candidates where id like 'sim_cc_%'`,
    sql`delete from generation_attempts where id like 'sim_ga_%'`,
    sql`delete from card_sessions where id like 'sim_cs_%'`,
    sql`delete from personas where id like 'sim_per_%'`,
    sql`delete from friendships where low_user_id like 'sim_u_%' or high_user_id like 'sim_u_%'`,
    sql`delete from activity_sharing where user_id like 'sim_u_%'`,
    sql`delete from intent_sessions where user_id like 'sim_u_%'`,
    sql`delete from preference_snapshots where user_id like 'sim_u_%'`,
    sql`delete from sim_personas where user_id like 'sim_u_%'`,
    sql`delete from sessions where user_id like 'sim_u_%'`,
    sql`delete from users where id like 'sim_u_%'`,
  ]
  for (const statement of statements) await handle.db.run(statement)
}

async function main(): Promise<void> {
  await migrateLocal(handle)
  await cleanup()
  const result = await simulateCanonical(handle.db, {
    seed,
    users,
    days,
    now,
    log: (message) => console.log(`[sim] ${message}`),
  })
  const analytics = await runAnalytics(handle.db, now)
  console.log(
    JSON.stringify({ environment: handle.url, seed, days, ...result, analytics }, null, 2),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => handle.close())
