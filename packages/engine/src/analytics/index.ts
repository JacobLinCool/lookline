/**
 * Graph, lineage and trend analytics (ENGINE_SPEC §5). Contract exports: `runAnalytics`,
 * `getTrendDashboard`, `getLineage`, `getUserNetwork`. The pure building blocks are re-exported
 * as additions. `new Date()` is only used here as the default for `now` at the I/O boundary.
 */
import {
  RELATIONSHIP_KIND_VALUES,
  type Database,
  type LineageStat,
  type Look,
  type RelationshipKind,
} from '@lookline/db'
import type {
  AnalyticsSummary,
  Influencer,
  LineageNode,
  LineageTree,
  TrendDashboard,
  TrendSeries,
  UserNetwork,
} from '../types'
import { aestheticName, categoryGroupName, colorFamilyName, humanizeSlug } from './constants'
import {
  CLUSTER_SEED,
  clusterLabel,
  clusterUsers,
  labelPropagation,
  type LabelEdge,
  type LabelNode,
} from './graph/cluster'
import { rebuildAndSaveBanditState } from '../preference/state'
import { deriveRelationships } from './graph/relationships'
import * as q from './queries'
import { DAY_MS, addDays, compareStrings, dayKey, percentile, round } from './shared'
import type { InteractionLite, LookLite, ProductLite, PurchaseLite } from './shared'
import {
  buildForest,
  collectTree,
  computeInfluencers,
  computeLineage,
  statsForTree,
  type LineageStatRow,
} from './trend/lineage'
import { recommendManufacturing } from './trend/manufacturing'
import {
  buildTrendEvents,
  computeTrendSignals,
  lookKeys,
  splitTrendKey,
  trendKey,
  type TrendEvidence,
  type TrendSignalRow,
} from './trend/signals'

export {
  deriveRelationships,
  trust,
  RELATIONSHIP_BASE,
  TRUST_WEIGHTS,
  type RelationshipRow,
  type RelationshipInput,
} from './graph/relationships'
export {
  kmeans,
  chooseK,
  clusterUsers,
  clusterLabel,
  labelPropagation,
  PREFERENCE_BLOCK_WEIGHTS,
  type KMeansResult,
} from './graph/cluster'
export {
  computeLineage,
  computeInfluencers,
  buildForest,
  collectTree,
  type LineageInput,
  type LineageStatRow,
  type InfluencerRow,
} from './trend/lineage'
export {
  buildTrendEvents,
  computeTrendSignals,
  EVENT_WEIGHTS,
  momentumOf,
  isEmerging,
  type TrendEvent,
  type TrendSignalRow,
  type TrendEvidence,
} from './trend/signals'
export {
  recommendManufacturing,
  type ManufacturingRow,
  type ManufacturingInput,
  type ManufacturingSignal,
} from './trend/manufacturing'
export { dayKey as analyticsDayKey } from './shared'
export type {
  UserLite,
  InteractionLite,
  PurchaseLite,
  LookLite,
  ParticipantLite,
  LookProductLite,
  ProductLite,
  IntentSessionLite,
} from './shared'

/** Days of `trend_signals` rebuilt by `runAnalytics`. */
export const SIGNAL_DAYS = 60
export const LINEAGE_MAX_NODES = 200

// ---------------------------------------------------------------------------
// runAnalytics
// ---------------------------------------------------------------------------

