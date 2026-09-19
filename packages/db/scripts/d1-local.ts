/**
 * `pnpm --filter @lookline/db d1:local` — copy the seeded local SQLite database into the D1
 * database that `vinext dev` uses (Miniflare's `.wrangler/state` file). Stop the dev server
 * first; run `wrangler d1 migrations apply lookline --local` once before so the tables exist.
 * Every listed table is replaced wholesale, then the FTS index is rebuilt.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { FTS_REBUILD_SQL } from '../src/fts'
import { findLocalD1File, loadEnv, localDbPath, repoRoot } from '../src/node'
import { TABLE_ORDER } from '../src/tables'

loadEnv()

const source = localDbPath()
if (!fs.existsSync(source)) {
  console.error(`no local database at ${source} — run \`pnpm db:migrate && pnpm seed\` first`)
  process.exit(1)
}
const target = findLocalD1File(path.join(repoRoot(), 'apps/web'))
if (!target) {
  console.error(
    'no local D1 database yet — run `pnpm --filter @lookline/web exec wrangler d1 migrations apply lookline --local` first',
  )
  process.exit(1)
}

const client = createClient({ url: `file:${target}` })
try {
  await client.execute({ sql: `attach database ? as seed`, args: [source] })
  const existing = new Set(
    (await client.execute(`select name from sqlite_master where type = 'table'`)).rows.map((r) =>
      String(r['name']),
    ),
  )
  await client.execute('pragma foreign_keys = off')
  for (const table of [...TABLE_ORDER].toReversed()) {
    if (existing.has(table)) await client.execute(`delete from main."${table}"`)
  }
  for (const table of TABLE_ORDER) {
    if (!existing.has(table)) {
      console.warn(`skipping ${table}: not in the local D1 (migrations not applied?)`)
      continue
    }
    const columns = (await client.execute(`pragma table_info("${table}")`)).rows
      .map((r) => `"${String(r['name'])}"`)
      .join(',')
    const result = await client.execute(
      `insert into main."${table}" (${columns}) select ${columns} from seed."${table}"`,
    )
    console.log(`${table.padEnd(30)} ${String(result.rowsAffected).padStart(8)} rows`)
  }
  if (existing.has('products_fts')) await client.execute(FTS_REBUILD_SQL)
  await client.execute('analyze')
  await client.execute('pragma foreign_keys = on')
  console.log(`local D1 refreshed: ${target}`)
} finally {
  client.close()
}
