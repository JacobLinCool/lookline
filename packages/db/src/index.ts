/**
 * @lookline/db — schema, the `Database` type, D1 client factory and SQLite query helpers.
 * Node-only pieces (libsql local database, `.env` loading, migrations) live in
 * `@lookline/db/node` so this entry stays importable from the Cloudflare Worker.
 */
export * from './schema'
export * as schema from './schema'
export { createD1Db, type D1Like, type Database } from './client'
export { TABLE_ORDER, type TableName } from './tables'
export {
  articleVectors,
  VECTOR_COLUMNS,
  unitVector,
  cosineExpr,
  articleVectorRow,
  articleVectorsInsertSql,
} from './vectors'
export {
  articleRowid,
  articlesFts,
  FTS_REBUILD_SQL,
  FTS_MAX_TOKENS,
  ftsQuery,
  ftsConceptsQuery,
  ftsAnd,
  spaceCjk,
  ftsMatch,
  ftsHitsSubquery,
  ftsRank,
} from './fts'
export {
  D1_MAX_PARAMS,
  inArray,
  notInArray,
  sqlNowMs,
  sqlDaysAgoMs,
  jsonArrayOverlaps,
  jsonArrayContains,
  jsonKeyIsTrue,
  rowsOf,
  insertAll,
} from './sql'
export type { SQL } from 'drizzle-orm'
export {
  getTableColumns,
  sql,
  eq,
  ne,
  and,
  or,
  not,
  desc,
  asc,
  gt,
  gte,
  lt,
  lte,
  like,
  isNull,
  isNotNull,
  count,
  sum,
  avg,
  max,
  min,
  exists,
  between,
} from 'drizzle-orm'