export async function runAnalytics(
  db: Database,
  opts: { now?: Date } = {},
): Promise<AnalyticsSummary> {
  const started = performance.now()
  const now = opts.now ?? new Date()
  const raw = await q.loadAnalyticsRaw(db, now)

  // 1. relationships
  const relationshipRows = deriveRelationships(
    {
      interactions: raw.interactions,
      purchases: raw.purchases,
      asks: raw.asks,
      askResponses: raw.askResponses,
      looks: raw.looks,
      lookParticipants: raw.participants,
    },
    now,
  )
  const relationships = await q.rebuildRelationships(db, relationshipRows, now)

  // 2. taste clusters
  const clustering = clusterUsers(raw.users, CLUSTER_SEED)
  await q.writeTasteClusters(db, clustering.assignments)
  const clusterOf = new Map<string, number | null>()
  for (const u of raw.users) clusterOf.set(u.id, clustering.assignments.get(u.id) ?? null)
  const clusterLabels = new Map<number, string>()
  clustering.centroids.forEach((c, i) => clusterLabels.set(i, clusterLabel(c).label))

  // 3. social clusters: keep the simulation's, label-propagate the rest
  const nodes: LabelNode[] = raw.users.map((u) => ({
    id: u.id,
    fixed: u.socialCluster,
    seed: clusterOf.get(u.id) ?? null,
  }))
  const edgeWeights = new Map<string, LabelEdge>()
  for (const r of relationshipRows) {
    const [a, b] = r.aUserId < r.bUserId ? [r.aUserId, r.bUserId] : [r.bUserId, r.aUserId]
    const key = `${a} ${b}`
    const e = edgeWeights.get(key)
    if (e) e.weight += r.weight
    else edgeWeights.set(key, { a, b, weight: r.weight })
  }
  const social = labelPropagation(nodes, [...edgeWeights.values()])
  const socialWrites = new Map<string, number>()
  for (const u of raw.users) {
    if (u.socialCluster !== null) continue
    const label = social.get(u.id)
    if (label !== null && label !== undefined) socialWrites.set(u.id, label)
  }
  await q.writeSocialClusters(db, socialWrites)

  // 4. lineage stats
  const lineageInput = {
    looks: raw.looks,
    participants: raw.participants,
    interactions: raw.interactions,
    purchases: raw.purchases,
    clusterOf,
  }
  const lineageRows = computeLineage(lineageInput)
  const lineages = await q.rebuildLineageStats(db, lineageRows, now)

  // 5. trend signals
  const forest = buildForest(raw.looks, raw.participants)
  const rootOf = new Map<string, string>()
  for (const rootId of forest.roots) {
    for (const id of collectTree(forest, rootId).order) if (!rootOf.has(id)) rootOf.set(id, rootId)
  }
  const productsByLook = new Map<string, ProductLite[]>()
  for (const lp of raw.lookArticles) {
    const p = raw.articles.get(lp.articleId)
    if (!p) continue
    const list = productsByLook.get(lp.lookId)
    if (list) list.push(p)
    else productsByLook.set(lp.lookId, [p])
  }
  const rootKeys = new Map<string, string[]>()
  for (const rootId of forest.roots) {
    rootKeys.set(rootId, lookKeys(forest.lookById.get(rootId), productsByLook.get(rootId) ?? []))
  }
  const events = buildTrendEvents({
    interactions: raw.interactions,
    purchases: raw.purchases,
    looks: raw.looks,
    lookArticles: raw.lookArticles,
    intents: raw.intents,
    articles: raw.articles,
    clusterOf,
    rootOf,
  })
  const endDay = dayKey(now)
  const signalRows = computeTrendSignals(events, {
    endDay,
    days: SIGNAL_DAYS,
    clusterCount: Math.max(1, clustering.k),
    lineages: lineageRows,
    rootKeys,
  })
  const trendSignals = await q.rebuildTrendSignals(
    db,
    signalRows,
    addDays(endDay, -(SIGNAL_DAYS - 1)),
    endDay,
    now,
  )

  // 6. manufacturing
  const latest = new Map<string, TrendSignalRow>()
  for (const r of signalRows) if (r.day === endDay) latest.set(trendKey(r.dimension, r.key), r)
  const sessionsWithPurchase = new Set<string>()
  for (const p of raw.purchases) if (p.intentSessionId) sessionsWithPurchase.add(p.intentSessionId)
  const manufacturingRows = recommendManufacturing({
    events,
    articles: raw.articles,
    intents: raw.intents,
    sessionsWithPurchase,
    signals: latest,
    supply: raw.supply,
    clusterLabels,
    endDay,
  })
  const manufacturing = await q.rebuildManufacturing(db, manufacturingRows, now)

  // 7. product trend scores from the last 14 days of weighted events
  const productWeight = new Map<string, number>()
  const cutoff = addDays(endDay, -13)
  for (const e of events) {
    if (e.day < cutoff || e.day > endDay || e.weight <= 0) continue
    for (const pid of e.articleIds) productWeight.set(pid, (productWeight.get(pid) ?? 0) + e.weight)
  }
  const top = percentile([...productWeight.values()], 0.95)
  const scores = new Map<string, number>()
  if (top > 0) {
    for (const [pid, w] of productWeight)
      scores.set(pid, round(Math.min(1, Math.log1p(w) / Math.log1p(top))))
  }
  await q.updateTrendScores(db, scores)

  // 8. bandit replay. Without it the first request that needs the bandit rebuilds from every
  // attributed feedback row on the spot; here it is one batch job like the rest of this function.
  let banditSlates = 0
  try {
    const bandit = await rebuildAndSaveBanditState(db, now)
    for (const a of bandit.summary()) banditSlates += a.pulls
  } catch (error) {
    console.warn('[analytics] bandit replay skipped', error)
  }

  return {
    relationships,
    clusters: clustering.k,
    lineages,
    trendSignals,
    manufacturing,
    banditSlates,
    durationMs: Math.round(performance.now() - started),
  }
}

