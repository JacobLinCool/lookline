/**
 * Engine 02 — explainable recommendation (contract: `recommend`, `similarProducts`,
 * `completeTheLook`, `searchProducts`). `recommend` never writes feedback events or interactions:
 * the web layer logs impressions.
 */
import { STYLE_BLOCKS, axisIndex, toStyleVector } from '@lookline/catalog'
import type { Axis, CategoryGroup, ColorFamily, Season } from '@lookline/catalog'
import { brands, eq, lookArticles, looks, articles, users } from '@lookline/db'
import type { Article, Database, Department } from '@lookline/db'
import type { FactorName, Outfit, RankedItem, RecommendRequest, RecommendResponse } from '../types'
import { contextVector } from '../preference/bandit'
import type { LinUCB } from '../preference/bandit'
import { loadBanditState } from '../preference/state'
import { templateForOccasion } from './aesthetics'
import { loadContext } from './context'
import type { ContextInput } from './context'
import type { RankContext } from './factors'
import { computeIntentVector } from './intent-vector'
import {
  budgetOf,
  isGift,
  parseTokens,
  resolveDepartments,
  resolvedDepartment,
  widenedPrice,
} from './intent-view'
import type { EngineIntent } from './intent-view'
import { buildOutfits } from './outfit'
import type { PartnerLook } from './outfit'
import type { PlacedItem } from './outfit/solver'
import { plansForTemplate, roleForGroup } from './outfit/templates'
import { SqlRetriever, emptyParams, retrieveWithRelaxation } from './retrieve'
import type { ChannelParams, Retriever, RetrieveParams } from './retrieve'
import { rank } from './score'
import { searchProducts } from './search'
import { RETRIEVAL_BLOCK_WEIGHTS, blockScale } from './vector'
import { DEFAULT_WEIGHTS, resolveWeights } from './weights'
import type { ArmName } from './weights'

export { searchProducts }
export { SqlRetriever, PgRetriever, MemoryRetriever, retrieveWithRelaxation } from './retrieve'
export type {
  Candidate,
  Retriever,
  RetrieveParams,
  ChannelParams,
  TrustedUser,
  SocialEvidence,
} from './retrieve'
export { ARMS, ARM_NAMES, DEFAULT_WEIGHTS, resolveWeights, redistribute } from './weights'
export type { ArmName } from './weights'
export { rank, hardFilters, scoreCandidate } from './score'
export type { RankContext, RankUser, TrendStat } from './factors'
export { buildExplanation, polishWithLlm, renderSummary } from './explain'
export { SLOT_TEMPLATES, SLOT_SHARE_MAX, planFor, plansForTemplate } from './outfit/templates'
export { compat, colourHarmony } from './outfit/compat'
export { solveOutfits, diversify } from './outfit/solver'
export { buildOutfits } from './outfit'
export type { PartnerLook } from './outfit'
export { loadContext, emptyContext } from './context'
export type { ContextInput } from './context'
export { resolveAestheticTables, templateForOccasion } from './aesthetics'
export type { EngineIntent } from './intent-view'
export { scanQuery, planSearch, buildSearchQuery } from './search'
export { fallbackIntentVector } from './intent-vector'

export const SINGLE_LIMIT = 300
export const BROWSE_LIMIT = 400
export const OUTFIT_SLOT_LIMIT = 120
export const SIMILAR_LIMIT = 60
export const COMPLETE_SLOT_LIMIT = 80

export interface RecommendDeps {
  retriever: Retriever
  context: ContextInput
  /** Override the intent vector (tests, evaluation). */
  intentVector?: number[]
  seed?: number
  partner?: PartnerLook | null
  /** The global bandit (§4.4). Absent → the default `balanced` blend, as before it was wired in. */
  bandit?: LinUCB | null
}

/**
 * Pick the blend arm for this request (§4.4). Returns `null` when there is no bandit or no signed-in
 * user, which leaves `DEFAULT_WEIGHTS` in charge. The context vector is returned with the choice
 * because the caller has to log both on the impression for the reward to be attributable.
 */
