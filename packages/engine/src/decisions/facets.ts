/**
 * The catalog's search facets (`SEARCH_FACETS`) bound to the columns that store them. The
 * registry says what a facet is; this file says how SQL asks for it, so the search planner, the
 * facet counts and the sentence decisions all narrow the same rows the same way.
 *
 * Inclusion is OR within a facet (`in (…)`, an overlapping JSON array, any flag true). Exclusion
 * is the negation of the same test, which keeps an article whose value is unknown: `''` is not in
 * the excluded list and an absent flag is not `true`. That is deliberate — an article the vision
 * pass never reached is not known to have no lace trim, and "not lace trim" means "not tagged
 * lace trim", never a promise about what the photograph would have shown.
 */
import { SEARCH_FACETS, type SearchFacet, type SearchFacetId } from '@lookline/catalog'
import {
  articles,
  inArray,
  jsonArrayOverlaps,
  jsonKeyIsTrue,
  notInArray,
  sql,
  type SQL,
} from '@lookline/db'

type ScalarFacetId = Exclude<SearchFacetId, 'aesthetic' | 'detail'>

const COLUMNS = {
  categoryGroup: articles.categoryGroup,
  colorFamily: articles.colorFamily,
  material: articles.material,
  pattern: articles.pattern,
  printSubject: articles.printSubject,
  silhouette: articles.silhouette,
  fit: articles.fit,
  length: articles.length,
  neckline: articles.neckline,
  sleeve: articles.sleeve,
  closure: articles.closure,
} as const satisfies Record<ScalarFacetId, unknown>

type ScalarColumn = (typeof COLUMNS)[ScalarFacetId]

/** The `articles` column (or JSON column) behind a facet. */
export function facetColumn(
  facet: SearchFacet,
): ScalarColumn | typeof articles.aesthetics | typeof articles.attributes {
  if (facet.storage === 'json-array') return articles.aesthetics
  if (facet.storage === 'json-flag') return articles.attributes
  return COLUMNS[facet.id as ScalarFacetId]
}

/** Rows holding at least one of `values` (an empty list matches nothing). */
export function facetIncludes(facet: SearchFacet, values: readonly string[]): SQL {
  if (values.length === 0) return sql`0`
  switch (facet.storage) {
    case 'column':
      return inArray(COLUMNS[facet.id as ScalarFacetId], values)
    case 'json-array':
      return jsonArrayOverlaps(articles.aesthetics, values)
    case 'json-flag':
      return sql.join(
        values.map((v) => jsonKeyIsTrue(articles.attributes, v)),
        sql` or `,
      )
  }
}

/** Rows holding none of `values`; unknown values pass (an empty list matches everything). */
export function facetExcludes(facet: SearchFacet, values: readonly string[]): SQL {
  if (values.length === 0) return sql`1`
  if (facet.storage === 'column') return notInArray(COLUMNS[facet.id as ScalarFacetId], values)
  // `json_type` of an absent key is NULL, and `not null` is null, which is false: without the
  // coalesce every untagged article would vanish from a negative filter.
  return sql`coalesce(${facetIncludes(facet, values)}, 0) = 0`
}

/** Facets in registry order. */
export const FACETS: readonly SearchFacet[] = SEARCH_FACETS

/** The JSON text an article stores for a true flag (`JSON.stringify`, no spaces). */
const flagNeedle = (slug: string): string => `"${slug}":true`

/**
 * Registry slugs are inlined as SQL literals rather than bound: the counts name every value of
 * every facet (about two hundred), and D1 binds at most a hundred parameters per statement.
 */
const SLUG = /^[a-zA-Z0-9-]+$/
for (const facet of SEARCH_FACETS)
  for (const value of facet.values)
    if (!SLUG.test(value.slug))
      throw new Error(`@lookline/engine: facet value "${value.slug}" is not a plain slug`)
const literal = (text: string): SQL => sql.raw(`'${text}'`)

/** D1 returns at most a hundred columns, so a facet's counts travel as JSON objects of this size. */
export const FACET_COUNT_CHUNK = 30
/** D1 allows at most a hundred aggregate terms per statement; one statement counts this many values. */
export const FACET_COUNT_MAX_TERMS = 100

/** The facets every search counts: few, broad, and what the fixed rail groups are drawn from. */
export const COUNTED_FACETS: readonly SearchFacet[] = SEARCH_FACETS.filter(
  (f) => f.decision === 'semantic',
)
/** Of those, the ones a filtered aggregate counts; the JSON-array facet has its own statement. */
export const COUNTED_COLUMN_FACETS: readonly SearchFacet[] = COUNTED_FACETS.filter(
  (f) => f.storage !== 'json-array',
)
export const AESTHETIC_FACET: SearchFacet = SEARCH_FACETS.find((f) => f.storage === 'json-array')!

export interface FacetCountChunk {
  id: SearchFacetId
  /** The result column holding `{ "<value>": <count>, … }` for these values. */
  alias: string
  values: readonly string[]
}

