/**
 * Full-text search over `articles.prod_name || detail_desc || style_caption || search_zh` with FTS5
 * (`articles_fts`, an external-content table created by `drizzle/0001_vectors_fts.sql`, widened by
 * `drizzle/0003_vision.sql`, and rebuilt after every import with `FTS_REBUILD_SQL`).
 *
 * `style_caption` is the vision pass's one sentence about the garment, which is the only column
 * here that describes how a thing looks rather than what it is — it is what a query like
 * "something chill for the weekend" can actually match.
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
  styleCaption: text('style_caption'),
  searchZh: text('search_zh'),
  printMotif: text('print_motif'),
  printText: text('print_text'),
})

export const FTS_REBUILD_SQL = "insert into articles_fts(articles_fts) values('rebuild')"

const TOKEN = /[\p{L}\p{N}]+/gu
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
export const FTS_MAX_TOKENS = 8

/**
 * Chinese written for `unicode61`, which splits on anything that is not a letter or a digit and
 * so treats an entire run of Han characters as one token. A caption reading
 * `灰色麻花紋與柔粉色` indexed as-is cannot be found by `麻花`: the index holds the whole run,
 * and the query is not equal to it. 679 articles described as 麻花 matched nothing.
 *
 * Spacing every character makes each its own token, and a Chinese query becomes a phrase over
 * them — `"麻 花"` — which matches adjacent characters and nothing else. The alternative,
 * `tokenize='trigram'`, needs three characters in the query, and most Chinese words are two.
 */
export function spaceCjk(input: string): string {
  return input
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, (c) => ` ${c} `)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Free text → an FTS5 expression. A Latin word becomes a quoted prefix term (`"lin"* "shir"*`);
 * a run of Chinese becomes a quoted phrase of its characters (`"麻 花"`), which is what finds it
 * in an index written by `spaceCjk`. Terms are implicitly AND-ed. `null` when none survives.
 */
export function ftsQuery(input: string): string | null {
  const tokens = [...(input.toLowerCase().match(TOKEN) ?? [])]
    .filter((t) => t.length > 0)
    .slice(0, FTS_MAX_TOKENS)
  if (tokens.length === 0) return null
  return tokens
    .map((t) => {
      const clean = t.replace(/"/g, '')
      // A phrase, not a prefix: `"麻 花"*` would ask for a character starting with 花.
      return CJK.test(clean) ? `"${spaceCjk(clean)}"` : `"${clean}"*`
    })
    .join(' ')
}

/**
 * Keyword concepts → an FTS5 expression: alternatives within a concept are OR-ed, concepts are
 * AND-ed, and every word is a quoted prefix term like `ftsQuery`. `[['whale', 'orca'], ['hoodie']]`
 * becomes `(("whale"*) OR ("orca"*)) AND (("hoodie"*))`; `null` when nothing survives.
 */
export function ftsConceptsQuery(concepts: ReadonlyArray<readonly string[]>): string | null {
  const groups: string[] = []
  for (const concept of concepts) {
    const alternatives = concept.map(ftsQuery).filter((q): q is string => q !== null)
    if (alternatives.length > 0) groups.push(`(${alternatives.map((a) => `(${a})`).join(' OR ')})`)
  }
  return groups.length > 0 ? groups.join(' AND ') : null
}

/** Two optional expressions AND-ed; `null` when both are absent. */
export function ftsAnd(a: string | null, b: string | null): string | null {
  if (a && b) return `(${a}) AND (${b})`
  return a ?? b
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