export function chooseArm(
  bandit: LinUCB | null | undefined,
  intent: EngineIntent,
  context: ContextInput,
  opts: { userId?: string; outfit: boolean },
): { name: ArmName; weights: Record<FactorName, number>; contextVector: number[] } | null {
  if (!bandit || !opts.userId) return null
  const user = context.user
  const eventCount = user?.eventCount ?? 0
  const createdAt = user?.createdAt ?? null
  const x = contextVector({
    eventCount,
    recipientOther: isGift(intent),
    trustedCount: user?.trusted.length ?? 0,
    confidence: intent.confidence,
    outfit: opts.outfit,
    hasBudgetMax: budgetOf(intent).max !== null,
    daysSinceSignup: createdAt
      ? Math.max(0, (context.now.getTime() - createdAt.getTime()) / 86_400_000)
      : 0,
  })
  const choice = bandit.choose(x, { eventCount })
  return { name: choice.name as ArmName, weights: choice.weights, contextVector: x }
}

/** Shared prefilters from the intent tokens (§1.2) and the request. */
export function baseParamsFor(
  intent: EngineIntent,
  req: RecommendRequest,
  context: ContextInput,
  department: Department | null,
): RetrieveParams {
  const avoid = parseTokens(intent.mustAvoid)
  const have = parseTokens(intent.mustHave)
  const budget = budgetOf(intent)
  const price = widenedPrice(budget, budget.scope === 'total' ? null : budget.max)
  const excludeBrandIds: number[] = []
  for (const b of avoid.brands) {
    const id = context.brandIds.get(b)
    if (id !== undefined && !excludeBrandIds.includes(id)) excludeBrandIds.push(id)
  }
  const excludeGroups = [...new Set([...avoid.groups, ...(intent.excludeCategoryGroups ?? [])])]
  return emptyParams([], {
    departments: resolveDepartments(intent, department),
    excludeGroups,
    priceMin: price.priceMin,
    priceMax: price.priceMax,
    excludeMaterials: avoid.materials,
    excludeColorFamilies: avoid.colorFamilies,
    excludeSubcategories: avoid.subcategories,
    excludeBrandIds,
    excludeArticleIds: [...(req.exclude ?? [])],
    requireAttributes: Object.fromEntries(have.attributes.map((a) => [a, true as const])),
    excludeAttributes: Object.fromEntries(avoid.attributes.map((a) => [a, true as const])),
    sleeves: have.sleeves,
    excludeSleeves: avoid.sleeves,
  })
}

function channelsFor(context: ContextInput, userId: string | undefined): ChannelParams {
  return {
    social:
      userId && context.user && context.user.trusted.length > 0
        ? { trusted: context.user.trusted }
        : null,
    trend: context.trendChannel,
  }
}

