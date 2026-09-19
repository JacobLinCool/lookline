/**
 * Retrieval (ENGINE_SPEC §2.1): SQL prefilter + cosine ranking in SQLite/D1 (`SqlRetriever`, over
 * the `product_vectors` dot-product columns), the identical brute-force `MemoryRetriever` for
 * tests/evaluation, the relaxation ladder, and the social and trend secondary channels.
 */
import { cosineSimilarity } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily } from '@lookline/catalog'
import {
  and,
  asc,
  brands,
  cosineExpr,
  desc,
  eq,
  gt,
  gte,
  inArray,
  interactions,
  jsonArrayOverlaps,
  jsonKeyIsTrue,
  lookArticles,
  looks,
  lte,
  notInArray,
  articleVectors,
  articles,
  purchases,
  sql,
  sqlDaysAgoMs,
} from '@lookline/db'
import type { Database, Department, Article } from '@lookline/db'

export type ProductRow = Article & { brandName: string }

export interface RetrieveParams {
  /** Block-scaled with RETRIEVAL_BLOCK_WEIGHTS (see `queryVector`). */
  vector: number[]
  departments: Department[]
  /** `null` = any group. */
  categoryGroups: CategoryGroup[] | null
  excludeGroups: CategoryGroup[]
  /** `null` = any subcategory. */
  subcategories: string[] | null
  priceMin: number | null
  priceMax: number | null
  excludeMaterials: string[]
  excludeColorFamilies: ColorFamily[]
  excludeSubcategories: string[]
  excludeBrandIds: number[]
  excludeArticleIds: string[]
  requireAttributes: Record<string, true>
  excludeAttributes: Record<string, true>
  limit: number
}

export type Channel = 'vector' | 'social' | 'trend'

export interface SocialEvidence {
  userId: string
  displayName: string
  kind: 'look' | 'purchase' | 'save' | 'advise'
  lookId?: string | null
  /** Trust of the current user in `userId` (ENGINE_SPEC §5.1). */
  strength: number
  at: Date
}

export interface TrendEvidence {
  dimension: string
  key: string
  momentum: number
  emerging: boolean
}

export interface Candidate {
  product: Article
  brandName: string
  /** Cosine between the (block-scaled) query vector and the product vector. */
  cos: number
  channels: Set<Channel>
  socialEvidence: SocialEvidence[]
  trendEvidence: TrendEvidence | null
}

export interface TrustedUser {
  userId: string
  displayName: string
  strength: number
}

export interface ChannelParams {
  /** People whose Looks/purchases/saves feed the social channel; omitted for guests. */
  social?: { trusted: TrustedUser[] } | null
  /** Trending aesthetic / category keys (momentum ≥ 60) for the trend channel. */
  trend?: { aesthetics: TrendEvidence[]; categories: TrendEvidence[] } | null
}

export interface Retriever {
  retrieve(p: RetrieveParams, channels?: ChannelParams): Promise<Candidate[]>
}

export const SOCIAL_CHANNEL_LIMIT = 50
export const TREND_CHANNEL_LIMIT = 30
export const SOCIAL_WINDOW_DAYS = 30

export function emptyParams(
  vector: number[],
  overrides: Partial<RetrieveParams> = {},
): RetrieveParams {
  return {
    vector,
    departments: ['women', 'men', 'unisex'],
    categoryGroups: null,
    excludeGroups: [],
    subcategories: null,
    priceMin: null,
    priceMax: null,
    excludeMaterials: [],
    excludeColorFamilies: [],
    excludeSubcategories: [],
    excludeBrandIds: [],
    excludeArticleIds: [],
    requireAttributes: {},
    excludeAttributes: {},
    limit: 300,
    ...overrides,
  }
}

