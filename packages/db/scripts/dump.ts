/**
 * `pnpm --filter @lookline/db dump` — export the seeded local SQLite database as plain SQL for
 * `wrangler d1 execute --remote --file` (one file per table under `data/d1/`, statements kept
 * under D1's 100 KB limit, FTS index rebuilt last). The migration tables are skipped: apply
 * schema changes with `wrangler d1 migrations apply` before importing.
 *
 *   --out data/d1   --tables products,brands
 */
import fs from 'node:fs'
import path from 'node:path'
import { FTS_REBUILD_SQL } from '../src/fts'
import { createLocalDb, loadEnv, repoRoot } from '../src/node'
import { TABLE_ORDER } from '../src/tables'

loadEnv()

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const STATEMENT_BYTES = 80_000
const PAGE = 2_000

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return `X'${Buffer.from(bytes).toString('hex')}'`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

const outDir = path.resolve(repoRoot(), arg('out') ?? 'data/d1')
const only = arg('tables')
  ?.split(',')
  .map((t) => t.trim())
const tables = TABLE_ORDER.filter((t) => !only || only.includes(t))

const handle = createLocalDb()
try {
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  const reset = [...TABLE_ORDER].toReversed().map((t) => `DELETE FROM "${t}";`)
  fs.writeFileSync(path.join(outDir, '00_reset.sql'), reset.join('\n') + '\n')

  let index = 1
  for (const table of tables) {
    const info = await handle.client.execute(`pragma table_info("${table}")`)
    const columns = info.rows.map((r) => String(r['name']))
    if (columns.length === 0) continue
    const file = path.join(outDir, `${String(index++).padStart(2, '0')}_${table}.sql`)
    const out = fs.createWriteStream(file)
    const head = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES\n`
    let buffer: string[] = []
    let bytes = 0
    let rows = 0
    const flush = () => {
      if (buffer.length === 0) return
      out.write(head + buffer.join(',\n') + ';\n')
      buffer = []
      bytes = 0
    }
    let last = -1
    for (;;) {
      const page = await handle.client.execute({
        sql: `select rowid as __rowid, ${columns.map((c) => `"${c}"`).join(',')} from "${table}" where rowid > ? order by rowid limit ?`,
        args: [last, PAGE],
      })
      if (page.rows.length === 0) break
      for (const row of page.rows) {
        last = Number(row['__rowid'])
        const tuple = `(${columns.map((c) => literal(row[c])).join(',')})`
        if (bytes + tuple.length > STATEMENT_BYTES) flush()
        buffer.push(tuple)
        bytes += tuple.length + 2
        rows++
      }
      if (page.rows.length < PAGE) break
    }
    flush()
    await new Promise<void>((resolve, reject) => {
      out.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })
    const size = fs.statSync(file).size
    console.log(
      `${table.padEnd(30)} ${String(rows).padStart(8)} rows  ${(size / 1e6).toFixed(1)} MB`,
    )
  }
  fs.writeFileSync(path.join(outDir, '99_finish.sql'), `${FTS_REBUILD_SQL};\nANALYZE;\n`)
  console.log(`written to ${outDir}`)
} finally {
  await handle.close()
}
