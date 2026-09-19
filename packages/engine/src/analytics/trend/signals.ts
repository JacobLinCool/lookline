/**
 * Daily trend signals (ENGINE_SPEC §5.4). Pure: `buildTrendEvents` turns raw rows into weighted
 * events carrying the keys they touch; `computeTrendSignals` folds those into one row per
 * (day, dimension, key) with momentum 0–100, the five-condition `emerging` flag and evidence.
 */
import { DESIGN_DETAIL_SLUGS } from '@lookline/catalog'
import type { InteractionType, TrendDimension } from '@lookline/db'
import {
  addDays,
  clamp,
  clamp01,
  compareStrings,
  dayDiff,
  dayKey,
  median,
  percentile,
  round,
} from '../shared'
import type {
  IntentSessionLite,
  InteractionLite,
  LookLite,
  LookProductLite,
  ProductLite,
  PurchaseLite,
} from '../shared'
import type { LineageStatRow } from './lineage'

export const EVENT_WEIGHTS: Readonly<Record<InteractionType, number>> = {
  VIEW: 1,
  SEARCH: 2,
  SAVE: 3,
  DISMISS: -1,
  SHARE: 4,
  REACT: 2,
  ASK: 2,
  ADVISE: 2,
  STYLE: 2,
  REMIX: 6,
  TOGETHER: 5,
  INSPIRE: 6,
  LOOK_CREATE: 5,
  PURCHASE: 10,
  BUY_FOR: 10,
}

export const TREND_DIMENSIONS: readonly TrendDimension[] = [
  'aesthetic',
  'category',
  'color',
  'silhouette',
  'detail',
  'motif',
  'aesthetic_category',
]

/** Composite id of a (dimension, key) pair used as a map key. */
export function trendKey(dimension: TrendDimension, key: string): string {
  return `${dimension}::${key}`
}

export function splitTrendKey(composite: string): { dimension: TrendDimension; key: string } {
  const i = composite.indexOf('::')
  return { dimension: composite.slice(0, i) as TrendDimension, key: composite.slice(i + 2) }
}

/**
 * The dimensions a purchase or a remix moves.
 *
 * `aesthetic` is the article's own tags where the vision pass reached it, and the product type
 * otherwise — H&M's own, 131 values deep, which was the finest signal available while no article
 * carried a tag.
 *
 * `detail` is the point of the whole exercise for the manufacturing side. A factory does not cut
 * "quiet luxury"; it cuts a mock neck, a dropped shoulder and a cable knit in oatmeal. Necklines,
 * sleeves, closures and design details are tech-pack fields, so a consumer's sentence and a
 * production brief end up in one vocabulary.
 */
export function productKeys(p: ProductLite): string[] {
  const keys = new Set<string>()
  keys.add(trendKey('category', p.categoryGroup))
  keys.add(trendKey('color', p.colorFamily))
  keys.add(trendKey('silhouette', p.subcategory))
  const aesthetics = p.aesthetics.length > 0 ? p.aesthetics : [p.subcategory]
  for (const a of aesthetics) {
    keys.add(trendKey('aesthetic', a))
    keys.add(trendKey('aesthetic_category', `${a}|${p.categoryGroup}`))
  }
  for (const slug of DESIGN_DETAIL_SLUGS) {
    if (p.attributes[slug] === true) keys.add(trendKey('detail', slug))
  }
  // A motif turns over in weeks — a licence, a meme, a subject of the season — where a neckline
  // turns over in years. It is the one dimension here fast enough to catch a trend while it is
  // still one.
  if (p.printMotif) keys.add(trendKey('motif', p.printMotif))
  return [...keys]
}

/** Keys a Look carries: the union of its articles' keys plus its own aesthetics. */
export function lookKeys(
  look: Pick<LookLite, 'aesthetics'> | undefined,
  articles: readonly ProductLite[],
): string[] {
  const keys = new Set<string>()
  for (const p of articles) for (const k of productKeys(p)) keys.add(k)
  for (const a of look?.aesthetics ?? []) keys.add(trendKey('aesthetic', a))
  return [...keys]
}

