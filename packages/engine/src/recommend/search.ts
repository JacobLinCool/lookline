/**
 * Catalog search (ENGINE_SPEC §2.4 `searchProducts`): FTS5 full-text over name + description
 * (prefix terms, AND-ed, ranked with `bm25`), a lexicon parse of the query mapped to filters and a
 * style vector (cosine over `article_vectors`), filters, sorts, pagination and facets.
 */
import {
  CATEGORIES,
  LEXICON,
  SEARCH_FACETS,
  aestheticIndex,
  colorFamilyIndex,
  findColor,
  zeroVector,
} from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, SearchFacetId, SearchFacetKey } from '@lookline/catalog'
import {
  and,
  asc,
  brands,
  cosineExpr,
  count,
  desc,
  eq,
  articleRowid,
  ftsAnd,
  ftsConceptsQuery,
  ftsHitsSubquery,
  ftsMatch,
  ftsQuery,
  ftsRank,
  gte,
  lte,
  articleVectors,
  articles,
  articlesFts,
  rowsOf,
  sql,
} from '@lookline/db'
import type { Database, Article } from '@lookline/db'
import {
  COUNTED_COLUMN_FACETS,
  COUNTED_FACETS,
  aestheticCountsSql,
  aestheticRows,
  facetCountChunks,
  facetCountsSql,
  facetExcludes,
  facetIncludes,
} from '../decisions/facets'
import { parseKeywords } from '../decisions/keywords'
import type { FacetCount, ProductSearch, ProductSearchFacets, ProductSearchResult } from '../types'
import { AESTHETIC_TABLES } from './aesthetics'
import { subcategoryWhere } from './catalogue'
import { isFamily, isGroup } from './intent-view'
import { RETRIEVAL_BLOCK_WEIGHTS, blockScale } from './vector'

export const SEARCH_PAGE_SIZE = 24
export const SEARCH_PAGE_MAX = 100
export const FACET_TOP = 12
/** Weight of the style cosine next to the (negated) bm25 rank in relevance order. */
export const RELEVANCE_COSINE_WEIGHT = 2

type SqlChunk = ReturnType<typeof sql>

interface Term {
  term: string
  section:
    | 'subcategories'
    | 'categories'
    | 'categoryGroups'
    | 'colors'
    | 'colorFamilies'
    | 'aesthetics'
    | 'materials'
    | 'patterns'
  value: string
  cjk: boolean
}

const CJK = /[㐀-鿿]/

let termIndex: Term[] | null = null