// ---------------------------------------------------------------------------
// getTrendDashboard
// ---------------------------------------------------------------------------

function labelFor(dimension: TrendSeries['dimension'], key: string): string {
  switch (dimension) {
    case 'aesthetic':
      return aestheticName(key)
    case 'category':
      return categoryGroupName(key)
    case 'color':
      return colorFamilyName(key)
    case 'silhouette':
      return humanizeSlug(key)
    case 'aesthetic_category': {
      const { dimension: _d, key: raw } = splitTrendKey(trendKey(dimension, key))
      const i = raw.indexOf('|')
      if (i < 0) return humanizeSlug(raw)
      return `${aestheticName(raw.slice(0, i))} × ${categoryGroupName(raw.slice(i + 1))}`
    }
  }
}

function toSeries(row: {
  day: string
  dimension: TrendSeries['dimension']
  key: string
  momentum: number
  volume: number
  velocity: number
  crossCluster: number
  conversion: number
  gmv: number
  emerging: boolean
  evidence: Record<string, unknown>
}): TrendSeries {
  const ev = row.evidence as Partial<TrendEvidence>
  const daily = Array.isArray(ev.daily) ? ev.daily.map((v) => Number(v) || 0) : [row.volume]
  const days =
    Array.isArray(ev.days) && ev.days.length === daily.length
      ? ev.days.map(String)
      : daily.map((_, i) => addDays(row.day, i - (daily.length - 1)))
  return {
    dimension: row.dimension,
    key: row.key,
    label: labelFor(row.dimension, row.key),
    momentum: row.momentum,
    volume: row.volume,
    velocity: row.velocity,
    crossCluster: row.crossCluster,
    conversion: row.conversion,
    gmv: row.gmv,
    emerging: row.emerging,
    series: daily.map((volume, i) => ({ day: days[i] ?? row.day, volume })),
  }
}

const sortByMomentum = (list: TrendSeries[] | undefined): TrendSeries[] =>
  (list ?? []).toSorted(
    (a, b) => b.momentum - a.momentum || b.volume - a.volume || compareStrings(a.key, b.key),
  )