/** The SQL prefilter, evaluated in-process (used by MemoryRetriever and by the channels). */
export function matchesParams(p: Article, params: RetrieveParams): boolean {
  if (!params.departments.includes(p.department)) return false
  if (params.categoryGroups && !params.categoryGroups.includes(p.categoryGroup as CategoryGroup))
    return false
  if (params.excludeGroups.includes(p.categoryGroup as CategoryGroup)) return false
  if (params.subcategories && !params.subcategories.includes(p.subcategory)) return false
  if (params.priceMin !== null && p.price < params.priceMin) return false
  if (params.priceMax !== null && p.price > params.priceMax) return false
  if (params.excludeMaterials.includes(p.material)) return false
  if (params.excludeColorFamilies.includes(p.colorFamily as ColorFamily)) return false
  if (params.excludeSubcategories.includes(p.subcategory)) return false
  if (params.excludeBrandIds.includes(p.brandId)) return false
  if (params.excludeArticleIds.includes(p.id)) return false
  const attrs = p.attributes ?? {}
  for (const key of Object.keys(params.requireAttributes)) if (attrs[key] !== true) return false
  for (const key of Object.keys(params.excludeAttributes)) if (attrs[key] === true) return false
  return true
}

export function makeCandidate(row: ProductRow, cos: number, channel: Channel): Candidate {
  const { brandName, ...product } = row
  return {
    product: product as Article,
    brandName,
    cos,
    channels: new Set([channel]),
    socialEvidence: [],
    trendEvidence: null,
  }
}

/** Merge secondary-channel hits into the vector candidates (dedupe by product id). */
export function mergeChannels(
  primary: Candidate[],
  social: Array<{ row: ProductRow; evidence: SocialEvidence[] }>,
  trend: Array<{ row: ProductRow; evidence: TrendEvidence }>,
  vector: readonly number[],
): Candidate[] {
  const byId = new Map<string, Candidate>()
  for (const c of primary) byId.set(c.product.id, c)
  for (const { row, evidence } of social) {
    let c = byId.get(row.id)
    if (!c) {
      c = makeCandidate(row, cosineSimilarity(vector, row.styleVector), 'social')
      byId.set(row.id, c)
    }
    c.channels.add('social')
    c.socialEvidence.push(...evidence)
  }
  for (const { row, evidence } of trend) {
    let c = byId.get(row.id)
    if (!c) {
      c = makeCandidate(row, cosineSimilarity(vector, row.styleVector), 'trend')
      byId.set(row.id, c)
    }
    c.channels.add('trend')
    if (!c.trendEvidence || evidence.momentum > c.trendEvidence.momentum) c.trendEvidence = evidence
  }
  return [...byId.values()]
}

export const SOCIAL_KIND_WEIGHT: Readonly<Record<SocialEvidence['kind'], number>> = {
  look: 1,
  advise: 0.9,
  purchase: 0.6,
  save: 0.3,
}

export function socialStrength(evidence: readonly SocialEvidence[]): number {
  let s = 0
  for (const e of evidence) s += e.strength * SOCIAL_KIND_WEIGHT[e.kind]
  return s
}

export function trendMatches(p: Article, trend: ChannelParams['trend']): TrendEvidence | null {
  if (!trend) return null
  let best: TrendEvidence | null = null
  // The aesthetic dimension of the trend index is keyed on product type now.
  for (const t of trend.aesthetics) {
    if (p.subcategory === t.key && (!best || t.momentum > best.momentum)) best = t
  }
  for (const t of trend.categories) {
    if (p.categoryGroup === t.key && (!best || t.momentum > best.momentum)) best = t
  }
  return best
}

// ---------------------------------------------------------------------------
// MemoryRetriever
// ---------------------------------------------------------------------------

export interface MemorySocialHit {
  articleId: string
  userId: string
  kind: SocialEvidence['kind']
  lookId?: string | null
  at: Date
}

export class MemoryRetriever implements Retriever {
  constructor(
    readonly rows: readonly ProductRow[],
    readonly socialHits: readonly MemorySocialHit[] = [],
  ) {}

