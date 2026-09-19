/**
 * Full-text search over `products.name || description` with SQLite FTS5 (`products_fts`, an
 * external-content table created by `drizzle/0001_vectors_fts.sql` and rebuilt after every
 * catalog seed with `FTS_REBUILD_SQL`). Row ids equal `products.id`.
 */
import { sql, type SQL } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Query-side declaration of the virtual table (never migrated by drizzle-kit). */
export const productsFts = sqliteTable('products_fts', {
  rowid: integer('rowid').primaryKey(),
  name: text('name'),
  description: text('description'),
})

export const FTS_REBUILD_SQL = "insert into products_fts(products_fts) values('rebuild')"

const TOKEN = /[\p{L}\p{N}]+/gu
export const FTS_MAX_TOKENS = 8

/**
 * Free text → an FTS5 expression: every word becomes a quoted prefix term (`"lin"* "shir"*`),
 * implicitly AND-ed, which mirrors `plainto_tsquery` plus a trigram-style prefix tolerance.
 * `null` when no token survives.
 */
export function ftsQuery(input: string): string | null {
  const tokens = [...(input.toLowerCase().match(TOKEN) ?? [])]
    .filter((t) => t.length > 0)
    .slice(0, FTS_MAX_TOKENS)
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' ')
}

/** `products_fts MATCH <expr>` for use as a WHERE chunk on `productsFts`. */
export function ftsMatch(expr: string): SQL {
  return sql`${productsFts} match ${expr}`
}

/** `products.id IN (…)` restricted to FTS hits — composable with any query on `products`. */
export function ftsHitsSubquery(expr: string): SQL {
  return sql`(select rowid from products_fts where products_fts match ${expr})`
}

/** BM25 rank of the current `products_fts` row (lower is better; negate to sort descending). */
export const ftsRank: SQL<number> = sql<number>`bm25(products_fts)`
