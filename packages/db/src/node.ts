/**
 * @lookline/db/node — the local SQLite side of the database: libsql over a file (or `:memory:`),
 * `.env` loading and drizzle migrations for scripts and tests. Never import this from the web
 * app; it depends on Node and a native libsql binary.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
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

/** Apply every migration in `packages/db/drizzle` to a local handle. */
export async function migrateLocal(handle: DbHandle): Promise<void> {
  await migrate(drizzle(handle.client, { schema }), { migrationsFolder })
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
  const dir = path.join(appDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  if (!fs.existsSync(dir)) return null
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => path.join(dir, f))
    .toSorted((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return files[0] ?? null
}