  retrieve(p: RetrieveParams, channels: ChannelParams = {}): Promise<Candidate[]> {
    const scored: Array<{ row: ProductRow; cos: number }> = []
    for (const row of this.rows) {
      if (!matchesParams(row, p)) continue
      scored.push({ row, cos: cosineSimilarity(p.vector, row.styleVector) })
    }
    const primary = scored
      .toSorted((a, b) => b.cos - a.cos || a.row.id.localeCompare(b.row.id))
      .slice(0, p.limit)
      .map(({ row, cos }) => makeCandidate(row, cos, 'vector'))

    const social: Array<{ row: ProductRow; evidence: SocialEvidence[] }> = []
    if (channels.social && channels.social.trusted.length > 0) {
      const trusted = new Map(channels.social.trusted.map((t) => [t.userId, t]))
      const byProduct = new Map<string, SocialEvidence[]>()
      for (const hit of this.socialHits) {
        const t = trusted.get(hit.userId)
        if (!t) continue
        const list = byProduct.get(hit.articleId) ?? []
        list.push({
          userId: t.userId,
          displayName: t.displayName,
          kind: hit.kind,
          lookId: hit.lookId ?? null,
          strength: t.strength,
          at: hit.at,
        })
        byProduct.set(hit.articleId, list)
      }
      const rows = [...byProduct.entries()]
        .map(([id, evidence]) => ({ row: this.rows.find((r) => r.id === id), evidence }))
        .filter(
          (x): x is { row: ProductRow; evidence: SocialEvidence[] } =>
            !!x.row && matchesParams(x.row, p),
        )
        .toSorted(
          (a, b) =>
            socialStrength(b.evidence) - socialStrength(a.evidence) ||
            a.row.id.localeCompare(b.row.id),
        )
        .slice(0, SOCIAL_CHANNEL_LIMIT)
      social.push(...rows)
    }

    const trend: Array<{ row: ProductRow; evidence: TrendEvidence }> = []
    if (
      channels.trend &&
      (channels.trend.aesthetics.length > 0 || channels.trend.categories.length > 0)
    ) {
      const hits: Array<{ row: ProductRow; evidence: TrendEvidence }> = []
      for (const row of this.rows) {
        if (!matchesParams(row, p)) continue
        const evidence = trendMatches(row, channels.trend)
        if (evidence) hits.push({ row, evidence })
      }
      trend.push(
        ...hits
          .toSorted(
            (a, b) => b.row.popularity - a.row.popularity || a.row.id.localeCompare(b.row.id),
          )
          .slice(0, TREND_CHANNEL_LIMIT),
      )
    }
    return Promise.resolve(mergeChannels(primary, social, trend, p.vector))
  }
}

// ---------------------------------------------------------------------------
// SqlRetriever (SQLite / D1)
// ---------------------------------------------------------------------------

type SqlChunk = ReturnType<typeof sql>

/** WHERE conditions shared by the vector query and the channels. */
export function prefilterConditions(p: RetrieveParams): SqlChunk[] {
  const conds: SqlChunk[] = [inArray(articles.department, p.departments)]
  if (p.categoryGroups && p.categoryGroups.length > 0)
    conds.push(inArray(articles.categoryGroup, p.categoryGroups))
  if (p.excludeGroups.length > 0) conds.push(notInArray(articles.categoryGroup, p.excludeGroups))
  if (p.subcategories && p.subcategories.length > 0)
    conds.push(inArray(articles.subcategory, p.subcategories))
  if (p.priceMin !== null) conds.push(gte(articles.price, p.priceMin))
  if (p.priceMax !== null) conds.push(lte(articles.price, p.priceMax))
  if (p.excludeMaterials.length > 0) conds.push(notInArray(articles.material, p.excludeMaterials))
  if (p.excludeColorFamilies.length > 0)
    conds.push(notInArray(articles.colorFamily, p.excludeColorFamilies))
  if (p.excludeSubcategories.length > 0)
    conds.push(notInArray(articles.subcategory, p.excludeSubcategories))
  if (p.excludeBrandIds.length > 0) conds.push(notInArray(articles.brandId, p.excludeBrandIds))
  if (p.excludeArticleIds.length > 0) conds.push(notInArray(articles.id, p.excludeArticleIds))
  for (const key of Object.keys(p.requireAttributes))
    conds.push(jsonKeyIsTrue(articles.attributes, key))
  for (const key of Object.keys(p.excludeAttributes))
    conds.push(sql`not ${jsonKeyIsTrue(articles.attributes, key)}`)
  return conds
}

const PRODUCT_SELECT = { product: articles, brandName: brands.name }

export class SqlRetriever implements Retriever {
  constructor(readonly db: Database) {}

  /** The vector query (exposed so tests can snapshot `.toSQL()` without a connection). */
  buildQuery(p: RetrieveParams) {
    const cos = cosineExpr(p.vector)
    return this.db
      .select({ ...PRODUCT_SELECT, cos: sql<number>`${cos}` })
      .from(articles)
      .innerJoin(brands, eq(brands.id, articles.brandId))
      .innerJoin(articleVectors, eq(articleVectors.articleId, articles.id))
      .where(and(...prefilterConditions(p)))
      .orderBy(desc(cos), asc(articles.id))
      .limit(p.limit)
  }

