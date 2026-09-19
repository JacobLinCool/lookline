/**
 * Database access for the web app: Drizzle over the D1 binding (`env.DB` from wrangler.jsonc),
 * one handle per isolate. Always go through `getDb().db`. Tests swap the handle with `setDb`.
 */
import { env } from 'cloudflare:workers'
import { createD1Db, type Database } from '@lookline/db'

let override: Database | null = null
let cached: Database | null = null

/** Replace the database for the current process (tests); `null` restores the D1 binding. */
export function setDb(db: Database | null): void {
  override = db
}

export function getDb(): { db: Database } {
  if (override) return { db: override }
  if (!cached) {
    const binding = env.DB
    if (!binding) throw new Error('[lookline] D1 binding `DB` is missing (see wrangler.jsonc)')
    cached = createD1Db(binding)
  }
  return { db: cached }
}

export type { Database }
