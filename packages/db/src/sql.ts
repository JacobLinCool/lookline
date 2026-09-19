/**
 * SQLite / D1 query helpers shared by every package.
 *
 * D1 limits that shape these helpers: 100 bound parameters per statement, 100 KB per statement,
 * no explicit transactions (`BEGIN`/`COMMIT`). Large id lists therefore travel as a single JSON
 * parameter expanded with `json_each`, and bulk inserts are chunked by parameter count.
 */
import {
  Column,
  inArray as drizzleInArray,
  is,
  notInArray as drizzleNotInArray,
  sql,
  type GetColumnData,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Database } from './client'
import { SQL_NOW_MS } from './schema'

export const D1_MAX_PARAMS = 100
/** Lists up to this length use a plain `IN (?, ?, …)`; longer ones go through `json_each`. */
const INLINE_LIST_MAX = 20

function driverValues(column: Column | SQL, values: readonly unknown[]): unknown[] {
  return values.map((v) => (is(column, Column) ? column.mapToDriverValue(v) : v))
}

/**
 * `column IN (…)`. Empty lists yield `0` (false) instead of throwing; lists longer than
 * `INLINE_LIST_MAX` are bound as one JSON array parameter and expanded with `json_each`.
 */
export function inArray<TColumn extends Column>(
  column: TColumn,
  values: ReadonlyArray<GetColumnData<TColumn, 'raw'>> | SQLWrapper,
): SQL
export function inArray(column: SQL, values: ReadonlyArray<unknown> | SQLWrapper): SQL
export function inArray(column: Column | SQL, values: ReadonlyArray<unknown> | SQLWrapper): SQL {
  if (!Array.isArray(values)) {
    return is(column, Column)
      ? drizzleInArray(column, values as SQLWrapper)
      : drizzleInArray(column as SQL, values as SQLWrapper)
  }
  if (values.length === 0) return sql`0`
  if (values.length <= INLINE_LIST_MAX) {
    return is(column, Column)
      ? drizzleInArray(column, values)
      : drizzleInArray(column as SQL, values)
  }
  const json = JSON.stringify(driverValues(column, values))
  return sql`${column} in (select value from json_each(${json}))`
}

/** `column NOT IN (…)`; empty lists yield `1` (true). */
export function notInArray<TColumn extends Column>(
  column: TColumn,
  values: ReadonlyArray<GetColumnData<TColumn, 'raw'>> | SQLWrapper,
): SQL
export function notInArray(column: SQL, values: ReadonlyArray<unknown> | SQLWrapper): SQL
export function notInArray(column: Column | SQL, values: ReadonlyArray<unknown> | SQLWrapper): SQL {
  if (!Array.isArray(values)) {
    return is(column, Column)
      ? drizzleNotInArray(column, values as SQLWrapper)
      : drizzleNotInArray(column as SQL, values as SQLWrapper)
  }
  if (values.length === 0) return sql`1`
  if (values.length <= INLINE_LIST_MAX) {
    return is(column, Column)
      ? drizzleNotInArray(column, values)
      : drizzleNotInArray(column as SQL, values)
  }
  const json = JSON.stringify(driverValues(column, values))
  return sql`${column} not in (select value from json_each(${json}))`
}

/** `now()` as integer milliseconds (database clock). */
export const sqlNowMs = (): SQL<number> => SQL_NOW_MS as SQL<number>

/** `now() - <days> days` as integer milliseconds. */
export function sqlDaysAgoMs(days: number): SQL<number> {
  const n = Math.max(0, Math.round(days))
  return sql<number>`(cast((julianday('now', ${sql.raw(`'-${n} days'`)}) - 2440587.5) * 86400000 as integer))`
}

/** A JSON-array column shares at least one element with `values` (Postgres `&&`). */
export function jsonArrayOverlaps(column: Column | SQL, values: readonly string[]): SQL {
  if (values.length === 0) return sql`0`
  if (values.length <= INLINE_LIST_MAX) {
    return sql`exists (select 1 from json_each(${column}) where value in (${sql.join(
      values.map((v) => sql`${v}`),
      sql`, `,
    )}))`
  }
  return sql`exists (select 1 from json_each(${column}) where value in (select value from json_each(${JSON.stringify(values)})))`
}

/** A JSON-array column contains `value`. */
export function jsonArrayContains(column: Column | SQL, value: string): SQL {
  return sql`exists (select 1 from json_each(${column}) where value = ${value})`
}

/** `json_type(column, '$."key"') = 'true'` — the object has `key: true`. */
export function jsonKeyIsTrue(column: Column | SQL, key: string): SQL {
  const path = `$."${key.replace(/["\\]/g, '')}"`
  return sql`json_type(${column}, ${path}) = 'true'`
}

/** Rows of a raw `db.all()` result, tolerating drivers that wrap them in `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const maybe = result as { rows?: T[] } | null | undefined
  return maybe?.rows ?? []
}

/**
 * Chunked multi-row insert: rows per statement = floor(maxParams / columns). `maxParams`
 * defaults to the D1 limit; local scripts may raise it (SQLite itself allows 32 766).
 */
export async function insertAll<TTable extends SQLiteTable>(
  db: Database,
  table: TTable,
  rows: ReadonlyArray<TTable['$inferInsert']>,
  options: { maxParams?: number; orIgnore?: boolean } = {},
): Promise<number> {
  if (rows.length === 0) return 0
  const maxParams = options.maxParams ?? D1_MAX_PARAMS
  const columns = Math.max(1, Object.keys(rows[0] as object).length)
  const perStatement = Math.max(1, Math.floor(maxParams / columns))
  for (let i = 0; i < rows.length; i += perStatement) {
    const part = rows.slice(i, i + perStatement) as TTable['$inferInsert'][]
    const q = db.insert(table).values(part)
    if (options.orIgnore) await q.onConflictDoNothing()
    else await q
  }
  return rows.length
}
