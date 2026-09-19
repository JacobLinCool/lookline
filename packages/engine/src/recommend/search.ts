/**
 * Catalog search (ENGINE_SPEC §2.4 `searchProducts`): FTS5 full-text over name + description
 * (prefix terms, AND-ed, ranked with `bm25`), a lexicon parse of the query mapped to filters and a
 * style vector (cosine over `article_vectors`), filters, sorts, pagination and facets.
 */
import { LEXICON, aestheticIndex, colorFamilyIndex, findColor, zeroVector } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily } from '@lookline/catalog'
import {
  and,
  asc,
  brands,
  cosineExpr,
  count,
  desc,
  eq,
  articleRowid,
  ftsHitsSubquery,
  ftsMatch,
  ftsQuery,
  ftsRank,
  gte,
  inArray,
  jsonArrayOverlaps,
  lte,
  notInArray,
  articleVectors,
  articles,
  articlesFts,
  rowsOf,
  sql,
} from '@lookline/db'
import type { Database, Article } from '@lookline/db'
import type { ProductSearch, ProductSearchResult } from '../types'
import { AESTHETIC_TABLES } from './aesthetics'
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
    'categoryGroups',
  ] as const
  for (const section of sections) {
    for (const entry of LEXICON[section]) {
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
  let text = ` ${q.toLowerCase().replace(/\s+/g, ' ').trim()} `
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
      case 'subcategories':
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
  const residual = text.replace(/\s+/g, ' ').trim()
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
  /** FTS5 expression built from `text` (null when no token survives). */
  ftsExpr: string | null
  vector: number[] | null
  where: SqlChunk[]
  /** True when the lexicon contributed a filter (used for the no-text retry). */
  lexiconFilters: boolean
  sort: NonNullable<ProductSearch['sort']>
  page: number
  pageSize: number
}

export function planSearch(query: ProductSearch, opts: { withText?: boolean } = {}): SearchPlan {
  const scan = scanQuery(query.q ?? '')
  const where: SqlChunk[] = []
  let lexiconFilters = false
  if (query.department) where.push(eq(articles.department, query.department))
  if (query.categoryGroups?.length)
    where.push(inArray(articles.categoryGroup, query.categoryGroups))
  else if (scan.groups.length > 0 && scan.subcategories.length === 0) {
    where.push(inArray(articles.categoryGroup, scan.groups))
    lexiconFilters = true
  }
  if (query.category) where.push(eq(articles.category, query.category))
  if (query.subcategory) where.push(eq(articles.subcategory, query.subcategory))
  else if (scan.subcategories.length > 0) {
    where.push(inArray(articles.subcategory, scan.subcategories))
    lexiconFilters = true
  }
  if (query.colorFamilies?.length) where.push(inArray(articles.colorFamily, query.colorFamilies))
  else if (scan.colorFamilies.length > 0) {
    where.push(inArray(articles.colorFamily, scan.colorFamilies))
    lexiconFilters = true
  }
  // An aesthetic narrows the SQL as well as steering the style vector, now that the vision pass
  // tags articles with one. Articles it has not reached carry `[]` and match nothing, which is
  // the honest answer: an untagged article is not known to be minimalist.
  if (query.aesthetics?.length) where.push(jsonArrayOverlaps(articles.aesthetics, query.aesthetics))
  else if (scan.aesthetics.length > 0) {
    where.push(jsonArrayOverlaps(articles.aesthetics, scan.aesthetics))
    lexiconFilters = true
  }
  if (query.excludedCategoryGroups?.length)
    where.push(notInArray(articles.categoryGroup, query.excludedCategoryGroups))
  if (query.excludedColorFamilies?.length)
    where.push(notInArray(articles.colorFamily, query.excludedColorFamilies))
  if (query.excludedAesthetics?.length)
    where.push(sql`not ${jsonArrayOverlaps(articles.aesthetics, query.excludedAesthetics)}`)
  if (scan.materials.length > 0) {
    where.push(inArray(articles.material, scan.materials))
    lexiconFilters = true
  }
  if (scan.patterns.length > 0) {
    where.push(inArray(articles.pattern, scan.patterns))
    lexiconFilters = true
  }
  if (query.brandId !== undefined) where.push(eq(articles.brandId, query.brandId))
  if (query.priceMin !== undefined && query.priceMin !== null)
    where.push(gte(articles.price, Math.round(query.priceMin)))
  if (query.priceMax !== undefined && query.priceMax !== null)
    where.push(lte(articles.price, Math.round(query.priceMax)))
  const withText = opts.withText ?? true
  const text = withText && scan.residual ? scan.residual : null
  const ftsExpr = text ? ftsQuery(text) : null
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
    ftsExpr,
    vector,
    where,
    lexiconFilters,
    sort: query.sort ?? 'relevance',
    page,
    pageSize,
  }
}

/** Whether the page query must join `product_vectors` (style cosine in the ORDER BY). */
export function needsVectorJoin(plan: SearchPlan): boolean {
  return plan.sort === 'relevance' && plan.vector !== null
}

/** Whether the page query must join `products_fts` (bm25 rank in the ORDER BY). */
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
  opts: { withText?: boolean } = {},
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
  // category groups. 105k rows group in ~50 ms on the indexed columns.
  // `aggregateFacets` has always read an `aesthetic` dimension; until the vision pass filled the
  // column there was nothing to emit for it, so the facet came back empty on every search.
  const facets = sql`
    with sample as (
      select ${articles.categoryGroup} as category_group, ${articles.colorFamily} as color_family,
             ${articles.aesthetics} as aesthetics
      from ${articles} where ${where}
    )
    select 'group' as dim, category_group as key, count(*) as n from sample group by 2
    union all select 'color' as dim, color_family as key, count(*) as n from sample group by 2
    union all select 'aesthetic' as dim, j.value as key, count(*) as n
      from sample, json_each(sample.aesthetics) j group by 2
  `
  return { plan, page, total, facets }
}

export interface FacetRow {
  dim: string
  key: string
  n: number
}

export function aggregateFacets(
  rows: readonly FacetRow[],
): NonNullable<ProductSearchResult['facets']> {
  const pick = (dim: string) =>
    rows
      .filter((r) => r.dim === dim && r.key)
      .map((r) => ({ key: r.key, count: Number(r.n) }))
      .toSorted((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, FACET_TOP)
  return {
    categoryGroups: pick('group'),
    colorFamilies: pick('color'),
    aesthetics: pick('aesthetic'),
  }
}

async function runSearch(
  db: Database,
  query: ProductSearch,
  withText: boolean,
): Promise<ProductSearchResult & { plan: SearchPlan }> {
  const { plan, page, total, facets } = buildSearchQuery(db, query, { withText })
  const [rows, totalRows, facetRows] = await Promise.all([page, total, db.all(facets)])
  const items = rows.map((r) => ({ ...(r.product as Article), brandName: r.brandName }))
  return {
    items,
    total: Number(totalRows[0]?.n ?? 0),
    page: plan.page,
    pageSize: plan.pageSize,
    facets: aggregateFacets(rowsOf<FacetRow>(facetRows)),
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
    return rest
  }
  const { plan: _plan, ...rest } = first
  return rest
}