export function intentKeys(s: IntentSessionLite): string[] {
  const keys = new Set<string>()
  for (const a of s.aesthetics) {
    keys.add(trendKey('aesthetic', a))
    for (const g of s.categoryGroups) keys.add(trendKey('aesthetic_category', `${a}|${g}`))
  }
  for (const g of s.categoryGroups) keys.add(trendKey('category', g))
  for (const c of s.colorFamilies) keys.add(trendKey('color', c))
  return [...keys]
}

export interface TrendEvent {
  day: string
  type: InteractionType
  weight: number
  keys: readonly string[]
  cluster: number | null
  /** Products the event touches (one for product events, the Look's articles for Look events). */
  articleIds: readonly string[]
  lookId: string | null
  rootLookId: string | null
  /** price × quantity for purchases, else 0. */
  gmv: number
}

export interface TrendEventInput {
  interactions: readonly InteractionLite[]
  purchases: readonly PurchaseLite[]
  looks: readonly LookLite[]
  lookArticles: readonly LookProductLite[]
  intents: readonly IntentSessionLite[]
  articles: ReadonlyMap<string, ProductLite>
  clusterOf: ReadonlyMap<string, number | null>
  /** look id → root look id. */
  rootOf: ReadonlyMap<string, string>
}

/** Interaction types whose events come from another table (purchases, intent_sessions). */
const DERIVED_ELSEWHERE = new Set<InteractionType>(['PURCHASE', 'BUY_FOR', 'SEARCH'])

export function buildTrendEvents(input: TrendEventInput): TrendEvent[] {
  const productsByLook = new Map<string, string[]>()
  for (const lp of input.lookArticles) {
    const list = productsByLook.get(lp.lookId)
    if (list) list.push(lp.articleId)
    else productsByLook.set(lp.lookId, [lp.articleId])
  }
  const lookById = new Map(input.looks.map((l) => [l.id, l]))
  const lookKeyCache = new Map<string, string[]>()
  const keysOfLook = (lookId: string): string[] => {
    const cached = lookKeyCache.get(lookId)
    if (cached) return cached
    const articles: ProductLite[] = []
    for (const pid of productsByLook.get(lookId) ?? []) {
      const p = input.articles.get(pid)
      if (p) articles.push(p)
    }
    const out = lookKeys(lookById.get(lookId), articles)
    lookKeyCache.set(lookId, out)
    return out
  }
  const cluster = (userId: string | null): number | null =>
    userId ? (input.clusterOf.get(userId) ?? null) : null

  const events: TrendEvent[] = []
  for (const ix of input.interactions) {
    if (DERIVED_ELSEWHERE.has(ix.type)) continue
    const weight = EVENT_WEIGHTS[ix.type]
    if (!weight) continue
    let keys: string[] = []
    let articleIds: string[] = []
    if (ix.articleId != null) {
      const p = input.articles.get(ix.articleId)
      if (p) {
        keys = productKeys(p)
        articleIds = [p.id]
      }
    } else if (ix.lookId) {
      keys = keysOfLook(ix.lookId)
      articleIds = productsByLook.get(ix.lookId) ?? []
    }
    if (keys.length === 0) continue
    events.push({
      day: dayKey(ix.createdAt),
      type: ix.type,
      weight,
      keys,
      cluster: cluster(ix.actorUserId),
      articleIds,
      lookId: ix.lookId,
      rootLookId: ix.lookId ? (input.rootOf.get(ix.lookId) ?? null) : null,
      gmv: 0,
    })
  }
  for (const p of input.purchases) {
    const product = input.articles.get(p.articleId)
    if (!product) continue
    const keys = productKeys(product)
    const base = {
      day: dayKey(p.createdAt),
      keys,
      cluster: cluster(p.userId),
      articleIds: [product.id],
      lookId: p.sourceLookId,
      rootLookId: p.sourceLookId ? (input.rootOf.get(p.sourceLookId) ?? null) : null,
    }
    events.push({
      ...base,
      type: 'PURCHASE',
      weight: EVENT_WEIGHTS.PURCHASE,
      gmv: p.price * p.quantity,
    })
    if (p.forKind === 'other') {
      events.push({ ...base, type: 'BUY_FOR', weight: EVENT_WEIGHTS.BUY_FOR, gmv: 0 })
    }
  }
  for (const s of input.intents) {
    const keys = intentKeys(s)
    if (keys.length === 0) continue
    events.push({
      day: dayKey(s.createdAt),
      type: 'SEARCH',
      weight: EVENT_WEIGHTS.SEARCH,
      keys,
      cluster: cluster(s.userId),
      articleIds: [],
      lookId: null,
      rootLookId: null,
      gmv: 0,
    })
  }
  return events
}