/** The pure core of `recommend`: everything after the context is loaded. */
export async function runRecommend(
  req: RecommendRequest,
  deps: RecommendDeps,
): Promise<RecommendResponse> {
  const t0 = performance.now()
  const timings: Record<string, number> = {}
  const intent = req.intent as EngineIntent
  const context = deps.context
  const user = context.user
  const wantOutfitsForArm = req.outfits ?? intent.mode === 'outfit'
  // An explicit `req.weights` (evaluation, the engine lab) still wins; otherwise the arm decides.
  const arm = req.weights
    ? null
    : chooseArm(deps.bandit, intent, context, {
        userId: req.userId,
        outfit: wantOutfitsForArm,
      })
  const weights = resolveWeights(req.weights, arm?.weights ?? DEFAULT_WEIGHTS)
  const base = user?.preference ?? null
  const intentVector = deps.intentVector ?? computeIntentVector(intent, base, user?.eventCount)
  const department = resolvedDepartment(intent, user?.department ?? null)
  const baseParams = baseParamsFor(intent, req, context, department)
  const channels = channelsFor(context, req.userId)
  const ctx: RankContext = {
    intent,
    intentVector,
    now: context.now,
    seed: deps.seed ?? 1,
    user,
    trend: context.trend,
    popularityMax: context.popularityMax,
    weights,
  }
  const wantOutfits = wantOutfitsForArm
  let items: RankedItem[] = []
  let outfits: Outfit[] = []
  let candidates = 0

  if (!wantOutfits || intent.mode !== 'outfit') {
    const t1 = performance.now()
    const browse = intent.mode === 'browse'
    const params: RetrieveParams = {
      ...baseParams,
      vector: blockScale(intentVector, RETRIEVAL_BLOCK_WEIGHTS),
      categoryGroups: intent.categoryGroups.length > 0 ? [...intent.categoryGroups] : null,
      subcategories: intent.subcategories.length > 0 ? [...intent.subcategories] : null,
      limit: browse ? BROWSE_LIMIT : SINGLE_LIMIT,
    }
    const result = await retrieveWithRelaxation(deps.retriever, params, channels, {
      allowDropGroups: browse,
    })
    for (const step of result.relaxed) timings[`relaxed:${step}`] = 1
    candidates = result.candidates.length
    timings.retrieve = performance.now() - t1
    const t2 = performance.now()
    items = rank(result.candidates, { ...ctx, relaxed: result.relaxed }, { limit: req.limit ?? 10 })
    timings.rank = performance.now() - t2
  }

  if (wantOutfits) {
    const built = await buildOutfits({
      intent,
      intentVector,
      ctx,
      retriever: deps.retriever,
      channels,
      baseParams,
      department: department === 'kids' ? 'kids' : (department ?? 'women'),
      budget: budgetOf(intent),
      count: req.outfitCount ?? 3,
      partner: deps.partner ?? null,
      perSlotLimit: OUTFIT_SLOT_LIMIT,
    })
    for (const step of built.relaxed) timings[`relaxed:${step}`] = 1
    Object.assign(timings, built.timings)
    outfits = built.outfits
    candidates += built.candidates
    if (items.length === 0) items = built.slotItems.slice(0, req.limit ?? 10)
  }
  timings.total = performance.now() - t0
  const res: RecommendResponse = { items, outfits, candidates, weights, intentVector, timings }
  if (arm) res.arm = { name: arm.name, contextVector: arm.contextVector }
  return res
}

async function loadPartnerLook(db: Database, lookId: string): Promise<PartnerLook | null> {
  const [lookRows, productRows] = await Promise.all([
    db
      .select({ id: looks.id, styleVector: looks.styleVector, ownerName: users.displayName })
      .from(looks)
      .innerJoin(users, eq(users.id, looks.ownerId))
      .where(eq(looks.id, lookId)),
    db
      .select({ product: articles })
      .from(lookArticles)
      .innerJoin(articles, eq(articles.id, lookArticles.articleId))
      .where(eq(lookArticles.lookId, lookId)),
  ])
  const look = lookRows[0]
  if (!look) return null
  const items = productRows.map((r) => r.product)
  const counts = new Map<string, { n: number; hex: string }>()
  for (const p of items) {
    const c = counts.get(p.colorFamily) ?? { n: 0, hex: p.colorHex }
    c.n += 1
    counts.set(p.colorFamily, c)
  }
  let dominant: { family: string; hex: string } | null = null
  let best = 0
  for (const [family, { n, hex }] of counts) {
    if (n > best) {
      best = n
      dominant = { family, hex }
    }
  }
  let styleVector = look.styleVector ?? null
  if (!styleVector && items.length > 0) {
    styleVector = Array.from({ length: 64 }, () => 0)
    for (const p of items) {
      for (let i = 0; i < STYLE_BLOCKS.groups[0]; i++)
        styleVector[i] = (styleVector[i] ?? 0) + (p.styleVector[i] ?? 0) / items.length
    }
  }
  if (!styleVector) return null
  return {
    name: look.ownerName,
    styleVector,
    colorHex: dominant?.hex ?? '#111114',
    colorFamily: dominant?.family ?? 'black',
  }
}

export async function recommend(db: Database, req: RecommendRequest): Promise<RecommendResponse> {
  const t0 = performance.now()
  const intent = req.intent as EngineIntent
  const avoid = parseTokens(intent.mustAvoid)
  const [context, partner, bandit] = await Promise.all([
    loadContext(db, { userId: req.userId ?? null, brandTokens: avoid.brands }),
    intent.referenceRole === 'coordinate-with' && intent.referenceLookId
      ? loadPartnerLook(db, intent.referenceLookId).catch(() => null)
      : Promise.resolve(null),
    // A failure here must not cost a recommendation: without it the blend is simply `balanced`.
    // `rebuild: false` keeps the replay off the request path: a missing row is the analytics job's
    // to rebuild, not a visitor's scan of up to `REBUILD_ROW_LIMIT` feedback rows.
    req.userId && !req.weights
      ? loadBanditState(db, { now: new Date(), rebuild: false }).catch(() => null)
      : Promise.resolve(null),
  ])
  const contextMs = performance.now() - t0
  const res = await runRecommend(req, {
    retriever: new SqlRetriever(db),
    context,
    partner,
    bandit,
  })
  res.timings.context = contextMs
  res.timings.total = performance.now() - t0
  return res
}