function buildTermIndex(): Term[] {
  const out: Term[] = []
  // Equal-length ties resolve in this order (a bare "linen" is a material before a linen shirt).
  const sections = [
    'colors',
    'colorFamilies',
    'materials',
    'patterns',
    'aesthetics',
    'subcategories',
    // The taxonomy's middle tier is not in `LEXICON`, and without it 裙子 fell through to the
    // `bottoms` group and a search for skirts came back trousers. Read straight off `CATEGORIES`
    // rather than widening the lexicon contract, which the intent parser also reads.
    'categories',
    'categoryGroups',
  ] as const
  for (const section of sections) {
    const rows =
      section === 'categories'
        ? CATEGORIES.map((c) => ({
            value: c.slug,
            terms: [
              c.slug,
              c.slug.replace(/-/g, ' '),
              c.name.toLowerCase(),
              c.labelZh,
              ...(c.synonyms ?? []),
            ],
          }))
        : LEXICON[section]
    for (const entry of rows) {
      for (const term of entry.terms) {
        const cjk = CJK.test(term)
        if (!cjk && term.length < 3) continue
        out.push({ term, section, value: entry.value, cjk })
      }
    }
  }
  // Longest first so "crop top" wins over "top"; ties keep table order.
  return out.toSorted((a, b) => b.term.length - a.term.length)
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const push = <T>(list: T[], v: T): void => {
  if (!list.includes(v)) list.push(v)
}

export interface QueryScan {
  residual: string
  /** Garment slugs: a taxonomy subcategory or, for a coarser word like 裙子, a category. */
  subcategories: string[]
  groups: CategoryGroup[]
  colorFamilies: ColorFamily[]
  aesthetics: string[]
  materials: string[]
  patterns: string[]
}

/** Lexicon scan of a free-text query: matched taxonomy values and the unmatched residual text. */
export function scanQuery(q: string): QueryScan {
  termIndex ??= buildTermIndex()
  const input = ` ${q.toLowerCase().replace(/\s+/g, ' ').trim()} `
  let text = input
  const scan: QueryScan = {
    residual: '',
    subcategories: [],
    groups: [],
    colorFamilies: [],
    aesthetics: [],
    materials: [],
    patterns: [],
  }
  for (const t of termIndex) {
    // A single Han character inside a longer word is not that word. `麻` is linen, and `麻花`
    // is a cable knit — matching the one inside the other turned a search for cable knits into
    // a search for linen and dropped the rest of the query on the floor.
    const re = t.cjk
      ? new RegExp(
          t.term.length === 1
            ? `(?<!\\p{Script=Han})${escapeRe(t.term)}(?!\\p{Script=Han})`
            : escapeRe(t.term),
          'gu',
        )
      : new RegExp(`(?<![a-z0-9])${escapeRe(t.term)}(?![a-z0-9])`, 'g')
    if (!re.test(text)) continue
    text = text.replace(re, ' ')
    switch (t.section) {
      // Both tiers name a garment; `subcategoryWhere` reads either.
      case 'subcategories':
      case 'categories':
        push(scan.subcategories, t.value)
        break
      case 'categoryGroups':
        if (isGroup(t.value)) push(scan.groups, t.value)
        break
      case 'colors': {
        const c = findColor(t.value)
        if (c) push(scan.colorFamilies, c.family)
        break
      }
      case 'colorFamilies':
        if (isFamily(t.value)) push(scan.colorFamilies, t.value)
        break
      case 'aesthetics':
        push(scan.aesthetics, t.value)
        break
      case 'materials':
        push(scan.materials, t.value)
        break
      case 'patterns':
        push(scan.patterns, t.value)
        break
    }
  }
  // A lone Han character left beside a term the lexicon did recognise is the tail of a longer
  // word, not a word. `米白色` is off-white: the lexicon reads `白色` out of it and leaves `米`,
  // which as a full-text term asks for any caption containing 米 and cut off-white knits from
  // 1 088 to 323. Nothing matched means the shopper really did type one character.
  const matched = text !== input
  const residual = (
    matched ? text.replace(/(?<![\p{Script=Han}])\p{Script=Han}(?![\p{Script=Han}])/gu, ' ') : text
  )
    .replace(/\s+/g, ' ')
    .trim()
  // Han counts as text. The check was ASCII-only, so a Chinese query matching no lexicon term
  // left no residual and therefore no search at all — `荷葉邊` filtered on nothing and returned
  // the whole catalogue.
  scan.residual = /[a-z0-9]|\p{Script=Han}/u.test(residual) ? residual : ''
  return scan
}

/** Style vector from the scanned aesthetics/colours (null when neither matched). */
export function scanVector(
  scan: QueryScan,
  extraAesthetics: readonly string[] = [],
): number[] | null {
  const aesthetics = [...new Set([...scan.aesthetics, ...extraAesthetics])].filter(
    (a) => aestheticIndex(a) >= 0,
  )
  if (aesthetics.length === 0 && scan.colorFamilies.length === 0) return null
  const v = zeroVector()
  for (const a of aesthetics) v[aestheticIndex(a)] = 1
  if (scan.colorFamilies.length > 0) {
    for (const f of scan.colorFamilies) v[colorFamilyIndex(f)] = 1
  } else {
    for (const a of aesthetics) {
      const row = AESTHETIC_TABLES.get(a)
      if (!row) continue
      for (const [f, w] of Object.entries(row.colorPrior)) {
        const idx = colorFamilyIndex(f as ColorFamily)
        v[idx] = Math.max(v[idx] ?? 0, w)
      }
    }
  }
  return v
}

export interface SearchPlan {
  scan: QueryScan
  /** Residual free text (null when none or when the retry drops it). */
  text: string | null
  /** Keyword concepts (alternatives within, AND across), sanitised. */
  keywords: string[][]
  /** FTS5 expression built from `text` and `keywords` (null when no token survives). */
  ftsExpr: string | null
  vector: number[] | null
  where: SqlChunk[]
  /** True when the lexicon contributed a filter (used for the no-text retry). */
  lexiconFilters: boolean
  sort: NonNullable<ProductSearch['sort']>
  page: number
  pageSize: number
}

export function planSearch(
  query: ProductSearch,
  opts: { withText?: boolean; withLexicon?: boolean } = {},
): SearchPlan {
  const scan = scanQuery(query.q ?? '')
  const where: SqlChunk[] = []
  const withLexicon = opts.withLexicon ?? true
  let lexiconFilters = false
  if (query.department) where.push(eq(articles.department, query.department))
  // What the lexicon read out of `q`, applied only where the explicit filter is silent.
  const scanned: Partial<Record<SearchFacetKey, readonly string[]>> = {
    categoryGroups: scan.subcategories.length === 0 ? scan.groups : [],
    colorFamilies: scan.colorFamilies,
    // An aesthetic narrows the SQL as well as steering the style vector, now that the vision pass
    // tags articles with one. Articles it has not reached carry `[]` and match nothing, which is
    // the honest answer: an untagged article is not known to be minimalist.
    aesthetics: scan.aesthetics,
    materials: scan.materials,
    patterns: scan.patterns,
  }
  for (const facet of SEARCH_FACETS) {
    const included = query[facet.key]
    if (included?.length) where.push(facetIncludes(facet, included))
    else if (withLexicon && scanned[facet.key]?.length) {
      where.push(facetIncludes(facet, scanned[facet.key]!))
      lexiconFilters = true
    }
    const excluded = query[facet.excludeKey]
    if (excluded?.length) where.push(facetExcludes(facet, excluded))
  }
  if (query.category) where.push(eq(articles.category, query.category))
  if (query.subcategory) where.push(eq(articles.subcategory, query.subcategory))
  else if (withLexicon && scan.subcategories.length > 0) {
    // The lexicon answers in taxonomy slugs (`jeans`, `turtleneck`); the column holds H&M's own
    // coarser `product_type_name` (`Trousers`, `Sweater`). `subcategoryWhere` bridges the two,
    // and returns null for a garment the catalogue does not stock at all — then no filter, and
    // the free-text fallback in `searchProducts` answers instead of an empty page.
    const sub = subcategoryWhere(scan.subcategories)
    if (sub) {
      where.push(sub)
      lexiconFilters = true
    }
  }
  if (query.brandId !== undefined) where.push(eq(articles.brandId, query.brandId))
  if (query.priceMin !== undefined && query.priceMin !== null)
    where.push(gte(articles.price, Math.round(query.priceMin)))
  if (query.priceMax !== undefined && query.priceMax !== null)
    where.push(lte(articles.price, Math.round(query.priceMax)))
  const withText = opts.withText ?? true
  const spoken = withLexicon ? scan.residual : (query.q ?? '').trim()
  const text = withText && spoken ? spoken : null
  // Keywords are already known to be free text: they never pass through the lexicon and the
  // no-text retry never drops them, only the residual of `q`.
  const keywords = parseKeywords(query.keywords ?? [])
  const ftsExpr = ftsAnd(text ? ftsQuery(text) : null, ftsConceptsQuery(keywords))
  if (ftsExpr) where.push(sql`${articleRowid} in ${ftsHitsSubquery(ftsExpr)}`)
  const vector = scanVector(scan, query.aesthetics ?? [])
  const pageSize = Math.max(
    1,
    Math.min(SEARCH_PAGE_MAX, Math.round(query.pageSize ?? SEARCH_PAGE_SIZE)),
  )
  const page = Math.max(1, Math.round(query.page ?? 1))
  return {
    scan,
    text,
    keywords,
    ftsExpr,
    vector,
    where,
    lexiconFilters,
    sort: query.sort ?? 'relevance',
    page,
    pageSize,
  }
}

/** Whether the page query must join `article_vectors` (style cosine in the ORDER BY). */
export function needsVectorJoin(plan: SearchPlan): boolean {
  return plan.sort === 'relevance' && plan.vector !== null
}

/** Whether the page query must join `articles_fts` (bm25 rank in the ORDER BY). */
export function needsFtsJoin(plan: SearchPlan): boolean {
  return plan.sort === 'relevance' && plan.ftsExpr !== null
}

export function orderFor(plan: SearchPlan): SqlChunk[] {
  const cos = plan.vector ? cosineExpr(blockScale(plan.vector, RETRIEVAL_BLOCK_WEIGHTS)) : null
  switch (plan.sort) {
    case 'price_asc':
      return [asc(articles.price), asc(articles.id)]
    case 'price_desc':
      return [desc(articles.price), asc(articles.id)]
    case 'popular':
      return [desc(articles.popularity), asc(articles.id)]
    case 'new':
      return [desc(articles.createdAt), asc(articles.id)]
    case 'trending':
      return [desc(articles.trendScore), desc(articles.popularity), asc(articles.id)]
    default: {
      if (plan.ftsExpr && cos) {
        return [
          desc(sql`(-(${ftsRank})) + ${RELEVANCE_COSINE_WEIGHT} * ${cos}`),
          desc(articles.popularity),
          asc(articles.id),
        ]
      }
      // bm25 is a cost: lower ranks first.
      if (plan.ftsExpr) return [asc(ftsRank), desc(articles.popularity), asc(articles.id)]
      if (cos) return [desc(cos), asc(articles.id)]
      return [desc(articles.popularity), asc(articles.id)]
    }
  }
}

/** Query builders for one search (exposed so tests can inspect `.toSQL()` without a connection). */
export function buildSearchQuery(
  db: Database,
  query: ProductSearch,
  opts: { withText?: boolean; withLexicon?: boolean } = {},
) {
  const plan = planSearch(query, opts)
  // `and()` of nothing is `undefined`, which drizzle's own `.where()` reads as "no filter"
  // but the raw facet query below interpolates as an empty `where` clause — a syntax error
  // on exactly the unfiltered /shop that has the most to show.
  const where = and(...plan.where) ?? sql`1 = 1`
  const base = db
    .select({ product: articles, brandName: brands.name })
    .from(articles)
    .innerJoin(brands, eq(brands.id, articles.brandId))
    .$dynamic()
  const withVectors = needsVectorJoin(plan)
    ? base.innerJoin(articleVectors, eq(articleVectors.articleId, articles.id))
    : base
  const joined = needsFtsJoin(plan)
    ? withVectors.innerJoin(
        articlesFts,
        // `articles.id` is H&M's ten-character `article_id`; the FTS side is the integer rowid
        // the virtual table keys on. Comparing them matched nothing, so every relevance-sorted
        // text search returned an empty page next to a total that counted the real hits — the
        // count uses the WHERE clause, which joins on `articleRowid` and is correct.
        and(eq(articlesFts.rowid, articleRowid), ftsMatch(plan.ftsExpr!)),
      )
    : withVectors
  const page = joined
    .where(where)
    .orderBy(...orderFor(plan))
    .limit(plan.pageSize)
    .offset((plan.page - 1) * plan.pageSize)
  const total = db.select({ n: count() }).from(articles).where(where)
  // Counted over the whole filtered set, not a capped head of it: `article_id` carries H&M's own
  // ordering, so the first N rows of a filter are not a sample of it — they were missing entire
  // category groups. Two statements, run together: a filtered aggregate per category group and
  // colour family (one pass, the rows the `total` count reads) and a `group by` over the
  // aesthetics JSON text; `facetCountsSql` records what the other shapes cost on D1.
  const facets = facetCountsSql(COUNTED_COLUMN_FACETS, where)
  const aestheticFacets = aestheticCountsSql(where)
  return { plan, page, total, facets, aestheticFacets }
}

export interface FacetRow {
  dim: string
  key: string
  n: number
}

/** The single row of a facet-count query → one `(facet, value, count)` per counted value. */
export function facetRows(
  row: Record<string, unknown> | undefined,
  facets: readonly (typeof SEARCH_FACETS)[number][] = COUNTED_FACETS,
): FacetRow[] {
  if (!row) return []
  const rows: FacetRow[] = []
  for (const chunk of facetCountChunks(facets)) {
    const cell = row[chunk.alias]
    let counts: Record<string, unknown> = {}
    try {
      counts = typeof cell === 'string' ? (JSON.parse(cell) as Record<string, unknown>) : {}
    } catch {
      counts = {}
    }
    for (const key of chunk.values) rows.push({ dim: chunk.id, key, n: Number(counts[key] ?? 0) })
  }
  return rows
}

/** The counted values of one facet, most common first, unknown and absent values dropped. */
export function pickFacet(
  facet: (typeof SEARCH_FACETS)[number],
  rows: readonly FacetRow[],
): FacetCount[] {
  return rows
    .filter(
      (r) => r.dim === facet.id && r.key && r.n > 0 && facet.values.some((v) => v.slug === r.key),
    )
    .map((r) => ({ key: r.key, count: Number(r.n) }))
    .toSorted((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, FACET_TOP)
}

/** Counts for the facets every search carries; a facet absent here has not been counted. */
export function aggregateFacets(rows: readonly FacetRow[]): ProductSearchFacets {
  return Object.fromEntries(
    COUNTED_FACETS.map((facet) => [facet.key, pickFacet(facet, rows)]),
  ) as ProductSearchFacets
}

/**
 * The value counts of one facet over the rows `query` matches (its own selections in that facet
 * included, so a shopper sees what else the current results hold). One pass, one statement —
 * the price of opening that facet's row in the rail, paid only then.
 */
export async function countFacet(
  db: Database,
  query: ProductSearch,
  facetId: SearchFacetId,
): Promise<FacetCount[]> {
  const facet = SEARCH_FACETS.find((f) => f.id === facetId)
  if (!facet) throw new Error(`Unknown facet ${facetId}`)
  const plan = planSearch(query)
  const where = and(...plan.where) ?? sql`1 = 1`
  if (facet.storage === 'json-array')
    return pickFacet(
      facet,
      aestheticRows(rowsOf<{ key: unknown; n: unknown }>(await db.all(aestheticCountsSql(where)))),
    )
  const result = await db.all(facetCountsSql([facet], where))
  return pickFacet(facet, facetRows(rowsOf<Record<string, unknown>>(result)[0], [facet]))
}

async function runSearch(
  db: Database,
  query: ProductSearch,
  withText: boolean,
  withLexicon = true,
): Promise<ProductSearchResult & { plan: SearchPlan }> {
  const { plan, page, total, facets, aestheticFacets } = buildSearchQuery(db, query, {
    withText,
    withLexicon,
  })
  const [rows, totalRows, facetResult, aestheticResult] = await Promise.all([
    page,
    total,
    db.all(facets),
    db.all(aestheticFacets),
  ])
  const items = rows.map((r) => ({ ...(r.product as Article), brandName: r.brandName }))
  return {
    items,
    total: Number(totalRows[0]?.n ?? 0),
    page: plan.page,
    pageSize: plan.pageSize,
    facets: aggregateFacets([
      ...facetRows(rowsOf<Record<string, unknown>>(facetResult)[0], COUNTED_COLUMN_FACETS),
      ...aestheticRows(rowsOf<{ key: unknown; n: unknown }>(aestheticResult)),
    ]),
    plan,
  }
}

export async function searchProducts(
  db: Database,
  query: ProductSearch,
): Promise<ProductSearchResult> {
  const first = await runSearch(db, query, true)
  if (first.total === 0 && first.plan.text && first.plan.lexiconFilters) {
    const retry = await runSearch(db, query, false)
    const { plan: _plan, ...rest } = retry
    if (rest.total > 0) return rest
  }
  // The lexicon recognised every word and then narrowed to nothing: `jeans` is a subcategory it
  // knows and the catalogue does not stock under that name. Searching the words themselves is a
  // worse answer than the filter would have been and a far better one than an empty page. The
  // guard is `lexiconFilters` rather than `plan.text`, because a query the lexicon consumed
  // whole leaves no residual text to test.
  if (first.total === 0 && first.plan.lexiconFilters) {
    const { plan: _plan, ...rest } = await runSearch(db, query, true, false)
    return rest
  }
  const { plan: _plan, ...rest } = first
  return rest
}