  async vectorChannel(p: RetrieveParams): Promise<Candidate[]> {
    const rows = await this.buildQuery(p)
    return rows.map((r) =>
      makeCandidate({ ...r.product, brandName: r.brandName }, Number(r.cos), 'vector'),
    )
  }

  async socialChannel(
    p: RetrieveParams,
    trusted: TrustedUser[],
  ): Promise<Array<{ row: ProductRow; evidence: SocialEvidence[] }>> {
    if (trusted.length === 0) return []
    const ids = trusted.map((t) => t.userId)
    const byUser = new Map(trusted.map((t) => [t.userId, t]))
    const window = sqlDaysAgoMs(SOCIAL_WINDOW_DAYS)
    const [lookRows, purchaseRows, saveRows] = await Promise.all([
      this.db
        .select({
          articleId: lookArticles.articleId,
          userId: looks.ownerId,
          lookId: looks.id,
          at: looks.createdAt,
        })
        .from(lookArticles)
        .innerJoin(looks, eq(looks.id, lookArticles.lookId))
        .where(and(inArray(looks.ownerId, ids), gte(looks.createdAt, window)))
        .orderBy(desc(looks.createdAt))
        .limit(200),
      this.db
        .select({
          articleId: purchases.articleId,
          userId: purchases.userId,
          lookId: purchases.sourceLookId,
          at: purchases.createdAt,
        })
        .from(purchases)
        .where(and(inArray(purchases.userId, ids), gte(purchases.createdAt, window)))
        .orderBy(desc(purchases.createdAt))
        .limit(200),
      this.db
        .select({
          articleId: interactions.articleId,
          userId: interactions.actorUserId,
          lookId: interactions.lookId,
          at: interactions.createdAt,
        })
        .from(interactions)
        .where(
          and(
            inArray(interactions.actorUserId, ids),
            eq(interactions.type, 'SAVE'),
            sql`${interactions.articleId} is not null`,
            gte(interactions.createdAt, window),
          ),
        )
        .orderBy(desc(interactions.createdAt))
        .limit(200),
    ])
    const byProduct = new Map<string, SocialEvidence[]>()
    const push = (
      articleId: string | null,
      userId: string,
      kind: SocialEvidence['kind'],
      lookId: string | null,
      at: Date,
    ): void => {
      if (articleId === null) return
      const t = byUser.get(userId)
      if (!t) return
      const list = byProduct.get(articleId) ?? []
      list.push({ userId, displayName: t.displayName, kind, lookId, strength: t.strength, at })
      byProduct.set(articleId, list)
    }
    for (const r of lookRows) push(r.articleId, r.userId, 'look', r.lookId, r.at)
    for (const r of purchaseRows) push(r.articleId, r.userId, 'purchase', r.lookId, r.at)
    for (const r of saveRows) push(r.articleId, r.userId, 'save', r.lookId, r.at)
    if (byProduct.size === 0) return []
    const top = [...byProduct.entries()]
      .toSorted((a, b) => socialStrength(b[1]) - socialStrength(a[1]) || a[0].localeCompare(b[0]))
      .slice(0, SOCIAL_CHANNEL_LIMIT * 2)
    const rows = await this.db
      .select(PRODUCT_SELECT)
      .from(articles)
      .innerJoin(brands, eq(brands.id, articles.brandId))
      .where(
        inArray(
          articles.id,
          top.map(([id]) => id),
        ),
      )
    const out: Array<{ row: ProductRow; evidence: SocialEvidence[] }> = []
    for (const r of rows) {
      const row: ProductRow = { ...r.product, brandName: r.brandName }
      if (!matchesParams(row, p)) continue
      out.push({ row, evidence: byProduct.get(row.id) ?? [] })
    }
    return out
      .toSorted(
        (a, b) =>
          socialStrength(b.evidence) - socialStrength(a.evidence) ||
          a.row.id.localeCompare(b.row.id),
      )
      .slice(0, SOCIAL_CHANNEL_LIMIT)
  }