export interface TrendSignalRow {
  day: string
  dimension: TrendDimension
  key: string
  volume: number
  velocity: number
  crossCluster: number
  conversion: number
  gmv: number
  momentum: number
  emerging: boolean
  evidence: TrendEvidence
}

export type TrendStatus = 'dormant' | 'emerging' | 'rising' | 'fading' | 'stable'

export interface TrendEvidence {
  status: TrendStatus
  volume7d: number
  volumePrev7d: number
  spreadClusters: number
  byCluster: Record<string, number>
  daily: number[]
  /** Day keys matching `daily` (oldest first). */
  days: string[]
  topProducts: string[]
  topRootLooks: string[]
  searches7d: number
  purchases7d: number
  remixes7d: number
  lineageReach: number
  [key: string]: unknown
}

export interface TrendSignalOptions {
  /** Last day (inclusive) to emit rows for. */
  endDay: string
  /** Number of days to emit (ending at `endDay`). */
  days: number
  /** Number of taste clusters `k` (min 1). */
  clusterCount: number
  lineages?: readonly LineageStatRow[]
  /** root look id → composite keys the root carries. */
  rootKeys?: ReadonlyMap<string, readonly string[]>
}

export interface MomentumParts {
  velocity: number
  crossCluster: number
  conversion: number
  lineageReach: number
  volNorm: number
}

export function momentumOf(p: MomentumParts): number {
  const v = (clamp(p.velocity, -1, 3) + 1) / 4
  return (
    100 *
    clamp01(
      0.3 * v +
        0.25 * p.crossCluster +
        0.2 * Math.min(1, p.conversion / 0.5) +
        0.15 * p.lineageReach +
        0.1 * p.volNorm,
    )
  )
}

export interface EmergingParts {
  volume7d: number
  dimensionMedian: number
  velocity: number
  spreadClusters: number
  /** Daily volumes of the last 4 days (oldest first). */
  last4: readonly number[]
}

/** The five conditions of §5.4, all required. */
export function isEmerging(p: EmergingParts): boolean {
  let rises = 0
  for (let i = 1; i < p.last4.length; i++) if ((p.last4[i] ?? 0) > (p.last4[i - 1] ?? 0)) rises++
  return (
    p.volume7d < p.dimensionMedian &&
    p.velocity >= 0.5 &&
    p.spreadClusters >= 2 &&
    p.volume7d >= 20 &&
    rises >= 2
  )
}

export function statusOf(volume7d: number, velocity: number, emerging: boolean): TrendStatus {
  if (volume7d < 5) return 'dormant'
  if (emerging) return 'emerging'
  if (velocity >= 0.25) return 'rising'
  if (velocity <= -0.3) return 'fading'
  return 'stable'
}

/** Shannon-entropy cross-cluster spread: `(c/k)·(H/ln c)`; `1/k` when c ≤ 1. */
export function crossClusterSpread(
  byCluster: ReadonlyMap<number, number>,
  k: number,
): {
  spread: number
  c: number
} {
  const kk = Math.max(1, k)
  const shares: number[] = []
  let total = 0
  for (const v of byCluster.values()) {
    if (v >= 2) {
      shares.push(v)
      total += v
    }
  }
  const c = shares.length
  if (c <= 1 || total <= 0) return { spread: 1 / kk, c }
  let h = 0
  for (const v of shares) {
    const s = v / total
    h -= s * Math.log(s)
  }
  return { spread: (c / kk) * (h / Math.log(c)), c }
}

