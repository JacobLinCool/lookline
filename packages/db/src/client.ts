import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from './schema'

/**
 * The shape of a D1 binding we rely on (structurally compatible with `D1Database` from the
 * Workers runtime types, which this Node-friendly package deliberately does not reference).
 */
export interface D1Like {
  prepare(query: string): unknown
  batch(statements: unknown[]): Promise<unknown>
  exec(query: string): Promise<unknown>
}

/**
 * The database handle every package function takes as its first argument. Cloudflare D1 in the
 * web app (`createD1Db`) and libsql on a local SQLite file for scripts and tests
 * (`createLocalDb` in `@lookline/db/node`) are both async drizzle SQLite databases, so the
 * engine code is written once against this type. Only `select` / `insert` / `update` / `delete`
 * builders and `db.all()` / `db.get()` / `db.run()` are used — never `db.transaction()`, which D1
 * rejects, and never more than 100 bound parameters per statement (see `sql.ts`).
 */
// oxlint-disable-next-line typescript/no-explicit-any -- run-result type differs per driver
export type Database = BaseSQLiteDatabase<'async', any, typeof schema>

/** Drizzle over a D1 binding (`env.DB`). Cheap; cache one per isolate. */
export function createD1Db(binding: D1Like): Database {
  return drizzleD1(binding as never, { schema }) as unknown as Database
}