export async function getTrendDashboard(
  db: Database,
  opts: { days?: number; now?: Date } = {},
): Promise<TrendDashboard> {
  const now = opts.now ?? new Date()
  const days = Math.max(1, Math.floor(opts.days ?? 14))
  const from = new Date(now.getTime() - days * DAY_MS)
  const day = await q.latestSignalDay(db, dayKey(now))
  const [
    signalRows,
    headline,
    topLineages,
    clusterSummaries,
    manufacturing,
    evaluation,
    clusterMap,
    looksLite,
    participants,
    purchasesFromLooks,
  ] = await Promise.all([
    day ? q.signalsOnDay(db, day) : Promise.resolve([]),
    q.loadHeadline(db, from, now),
    q.loadTopLineages(db, 9),
    q.loadClusterSummaries(db),
    q.loadManufacturing(db),
    q.loadLatestEvaluation(db),
    q.loadClusterMap(db),
    q.loadLooksLite(db),
    q.loadParticipants(db),
    q.loadPurchasesFromLooks(db),
  ])

  const byDimension = new Map<TrendSeries['dimension'], TrendSeries[]>()
  const all: TrendSeries[] = []
  for (const row of signalRows) {
    const s = toSeries(row)
    all.push(s)
    const list = byDimension.get(row.dimension)
    if (list) list.push(s)
    else byDimension.set(row.dimension, [s])
  }

  const influencerRows = computeInfluencers(
    {
      looks: looksLite,
      participants,
      interactions: [],
      purchases: purchasesFromLooks,
      clusterOf: clusterMap,
    },
    10,
  )
  const summaries = await q.loadUserSummaries(
    db,
    influencerRows.map((r) => r.userId),
  )
  const influencers: Influencer[] = influencerRows.flatMap((r) => {
    const user = summaries.get(r.userId)
    if (!user) return []
    return [
      {
        user,
        influence: round(r.influence),
        remixesCaused: r.remixesCaused,
        downstreamPurchases: r.downstreamPurchases,
        downstreamGmv: r.downstreamGmv,
        clustersReached: r.clustersReached,
      },
    ]
  })

  const lineagesWithChildren = topLineages.filter((l) => l.stats.nodes > 1)
  return {
    generatedAt: now,
    window: { from, to: now, days },
    headline: {
      looks: headline.looks,
      remixes: headline.remixes,
      asks: headline.asks,
      togethers: headline.togethers,
      shares: headline.shares,
      purchases: headline.purchases,
      purchasesFromLooks: headline.purchasesFromLooks,
      gmvFromLooks: headline.gmvFromLooks,
      activePeople: headline.activePeople,
      crossClusterShare:
        headline.clusteredRemixes > 0
          ? round(headline.crossClusterRemixes / headline.clusteredRemixes)
          : 0,
      avgLineageDepth: round(headline.avgLineageDepth, 2),
    },
    aesthetics: sortByMomentum(byDimension.get('aesthetic')),
    categories: sortByMomentum(byDimension.get('category')),
    colors: sortByMomentum(byDimension.get('color')),
    silhouettes: sortByMomentum(byDimension.get('silhouette')),
    aestheticCategory: sortByMomentum(byDimension.get('aesthetic_category')),
    emerging: sortByMomentum(all.filter((s) => s.emerging)),
    topLineages: (lineagesWithChildren.length > 0 ? lineagesWithChildren : topLineages).slice(0, 6),
    influencers,
    clusters: clusterSummaries.map((c) => {
      const { label, topAesthetics } = clusterLabel(c.centroid)
      return { id: c.id, size: c.size, topAesthetics, label }
    }),
    manufacturing,
    evaluation,
  }
}

// ---------------------------------------------------------------------------
// getLineage
// ---------------------------------------------------------------------------

function lite(look: Look): LookLite {
  return {
    id: look.id,
    ownerId: look.ownerId,
    kind: look.kind,
    parentLookId: look.parentLookId,
    aesthetics: look.aesthetics,
    createdAt: look.createdAt,
  }
}

