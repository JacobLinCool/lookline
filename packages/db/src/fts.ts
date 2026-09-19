/**
 * Full-text search over `articles.prod_name || detail_desc` with SQLite FTS5 (`articles_fts`, an
 * external-content table created by `drizzle/0001_vectors_fts.sql` and rebuilt after every import
 * with `FTS_REBUILD_SQL`).
 *
 * `article_id` is text, so it cannot be an FTS `content_rowid`. The index keys on the implicit
 * `rowid` every SQLite table has instead, and hits are joined back with `articles.rowid`.
 */
import { type SQL, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Query-side declaration of the virtual table (never migrated by drizzle-kit). */
export const articlesFts = sqliteTable('articles_fts', {
  rowid: integer('rowid').primaryKey(),
  prodName: text('prod_name'),
  detailDesc: text('detail_desc'),
})

export const FTS_REBUILD_SQL = "insert into articles_fts(articles_fts) values('rebuild')"

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

/** `articles_fts MATCH <expr>` for use as a WHERE chunk on `articlesFts`. */
export function ftsMatch(expr: string): SQL {
  return sql`${articlesFts} match ${expr}`
}

/** The rowids of the FTS hits — compare against `articleRowid` on any query over `articles`. */
export function ftsHitsSubquery(expr: string): SQL {
  return sql`(select rowid from articles_fts where articles_fts match ${expr})`
}

/** `articles.rowid`, the join key for `ftsHitsSubquery`. */
export const articleRowid: SQL<number> = sql<number>`articles.rowid`

/** BM25 rank of the current `articles_fts` row (lower is better; negate to sort descending). */
export const ftsRank: SQL<number> = sql<number>`bm25(articles_fts)`