// ---------------------------------------------------------------------------
// Article-anchored requests
// ---------------------------------------------------------------------------

async function loadProduct(
  db: Database,
  articleId: string,
): Promise<(Article & { brandName: string }) | null> {
  const rows = await db
    .select({ product: articles, brandName: brands.name })
    .from(articles)
    .innerJoin(brands, eq(brands.id, articles.brandId))
    .where(eq(articles.id, articleId))
  const r = rows[0]
  return r ? { ...r.product, brandName: r.brandName } : null
}

/** Pseudo-intent from a product (§2.4): aesthetics 1.0/.6/.4, its colour family, axes from its vector. */
export function pseudoIntent(
  p: Article,
  mode: 'single' | 'outfit',
  opts: { budget?: { min?: number; max?: number } } = {},
): EngineIntent {
  // Was the article's own aesthetic tags; the catalogue has none, so an intent built from a
  // product carries its measurable axes and no style label.
  const aestheticWeights: Record<string, number> = {}
  const axisTargets: Record<string, number> = {}
  const axes: Axis[] = [
    'formality',
    'warmth',
    'boldness',
    'structure',
    'coverage',
    'texture',
    'trendiness',
    'price-tier',
  ]
  for (const axis of axes) axisTargets[axis] = p.styleVector[axisIndex(axis)] ?? 0.5
  const intent: EngineIntent = {
    utterance: '',
    locale: 'en',
    mode,
    department: p.department,
    categoryGroups: mode === 'single' ? [p.categoryGroup as CategoryGroup] : [],
    subcategories: [],
    colors: [p.colorName],
    colorFamilies: [p.colorFamily as ColorFamily],
    aesthetics: [],
    materials: [],
    patterns: [],
    fits: [],
    recipient: { kind: 'self' },
    mustHave: [],
    mustAvoid: [],
    assumptions: [],
    clarifications: [],
    confidence: 1,
    aestheticWeights,
    axisTargets,
  }
  const season = p.seasons.find((s) => s !== 'all-season') as Season | undefined
  if (season) intent.season = season
  if (p.occasions[0]) intent.occasion = p.occasions[0]
  if (opts.budget) {
    intent.budget = {
      ...opts.budget,
      currency: 'TWD',
      strictness: 'hard',
      scope: mode === 'outfit' ? 'total' : 'per_item',
    }
  }
  return intent
}

/** Vector of a pseudo-intent: the product's colour and axes, group one-hot when single. */
export function pseudoVector(p: Article, intent: EngineIntent): number[] {
  // One colour per article — H&M files each colourway separately.
  const secondary = null
  const axes = Object.fromEntries(Object.entries(intent.axisTargets ?? {})) as Partial<
    Record<Axis, number>
  >
  return toStyleVector({
    colorFamily: p.colorFamily as ColorFamily,
    secondaryColorFamily: secondary,
    axes,
    categoryGroup: intent.mode === 'single' ? (p.categoryGroup as CategoryGroup) : null,
  })
}

export async function similarProducts(
  db: Database,
  articleId: string,
  opts: { limit?: number; userId?: string } = {},
): Promise<RankedItem[]> {
  const product = await loadProduct(db, articleId)
  if (!product) return []
  const context = await loadContext(db, { userId: opts.userId ?? null })
  return similarProductsWith(product, { retriever: new SqlRetriever(db), context }, opts)
}

