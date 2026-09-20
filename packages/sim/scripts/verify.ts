import { sql } from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'

loadEnv()
const handle = createLocalDb()
let failures = 0

function check(name: string, value: number, minimum = 1): void {
  const ok = value >= minimum
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${value}`)
  if (!ok) failures++
}

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const rows = await handle.db.all<{ n: number | string }>(query)
  return Number(rows[0]?.n ?? 0)
}

async function main(): Promise<void> {
  check(
    'simulated users',
    await scalar(sql`select count(*) as n from users where id like 'sim_u_%'`),
    2,
  )
  check(
    'accepted friendships',
    await scalar(
      sql`select count(*) as n from friendships where low_user_id like 'sim_u_%' and state = 'accepted'`,
    ),
  )
  check(
    'activity sharing rows',
    await scalar(sql`select count(*) as n from activity_sharing where user_id like 'sim_u_%'`),
    2,
  )
  check(
    'purchases',
    await scalar(sql`select count(*) as n from purchases where user_id like 'sim_u_%'`),
    2,
  )
  check('Cards', await scalar(sql`select count(*) as n from cards where id like 'sim_card_%'`), 2)
  check(
    'Collections',
    await scalar(sql`select count(*) as n from collections where id like 'sim_col_%'`),
  )
  check(
    'intent sessions',
    await scalar(sql`select count(*) as n from intent_sessions where user_id like 'sim_u_%'`),
    2,
  )
  check(
    'feedback events',
    await scalar(sql`select count(*) as n from feedback_events where user_id like 'sim_u_%'`),
    2,
  )
  if (failures) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => handle.close())