export async function getLineage(db: Database, lookId: string): Promise<LineageTree> {
  const look = await q.loadLook(db, lookId)
  if (!look) throw new Error(`@lookline/engine: look ${lookId} not found`)

  // Walk up to the root.
  const chain: Look[] = [look]
  const seenUp = new Set<string>([look.id])
  let cursor: Look = look
  for (let i = 0; i < 64; i++) {
    const parentId = await q.loadParentId(db, cursor)
    if (!parentId || seenUp.has(parentId)) break
    const parent = await q.loadLook(db, parentId)
    if (!parent) break
    seenUp.add(parent.id)
    chain.push(parent)
    cursor = parent
  }
  const root = chain[chain.length - 1]!
  const path = chain.toReversed()

  // Walk down from the root, level by level, capped at LINEAGE_MAX_NODES.
  const treeLooks = new Map<string, Look>([[root.id, root]])
  let frontier = [root.id]
  while (frontier.length > 0 && treeLooks.size < LINEAGE_MAX_NODES) {
    const children = await q.loadChildren(db, frontier)
    const next: string[] = []
    for (const child of children) {
      if (treeLooks.has(child.id) || treeLooks.size >= LINEAGE_MAX_NODES) continue
      treeLooks.set(child.id, child)
      next.push(child.id)
    }
    frontier = next
  }
  const ids = [...treeLooks.keys()]
  const [participants, treeInteractions, treePurchases, productsByLook, stored] = await Promise.all(
    [
      q.loadParticipantsFor(db, ids),
      q.loadInteractionsForLooks(db, ids),
      q.loadPurchasesForLooks(db, ids),
      q.loadLookProductRows(db, ids),
      q.loadLineageStat(db, root.id),
    ],
  )
  const ownerIds = [...new Set([...treeLooks.values()].map((l) => l.ownerId))]
  const owners = await q.loadUserSummaries(db, ownerIds)
  const clusterOf = new Map<string, number | null>()
  for (const [id, u] of owners) clusterOf.set(id, u.tasteCluster)

  const looksLite = [...treeLooks.values()].map(lite)
  const forest = buildForest(looksLite, participants)
  const walk = collectTree(forest, root.id, LINEAGE_MAX_NODES)
  const stats: LineageStat =
    stored ??
    toLineageStat(
      statsForTree(forest, walk, root.id, indexForTree(treeInteractions, treePurchases), clusterOf),
      root.createdAt,
    )

  const reactions = new Map<string, number>()
  for (const ix of treeInteractions) {
    if (ix.type === 'REACT' && ix.lookId)
      reactions.set(ix.lookId, (reactions.get(ix.lookId) ?? 0) + 1)
  }
  const purchaseAgg = new Map<string, { count: number; gmv: number }>()
  for (const p of treePurchases) {
    if (!p.sourceLookId) continue
    const agg = purchaseAgg.get(p.sourceLookId) ?? { count: 0, gmv: 0 }
    agg.count += 1
    agg.gmv += p.price * p.quantity
    purchaseAgg.set(p.sourceLookId, agg)
  }

  const inTree = new Set(walk.order)
  const build = (id: string, visited: Set<string>): LineageNode => {
    visited.add(id)
    const l = treeLooks.get(id)!
    const owner = owners.get(l.ownerId) ?? {
      id: l.ownerId,
      handle: l.ownerId,
      displayName: l.ownerId,
      avatarSeed: 0,
      tasteCluster: null,
      socialCluster: null,
    }
    const agg = purchaseAgg.get(id)
    const children = (forest.children.get(id) ?? [])
      .filter((c) => inTree.has(c) && !visited.has(c))
      .map((c) => build(c, visited))
    return {
      look: l,
      owner,
      articles: productsByLook.get(id) ?? [],
      children,
      purchases: agg?.count ?? 0,
      gmv: agg?.gmv ?? 0,
      reactions: reactions.get(id) ?? 0,
    }
  }
  return { root: build(root.id, new Set()), stats, path }
}

function indexForTree(ixs: InteractionLite[], pus: PurchaseLite[]) {
  const interactionsByLook = new Map<string, InteractionLite[]>()
  for (const ix of ixs) {
    if (!ix.lookId) continue
    const list = interactionsByLook.get(ix.lookId)
    if (list) list.push(ix)
    else interactionsByLook.set(ix.lookId, [ix])
  }
  const purchasesByLook = new Map<string, PurchaseLite[]>()
  for (const p of pus) {
    if (!p.sourceLookId) continue
    const list = purchasesByLook.get(p.sourceLookId)
    if (list) list.push(p)
    else purchasesByLook.set(p.sourceLookId, [p])
  }
  return { interactionsByLook, purchasesByLook }
}

function toLineageStat(row: LineageStatRow, computedAt: Date): LineageStat {
  return { ...row, computedAt }
}

// ---------------------------------------------------------------------------
// getUserNetwork
// ---------------------------------------------------------------------------

export async function getUserNetwork(db: Database, userId: string): Promise<UserNetwork> {
  const user = await q.loadUserSummary(db, userId)
  if (!user) throw new Error(`@lookline/engine: user ${userId} not found`)
  const edges = await q.loadEdges(db, userId)
  const otherIds = [...new Set(edges.map((e) => (e.aUserId === userId ? e.bUserId : e.aUserId)))]
  const others = await q.loadUserSummaries(db, otherIds)
  const byKind = Object.fromEntries(RELATIONSHIP_KIND_VALUES.map((k) => [k, 0])) as Record<
    RelationshipKind,
    number
  >
  const out: UserNetwork['edges'] = []
  for (const relationship of edges) {
    const direction = relationship.aUserId === userId ? 'out' : 'in'
    const other = others.get(direction === 'out' ? relationship.bUserId : relationship.aUserId)
    if (!other) continue
    byKind[relationship.kind] += 1
    out.push({ relationship, other, direction })
  }
  return { user, edges: out, byKind }
}