  async trendChannel(
    p: RetrieveParams,
    trend: NonNullable<ChannelParams['trend']>,
  ): Promise<Array<{ row: ProductRow; evidence: TrendEvidence }>> {
    const aKeys = trend.aesthetics.map((t) => t.key)
    const cKeys = trend.categories.map((t) => t.key)
    if (aKeys.length === 0 && cKeys.length === 0) return []
    const match: SqlChunk[] = []
    if (cKeys.length > 0) match.push(inArray(articles.categoryGroup, cKeys as CategoryGroup[]))
    if (aKeys.length > 0) match.push(inArray(articles.subcategory, aKeys))
    const rows = await this.db
      .select(PRODUCT_SELECT)
      .from(articles)
      .innerJoin(brands, eq(brands.id, articles.brandId))
      .where(and(...prefilterConditions(p), sql`(${sql.join(match, sql` OR `)})`))
      .orderBy(desc(articles.popularity), asc(articles.id))
      .limit(TREND_CHANNEL_LIMIT)
    const out: Array<{ row: ProductRow; evidence: TrendEvidence }> = []
    for (const r of rows) {
      const row: ProductRow = { ...r.product, brandName: r.brandName }
      const evidence = trendMatches(row, trend)
      if (evidence) out.push({ row, evidence })
    }
    return out
  }

  async retrieve(p: RetrieveParams, channels: ChannelParams = {}): Promise<Candidate[]> {
    const [primary, social, trend] = await Promise.all([
      this.vectorChannel(p),
      channels.social && channels.social.trusted.length > 0
        ? this.socialChannel(p, channels.social.trusted)
        : Promise.resolve([]),
      channels.trend ? this.trendChannel(p, channels.trend) : Promise.resolve([]),
    ])
    return mergeChannels(primary, social, trend, p.vector)
  }
}

/** Former name (Postgres/pgvector era); kept so existing imports keep working. */
export const PgRetriever = SqlRetriever
export type PgRetriever = SqlRetriever

// ---------------------------------------------------------------------------
// Relaxation ladder (§2.1)
// ---------------------------------------------------------------------------

export type RelaxStep = 'subcategories' | 'price' | 'unisex' | 'color' | 'groups'

export const RELAX_MIN_ROWS = 20

export interface RelaxedResult {
  candidates: Candidate[]
  /** Steps applied, in order. */
  relaxed: RelaxStep[]
  params: RetrieveParams
}

/**
 * Re-query while fewer than `minRows` candidates come back: (1) drop subcategories,
 * (2) priceMax ×1.25, (3) add unisex (never for kids), (4) drop colour exclusions,
 * (5) drop category groups (browse only).
 */
export async function retrieveWithRelaxation(
  retriever: Retriever,
  params: RetrieveParams,
  channels: ChannelParams = {},
  opts: { minRows?: number; allowDropGroups?: boolean; keepSubcategories?: boolean } = {},
): Promise<RelaxedResult> {
  const minRows = opts.minRows ?? RELAX_MIN_ROWS
  let current = params
  let candidates = await retriever.retrieve(current, channels)
  const relaxed: RelaxStep[] = []
  const steps: Array<[RelaxStep, (p: RetrieveParams) => RetrieveParams | null]> = [
    [
      'subcategories',
      (p) => (p.subcategories && !opts.keepSubcategories ? { ...p, subcategories: null } : null),
    ],
    [
      'price',
      (p) => (p.priceMax !== null ? { ...p, priceMax: Math.round(p.priceMax * 1.25) } : null),
    ],
    [
      'unisex',
      (p) =>
        p.departments.includes('unisex') || p.departments.includes('kids')
          ? null
          : { ...p, departments: [...p.departments, 'unisex'] },
    ],
    [
      'color',
      (p) => (p.excludeColorFamilies.length > 0 ? { ...p, excludeColorFamilies: [] } : null),
    ],
    [
      'groups',
      (p) => (opts.allowDropGroups && p.categoryGroups ? { ...p, categoryGroups: null } : null),
    ],
  ]
  for (const [step, apply] of steps) {
    if (candidates.length >= minRows) break
    const next = apply(current)
    if (!next) continue
    current = next
    relaxed.push(step)
    candidates = await retriever.retrieve(current, channels)
  }
  return { candidates, relaxed, params: current }
}