interface KeyState {
  volume: Float64Array
  saves: Int32Array
  remixes: Int32Array
  asks: Int32Array
  purchases: Int32Array
  searches: Int32Array
  gmv: Float64Array
  byCluster: Map<number, Float64Array>
  articles: Map<string, number>
  roots: Set<string>
}

const sum = (arr: ArrayLike<number>, from: number, to: number): number => {
  let s = 0
  for (let i = Math.max(0, from); i <= to; i++) s += arr[i] ?? 0
  return s
}

export function computeTrendSignals(
  events: readonly TrendEvent[],
  opts: TrendSignalOptions,
): TrendSignalRow[] {
  const days = Math.max(1, Math.floor(opts.days))
  const D = days + 13
  const firstDay = addDays(opts.endDay, -(D - 1))
  const idxOf = (day: string): number => dayDiff(firstDay, day)
  const lastIdx = D - 1
  const k = Math.max(1, opts.clusterCount)

  const state = new Map<string, KeyState>()
  const stateFor = (key: string): KeyState => {
    let s = state.get(key)
    if (!s) {
      s = {
        volume: new Float64Array(D),
        saves: new Int32Array(D),
        remixes: new Int32Array(D),
        asks: new Int32Array(D),
        purchases: new Int32Array(D),
        searches: new Int32Array(D),
        gmv: new Float64Array(D),
        byCluster: new Map(),
        articles: new Map(),
        roots: new Set(),
      }
      state.set(key, s)
    }
    return s
  }

  for (const e of events) {
    const i = idxOf(e.day)
    if (i < 0 || i > lastIdx) continue
    const recent7 = i > lastIdx - 7
    const recent14 = i > lastIdx - 14
    for (const key of e.keys) {
      const s = stateFor(key)
      s.volume[i] = (s.volume[i] ?? 0) + e.weight
      if (e.cluster !== null) {
        let arr = s.byCluster.get(e.cluster)
        if (!arr) {
          arr = new Float64Array(D)
          s.byCluster.set(e.cluster, arr)
        }
        arr[i] = (arr[i] ?? 0) + e.weight
      }
      if (e.type === 'SAVE') s.saves[i] = (s.saves[i] ?? 0) + 1
      else if (e.type === 'REMIX') s.remixes[i] = (s.remixes[i] ?? 0) + 1
      else if (e.type === 'ASK') s.asks[i] = (s.asks[i] ?? 0) + 1
      else if (e.type === 'SEARCH') s.searches[i] = (s.searches[i] ?? 0) + 1
      else if (e.type === 'PURCHASE') {
        s.purchases[i] = (s.purchases[i] ?? 0) + 1
        s.gmv[i] = (s.gmv[i] ?? 0) + e.gmv
      }
      if (recent7 && e.weight > 0) {
        for (const pid of e.articleIds) s.articles.set(pid, (s.articles.get(pid) ?? 0) + e.weight)
      }
      if (recent14 && e.rootLookId) s.roots.add(e.rootLookId)
    }
  }

  // Lineage reach: roots carrying a key, by creation day index.
  const lineageByRoot = new Map((opts.lineages ?? []).map((l) => [l.rootLookId, l]))
  const rootsByKey = new Map<string, Array<{ idx: number; people: number; id: string }>>()
  if (opts.rootKeys) {
    for (const [rootId, keys] of opts.rootKeys) {
      const stat = lineageByRoot.get(rootId)
      if (!stat) continue
      const idx = idxOf(dayKey(stat.firstAt))
      if (idx > lastIdx) continue
      for (const key of keys) {
        const list = rootsByKey.get(key)
        const entry = { idx, people: stat.uniquePeople, id: rootId }
        if (list) list.push(entry)
        else rootsByKey.set(key, [entry])
      }
    }
    for (const list of rootsByKey.values())
      list.sort((a, b) => b.people - a.people || compareStrings(a.id, b.id))
  }

  const keys = [...state.keys()].toSorted(compareStrings)
  const rows: TrendSignalRow[] = []
  for (let i = 13; i <= lastIdx; i++) {
    const day = addDays(firstDay, i)
    // per-dimension volume_7d distribution for V95 and the median
    const perDimension = new Map<TrendDimension, number[]>()
    const volume7dOf = new Map<string, number>()
    for (const key of keys) {
      const s = state.get(key)!
      const v7 = sum(s.volume, i - 6, i)
      volume7dOf.set(key, v7)
      if (v7 > 0) {
        const { dimension } = splitTrendKey(key)
        const list = perDimension.get(dimension)
        if (list) list.push(v7)
        else perDimension.set(dimension, [v7])
      }
    }
    const v95 = new Map<TrendDimension, number>()
    const med = new Map<TrendDimension, number>()
    for (const [dimension, list] of perDimension) {
      v95.set(dimension, percentile(list, 0.95))
      med.set(dimension, median(list))
    }
    for (const key of keys) {
      const s = state.get(key)!
      const volume7d = volume7dOf.get(key) ?? 0
      const volumePrev7d = sum(s.volume, i - 13, i - 7)
      if (volume7d <= 0 && volumePrev7d <= 0) continue
      const { dimension, key: rawKey } = splitTrendKey(key)
      const velocity = (volume7d - volumePrev7d) / (volumePrev7d + 10)
      const byCluster = new Map<number, number>()
      for (const [c, arr] of s.byCluster) {
        const v = sum(arr, i - 6, i)
        if (v > 0) byCluster.set(c, v)
      }
      const { spread, c } = crossClusterSpread(byCluster, k)
      const purchases7d = sum(s.purchases, i - 6, i)
      const saves7d = sum(s.saves, i - 6, i)
      const remixes7d = sum(s.remixes, i - 6, i)
      const asks7d = sum(s.asks, i - 6, i)
      const searches7d = sum(s.searches, i - 6, i)
      const conversion = purchases7d / (saves7d + remixes7d + asks7d + 5)
      const gmv = Math.round(sum(s.gmv, i - 6, i))
      const roots = (rootsByKey.get(key) ?? []).filter((r) => r.idx >= i - 13 && r.idx <= i)
      let people = 0
      for (const r of roots) people += r.people
      const lineageReach = 1 - Math.exp(-people / 50)
      const top = v95.get(dimension) ?? 0
      // Dismissals carry a negative weight, so clamp before the log (log1p(x < -1) is NaN).
      const volNorm = top > 0 ? Math.min(1, Math.log1p(Math.max(0, volume7d)) / Math.log1p(top)) : 0
      const momentum = momentumOf({
        velocity,
        crossCluster: spread,
        conversion,
        lineageReach,
        volNorm,
      })
      const daily = Array.from({ length: 14 }, (_, j) => round(s.volume[i - 13 + j] ?? 0, 2))
      const emerging = isEmerging({
        volume7d,
        dimensionMedian: med.get(dimension) ?? 0,
        velocity,
        spreadClusters: c,
        last4: daily.slice(-4),
      })
      const status = statusOf(volume7d, velocity, emerging)
      const topProducts =
        i === lastIdx
          ? [...s.articles.entries()]
              .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .slice(0, 5)
              .map(([id]) => id)
          : []
      const evidence: TrendEvidence = {
        status,
        volume7d: round(volume7d, 2),
        volumePrev7d: round(volumePrev7d, 2),
        spreadClusters: c,
        byCluster: Object.fromEntries(
          [...byCluster.entries()]
            .toSorted((a, b) => a[0] - b[0])
            .map(([id, v]) => [String(id), round(v, 2)]),
        ),
        daily,
        days: Array.from({ length: 14 }, (_, j) => addDays(day, j - 13)),
        topProducts,
        topRootLooks: roots.slice(0, 3).map((r) => r.id),
        searches7d,
        purchases7d,
        remixes7d,
        lineageReach: round(lineageReach),
      }
      rows.push({
        day,
        dimension,
        key: rawKey,
        volume: Math.round(s.volume[i] ?? 0),
        velocity: round(velocity),
        crossCluster: round(spread),
        conversion: round(conversion),
        gmv,
        momentum: round(momentum, 2),
        emerging,
        evidence,
      })
    }
  }
  return rows
}
