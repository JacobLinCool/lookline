/**
 * Timestamps. The engine never calls `new Date()` / `Date.now()` (docs/CONTRACTS.md rule 4):
 * callers pass `createdAt` (simulation) or we read the database clock once per write path so all
 * rows of one action share the same instant.
 */
import { sql, sqlNowMs, type Database } from '@lookline/db'

export async function resolveCreatedAt(db: Database, override?: Date): Promise<Date> {
  if (override) return override
  const row = await db.get<{ now: number | string | null }>(sql`select ${sqlNowMs()} as now`)
  const raw = row?.now
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw)
  if (typeof raw === 'string' && raw !== '') return new Date(Number(raw))
  throw new Error('@lookline/engine: could not read the database clock')
}
