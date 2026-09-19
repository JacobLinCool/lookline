/**
 * `pnpm d1:remote` — push the dumped local database (`data/d1/*.sql`, see `pnpm d1:dump`) into
 * the production D1 database with `wrangler d1 execute --remote --file`, one file at a time in
 * order. Run `pnpm d1:migrate:remote` first so the tables exist. Requires `wrangler login`.
 *
 *   pnpm d1:remote                # every file
 *   pnpm d1:remote --from 02      # resume at file 02_products.sql
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'data/d1')
const appDir = path.join(root, 'apps/web')
const from = (() => {
  const i = process.argv.indexOf('--from')
  return i >= 0 ? (process.argv[i + 1] ?? '') : ''
})()

if (!fs.existsSync(dir)) {
  console.error(`no dump at ${dir} — run \`pnpm d1:dump\` first`)
  process.exit(1)
}
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .toSorted()
  .filter((f) => f >= from)

for (const file of files) {
  const size = (fs.statSync(path.join(dir, file)).size / 1e6).toFixed(1)
  console.log(`\n→ ${file} (${size} MB)`)
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'lookline',
      '--remote',
      '--yes',
      '--file',
      path.join(dir, file),
    ],
    { cwd: appDir, stdio: 'inherit' },
  )
  if (result.status !== 0) {
    console.error(
      `\nimport failed at ${file}; fix the cause and resume with --from ${file.slice(0, 2)}`,
    )
    process.exit(result.status ?? 1)
  }
}
console.log('\nremote D1 import complete')