/** How the counts of `facets` are laid out: one JSON column per chunk of a facet's values. */
export function facetCountChunks(
  facets: readonly SearchFacet[] = COUNTED_FACETS,
): FacetCountChunk[] {
  const chunks: FacetCountChunk[] = []
  for (const facet of facets) {
    const slugs = facet.values.map((v) => v.slug)
    for (let i = 0; i < slugs.length; i += FACET_COUNT_CHUNK)
      chunks.push({
        id: facet.id,
        alias: `${facet.id}:${i / FACET_COUNT_CHUNK}`,
        values: slugs.slice(i, i + FACET_COUNT_CHUNK),
      })
  }
  return chunks
}

/** The JSON text an article stores for a tagged aesthetic (`JSON.stringify`, no spaces). */
const aestheticNeedle = (slug: string): string => `"${slug}"`

/**
 * Every value of `facets` counted in a single pass over the rows `where` matches, as
 * `json_object('long', count(*) filter (where "articles"."sleeve" = 'long'), …) as "sleeve:0"`.
 *
 * D1 bills every row a query touches, and it counts the rows `json_each` fabricates and the
 * rows a `group by` sorts, so the shape of a count decides its bill. Measured on the 105 220-row
 * catalogue (rows read / SQL time, unfiltered): the previous three-facet `group by` with
 * `json_each` read 916 218 rows in ~600 ms; unpivoting thirteen facets with `json_each` read
 * 3.3 million in 3.9 s; a `union all` per facet is refused outright (a compound select is capped
 * at five terms), one column per value too (a hundred columns), and one statement for every
 * facet as well (a hundred aggregate terms). A filtered aggregate touches each row exactly once
 * — the price of the `count(*)` total — and costs about 12 ms per aggregate term per 100 000 rows
 * of VM time, so it suits the short vocabularies (twelve category groups, twelve colours: 105 220
 * rows in 250–290 ms unfiltered, 13 229 rows in ~50 ms for dresses) and the construction facets
 * counted one at a time on demand (a sleeve, twenty design details: ~300 ms unfiltered, ~55 ms
 * for dresses). The 32 aesthetics are not counted this way: 32 `instr` terms cost ~1.7 s, so
 * `aestheticCountsSql` groups the JSON text instead.
 *
 * Design details are matched as text: a flag's key with `:true` cannot occur inside a value, so
 * the needle finds exactly the tagged rows without parsing the object once per detail.
 */
export function facetCountsSql(facets: readonly SearchFacet[], where: SQL): SQL {
  const terms = facets.reduce((n, f) => n + f.values.length, 0)
  if (terms > FACET_COUNT_MAX_TERMS)
    throw new Error(`@lookline/engine: ${terms} facet values exceed one statement's aggregates`)
  const columns = facetCountChunks(facets).map((chunk) => {
    const facet = SEARCH_FACETS.find((f) => f.id === chunk.id)!
    const pairs = chunk.values.map((slug) => {
      const test =
        facet.storage === 'column'
          ? sql`${COLUMNS[facet.id as ScalarFacetId]} = ${literal(slug)}`
          : facet.storage === 'json-array'
            ? sql`instr(${articles.aesthetics}, ${literal(aestheticNeedle(slug))}) > 0`
            : sql`instr(${articles.attributes}, ${literal(flagNeedle(slug))}) > 0`
      return sql`${literal(slug)}, count(*) filter (where ${test})`
    })
    return sql`json_object(${sql.join(pairs, sql`, `)}) as ${sql.identifier(chunk.alias)}`
  })
  return sql`select ${sql.join(columns, sql`, `)} from ${articles} where ${where}`
}

/**
 * The aesthetics counted by grouping the stored JSON text: an article carries at most three of
 * the 32 slugs, so the catalogue holds ~4 200 distinct arrays, each rolled up in code by
 * `aestheticRows`. One `group by` reads every row twice on D1 (210 440 unfiltered, 350–390 ms;
 * 26 457 for dresses, 50–65 ms) — a quarter of what `json_each` read, and a fraction of the VM
 * time of 32 filtered aggregates. With the column statement beside it, an unfiltered search
 * counts its facets over 315 660 rows in under 400 ms where it read 916 218 in ~600 ms before.
 */
export function aestheticCountsSql(where: SQL): SQL {
  return sql`select ${articles.aesthetics} as key, count(*) as n from ${articles} where ${where} group by 1`
}

/** `[{ key: '["minimalist","normcore"]', n: 5 }, …]` → a count per aesthetic slug. */
export function aestheticRows(
  rows: ReadonlyArray<{ key: unknown; n: unknown }>,
): Array<{ dim: SearchFacetId; key: string; n: number }> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    let slugs: unknown
    try {
      slugs = typeof row.key === 'string' ? JSON.parse(row.key) : row.key
    } catch {
      continue
    }
    if (!Array.isArray(slugs)) continue
    for (const slug of new Set(slugs))
      if (typeof slug === 'string') counts.set(slug, (counts.get(slug) ?? 0) + Number(row.n ?? 0))
  }
  return [...counts].map(([key, n]) => ({ dim: AESTHETIC_FACET.id, key, n }))
}