/** Core of `similarProducts` (retriever-agnostic). */
export async function similarProductsWith(
  product: Article,
  deps: RecommendDeps,
  opts: { limit?: number; userId?: string } = {},
): Promise<RankedItem[]> {
  const intent = pseudoIntent(product, 'single', {
    budget: { min: Math.round(product.price * 0.5), max: Math.round(product.price * 2) },
  })
  const vector = pseudoVector(product, intent)
  const req: RecommendRequest = { intent, exclude: [product.id] }
  if (opts.userId) req.userId = opts.userId
  const base = baseParamsFor(intent, req, deps.context, product.department)
  const params: RetrieveParams = {
    ...base,
    vector: blockScale(vector, RETRIEVAL_BLOCK_WEIGHTS),
    categoryGroups: [product.categoryGroup as CategoryGroup],
    subcategories: null,
    priceMin: Math.round(product.price * 0.5),
    priceMax: Math.round(product.price * 2),
    limit: SIMILAR_LIMIT,
  }
  const result = await retrieveWithRelaxation(
    deps.retriever,
    params,
    channelsFor(deps.context, opts.userId),
  )
  const ctx: RankContext = {
    intent,
    intentVector: vector,
    now: deps.context.now,
    seed: deps.seed ?? 1,
    user: deps.context.user,
    trend: deps.context.trend,
    popularityMax: deps.context.popularityMax,
    weights: resolveWeights(null),
    relaxed: result.relaxed,
  }
  return rank(result.candidates, ctx, { limit: opts.limit ?? 12, lambda: 0.25 })
}

export async function completeTheLook(
  db: Database,
  articleId: string,
  opts: { userId?: string; budget?: number; count?: number } = {},
): Promise<Outfit[]> {
  const product = await loadProduct(db, articleId)
  if (!product) return []
  const context = await loadContext(db, { userId: opts.userId ?? null })
  return completeTheLookWith(product, { retriever: new SqlRetriever(db), context }, opts)
}

/** Core of `completeTheLook` (retriever-agnostic): plans B/A minus the product's group, product pinned. */
export async function completeTheLookWith(
  product: Article & { brandName: string },
  deps: RecommendDeps,
  opts: { userId?: string; budget?: number; count?: number } = {},
): Promise<Outfit[]> {
  const hint = deps.context.user?.budgetHint ?? null
  const budgetMax = opts.budget ?? (hint ? hint * 3 : undefined)
  const intent = pseudoIntent(
    product,
    'outfit',
    budgetMax ? { budget: { max: Math.round(budgetMax) } } : {},
  )
  const vector = pseudoVector(product, intent)
  const req: RecommendRequest = { intent, exclude: [product.id] }
  if (opts.userId) req.userId = opts.userId
  const department: Department =
    product.department === 'unisex'
      ? (deps.context.user?.department ?? 'women')
      : product.department
  const template = templateForOccasion(product.occasions[0] ?? null)
  const season = product.seasons.find((s) => s !== 'all-season') as Season | undefined
  const plans = plansForTemplate(template, { department, season: season ?? null }).filter(
    (p) => !p.key.endsWith(':C'),
  )
  const pinnedItem: RankedItem = {
    product,
    brandName: product.brandName,
    score: 1,
    explanation: {
      summary: 'the piece you are completing',
      factors: [
        {
          factor: 'style_similarity',
          weight: 1,
          value: 1,
          contribution: 1,
          evidence: 'anchor item',
        },
      ],
    },
    role: roleForGroup(product.categoryGroup),
  }
  const pinned: PlacedItem[] = [
    {
      item: pinnedItem,
      slotKey: `pinned:${product.categoryGroup}`,
      role: roleForGroup(product.categoryGroup),
      pinned: true,
    },
  ]
  const ctx: RankContext = {
    intent,
    intentVector: vector,
    now: deps.context.now,
    seed: deps.seed ?? 1,
    user: deps.context.user,
    trend: deps.context.trend,
    popularityMax: deps.context.popularityMax,
    weights: resolveWeights(null),
  }
  const built = await buildOutfits({
    intent,
    intentVector: vector,
    ctx,
    retriever: deps.retriever,
    channels: channelsFor(deps.context, opts.userId),
    baseParams: baseParamsFor(intent, req, deps.context, department),
    department,
    budget: budgetOf(intent),
    count: opts.count ?? 2,
    plans,
    pinned,
    perSlotLimit: COMPLETE_SLOT_LIMIT,
  })
  return built.outfits
}
