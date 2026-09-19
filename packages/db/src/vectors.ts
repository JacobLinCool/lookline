/**
 * Cosine ranking in SQL without an extension. `article_vectors` keeps a unit-normalised copy of
 * every `articles.style_vector` spread over 32 REAL columns (`v0` … `v31`; created by
 * `drizzle/0001_vectors_fts.sql`). The query vector is normalised in-process and inlined as
 * literals, so `cosineExpr(q)` is a plain dot product the SQLite engine evaluates per row —
 * 100k rows in ~100 ms, far less once the WHERE prefilter narrows the scan. Statements stay well
 * under D1's 100-parameter and 100 KB limits because nothing is bound.
 */
import { sql, type SQL } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { STYLE_DIMENSIONS } from './schema'

/** Only `article_id` is declared; the 64 value columns are addressed by `cosineExpr`. */
export const articleVectors = sqliteTable('article_vectors', {
  articleId: text('article_id').primaryKey(),
})

export const VECTOR_COLUMNS: readonly string[] = Array.from(
  { length: STYLE_DIMENSIONS },
  (_, i) => `v${i}`,
)

/** Unit-length copy (64 dims, zero-padded); an all-zero vector stays all-zero. */
export function unitVector(v: readonly number[]): number[] {
  const out = Array.from({ length: STYLE_DIMENSIONS }, (_, i) => {
    const x = v[i]
    return typeof x === 'number' && Number.isFinite(x) ? x : 0
  })
  let norm = 0
  for (const x of out) norm += x * x
  if (norm === 0) return out
  const inv = 1 / Math.sqrt(norm)
  return out.map((x) => x * inv)
}

const literal = (x: number): string => x.toFixed(6)

/**
 * `cos(query, article_vectors row)` as a SQL expression in `[-1, 1]`. `table` is the (unaliased)
 * table name of the joined `article_vectors`. Returns `0` for a zero query vector so ORDER BY
 * still has a well-defined tie-break.
 */
export function cosineExpr(query: readonly number[], table = 'article_vectors'): SQL<number> {
  const q = unitVector(query)
  const terms: string[] = []
  for (let i = 0; i < STYLE_DIMENSIONS; i++) {
    const x = q[i]!
    if (x === 0) continue
    terms.push(`"${table}"."v${i}"*${literal(x)}`)
  }
  if (terms.length === 0) return sql<number>`0`
  return sql.raw(`(${terms.join('+')})`) as SQL<number>
}

/** The 64 values to store for a product (unit-normalised, 6 decimals). */
export function articleVectorRow(styleVector: readonly number[]): number[] {
  return unitVector(styleVector).map((x) => Number(x.toFixed(6)))
}

/**
 * One multi-row `INSERT OR REPLACE INTO article_vectors` with inlined literals (no parameters).
 * Seeds pass a few hundred rows per call; the statement stays under 100 KB.
 */
export function articleVectorsInsertSql(
  rows: ReadonlyArray<{ id: string; styleVector: readonly number[] }>,
): SQL {
  if (rows.length === 0) throw new Error('articleVectorsInsertSql: no rows')
  const cols = ['article_id', ...VECTOR_COLUMNS].map((c) => `"${c}"`).join(',')
  // Ids are H&M's ten digits, so they only ever need quoting, never escaping — but check, because
  // this statement inlines them.
  const values = rows
    .map((r) => {
      if (!/^\d{10}$/.test(r.id)) throw new Error(`articleVectorsInsertSql: bad id ${r.id}`)
      return `('${r.id}',${articleVectorRow(r.styleVector).map(literal).join(',')})`
    })
    .join(',')
  return sql.raw(`insert or replace into article_vectors (${cols}) values ${values}`)
}
