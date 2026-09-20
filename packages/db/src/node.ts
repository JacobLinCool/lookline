/**
 * @lookline/db/node — the local SQLite side of the database: libsql over a file (or `:memory:`),
 * `.env` loading and drizzle migrations for scripts and tests. Never import this from the web
 * app; it depends on Node and a native libsql binary.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { Database } from './client'
import * as schema from './schema'

export interface DbHandle {
  db: Database
  client: Client
  /** Absolute file path, or `:memory:`. */
  url: string
  close: () => Promise<void>
}

const here = path.dirname(fileURLToPath(import.meta.url))

/** Monorepo root (the directory containing `pnpm-workspace.yaml`). */
export function repoRoot(startDir: string = here): string {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(here, '../../..')
}

/** `packages/db/drizzle` — the migration folder shared with `wrangler d1 migrations`. */
export const migrationsFolder = path.resolve(here, '../drizzle')

/**
 * Load the repository root `.env` into process.env (without overriding existing values).
 * Walks up from `startDir` until it finds a `pnpm-workspace.yaml` next to a `.env`.
 */
export function loadEnv(startDir: string = process.cwd()): string | undefined {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 8; i++) {
    const envPath = path.join(dir, '.env')
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
          const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
          if (!m) continue
          const key = m[1]!
          if (process.env[key] !== undefined) continue
          let value = m[2]!
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          )
            value = value.slice(1, -1)
          process.env[key] = value
        }
        return envPath
      }
      return undefined
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/** `${LOOKLINE_SQLITE}` (default `data/lookline.sqlite`) resolved against the repo root. */
export function localDbPath(): string {
  return path.resolve(repoRoot(), process.env.LOOKLINE_SQLITE ?? 'data/lookline.sqlite')
}

/**
 * Open (creating if needed) the local SQLite database. `target` is an absolute or repo-relative
 * file path or `:memory:`. Foreign keys are enforced like on D1.
 */
export function createLocalDb(target: string = localDbPath()): DbHandle {
  const isMemory = target === ':memory:'
  const file = isMemory ? target : path.resolve(repoRoot(), target)
  if (!isMemory) fs.mkdirSync(path.dirname(file), { recursive: true })
  const client = createClient({ url: isMemory ? ':memory:' : `file:${file}` })
  const db = drizzle(client, { schema }) as unknown as Database
  // Enforced like on D1; libsql serialises statements on one connection, so this runs first.
  void client.execute('pragma foreign_keys = on')
  return {
    db,
    client,
    url: file,
    close: async () => {
      client.close()
    },
  }
}

/**
 * Apply every migration in `packages/db/drizzle` to a local handle, tracked by the SQL's own
 * hash rather than by `_journal.json`'s `when`.
 *
 * Drizzle's migrator reads the largest recorded `created_at` once and then runs only the entries
 * whose `when` exceeds it. Migrations 0003-0014 were given hand-written `when` values a few days
 * in the future, so every entry `drizzle-kit generate` has written since carries a smaller number
 * and was skipped in silence on any database that had already run 0002 — permanently, because the
 * recorded maximum only grows. `pnpm db:migrate` reported success over a schema with no
 * `friendships`, and `pnpm d1:local` then failed on `no such table: seed.friendships`.
 *
 * A hash answers "has this SQL run here" directly: out-of-order `when` values stop mattering, and
 * a migration whose file was rewritten after it was applied (0011 and 0012 were, when a merge
 * renumbered what had landed first) is seen as unapplied and runs. `wrangler d1 migrations apply`
 * keys on the file name and was never affected, which is why D1 has the tables this did not.
 */
export async function migrateLocal(handle: DbHandle): Promise<void> {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: readonly { when: number; tag: string }[] }

  await handle.client.execute(
    'create table if not exists __drizzle_migrations (id integer primary key autoincrement, hash text not null, created_at numeric)',
  )
  const applied = new Set(
    (await handle.client.execute('select hash from __drizzle_migrations')).rows.map((row) =>
      String(row['hash']),
    ),
  )

  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), 'utf8')
    const hash = createHash('sha256').update(sql).digest('hex')
    if (applied.has(hash)) continue
    const statements = sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
    // One transaction per migration, like drizzle's own: a failed statement leaves nothing behind.
    await handle.client.batch(
      [
        ...statements,
        {
          sql: 'insert into __drizzle_migrations ("hash", "created_at") values (?, ?)',
          args: [hash, entry.when],
        },
      ],
      'write',
    )
  }
}

/** A migrated in-memory database for tests. */
export async function createTestDb(): Promise<DbHandle> {
  const handle = createLocalDb(':memory:')
  await migrateLocal(handle)
  return handle
}

/**
 * The SQLite file behind the local D1 binding of `wrangler dev` / `vinext dev`
 * (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite`), or null when the dev
 * server has never created it.
 */
export function findLocalD1File(appDir: string = path.join(repoRoot(), 'apps/web')): string | null {
  return listLocalD1Files(appDir)[0] ?? null
}

/**
 * Every local D1 object file, most recently touched first. Miniflare creates one file per
 * `database_id`, so an old id leaves a stale file behind; the active one is the file wrangler
 * touched last (its `-wal` / `-shm` siblings count, they change on every open).
 */
export function listLocalD1Files(appDir: string = path.join(repoRoot(), 'apps/web')): string[] {
  const dir = path.join(appDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  if (!fs.existsSync(dir)) return []
  const touched = (file: string): number =>
    Math.max(
      ...['', '-wal', '-shm'].map((suffix) => {
        try {
          return fs.statSync(file + suffix).mtimeMs
        } catch {
          return 0
        }
      }),
    )
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
    .map((f) => path.join(dir, f))
    .toSorted((a, b) => touched(b) - touched(a))
}
