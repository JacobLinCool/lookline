/**
 * Manufacturing recommendations (ENGINE_SPEC §5.5): aesthetic × category group × colour family
 * cells where demand is rising faster than supply. Pure; the caller supplies the latest-day trend
 * rows, the 14-day events, intent sessions and the catalog supply counts.
 */
import { aestheticName, categoryGroupName, colorFamilyName } from '../constants'
import { clamp01, compareStrings, dayDiff, round } from '../shared'
import type { IntentSessionLite, ProductLite } from '../shared'
import { trendKey, type TrendEvent, type TrendSignalRow } from './signals'

export type ManufacturingSignal = 'develop' | 'stock' | 'watch'

export const SIGNAL_LABEL: Readonly<Record<ManufacturingSignal, { en: string; zh: string }>> = {
  develop: { en: 'Develop', zh: '開款' },
  stock: { en: 'Stock', zh: '備料' },
  watch: { en: 'Watch', zh: '觀察' },
}

export interface SupplyCell {
  supply: number
  lowStock: number
}

export function supplyKey(aesthetic: string, group: string, color: string | null): string {
  return `${aesthetic}|${group}|${color ?? ''}`
}

export interface ManufacturingInput {
  events: readonly TrendEvent[]
  articles: ReadonlyMap<string, ProductLite>
  /** Intent sessions of the last 14 days. */
  intents: readonly IntentSessionLite[]
  /** Intent session ids that led to a purchase. */
  sessionsWithPurchase: ReadonlySet<string>
  /** Latest-day trend rows by composite key (`trendKey(dimension, key)`). */
  signals: ReadonlyMap<string, TrendSignalRow>
  /** In-stock product counts per `supplyKey` (colour '' = pair level). */
  supply: ReadonlyMap<string, SupplyCell>
  clusterLabels?: ReadonlyMap<number, string>
  endDay: string
}

export interface ManufacturingRow {
  id: string
  rank: number
  aesthetic: string
  categoryGroup: string
  subcategory: string | null
  colorFamily: string | null
  momentum: number
  confidence: number
  projectedDemand: number
  rationale: string
  evidence: Record<string, unknown>
  /** Kept for ordering tests; not stored. */
  score: number
  signal: ManufacturingSignal
}

export interface ManufacturingOptions {
  limit?: number
  perAesthetic?: number
  minDemand?: number
}

/** Required slots of the casual outfit template (§3.1) used for outfit-mode intents. */
const OUTFIT_REQUIRED_GROUPS = new Set(['tops', 'bottoms', 'footwear'])
const SUBCATEGORY_EVENT_TYPES = new Set(['LOOK_CREATE', 'REMIX', 'TOGETHER', 'PURCHASE'])

export function supplyGapOf(demandIntents14d: number, supply: number): number {
  return 1 - Math.exp(-demandIntents14d / (supply + 1))
}

export function manufacturingScore(p: {
  momentum: number
  supplyGap: number
  conversion: number
  crossCluster: number
}): number {
  return (
    0.35 * (p.momentum / 100) +
    0.25 * p.supplyGap +
    0.2 * Math.min(1, p.conversion / 0.5) +
    0.2 * p.crossCluster
  )
}

export function manufacturingConfidence(p: {
  demand14d: number
  crossCluster: number
  daysConsistent: number
}): number {
  return (
    Math.min(1, Math.log1p(p.demand14d) / Math.log1p(200)) *
    (0.5 + 0.5 * p.crossCluster) *
    Math.min(1, p.daysConsistent / 7)
  )
}

export function manufacturingSignal(p: {
  score: number
  supply: number
  searchGap: number
  lowStockShare: number
  emerging: boolean
  confidence: number
}): ManufacturingSignal | null {
  if (p.score >= 0.6 && (p.supply < 20 || p.searchGap >= 0.4)) return 'develop'
  if (p.score >= 0.5 && p.supply >= 20 && p.lowStockShare >= 0.3) return 'stock'
  if ((p.score >= 0.4 && p.score < 0.6) || (p.emerging && p.confidence >= 0.3)) return 'watch'
  return null
}

export function projectedDemandOf(demandIntents14d: number, velocity: number): number {
  return Math.round(demandIntents14d * (1 + Math.max(0, velocity)) * 2)
}

interface Cell {
  aesthetic: string
  group: string
  color: string | null
  demand14d: number
  days7: Set<string>
  remixes14d: number
  purchases14d: number
  articles: Map<string, number>
  roots: Set<string>
  subcategories: Map<string, number>
}

function intentMatches(s: IntentSessionLite, cell: Cell): boolean {
  if (!s.aesthetics.includes(cell.aesthetic)) return false
  const groupOk =
    s.categoryGroups.includes(cell.group) ||
    (s.mode === 'outfit' && s.categoryGroups.length === 0 && OUTFIT_REQUIRED_GROUPS.has(cell.group))
  if (!groupOk) return false
  return cell.color === null || s.colorFamilies.length === 0 || s.colorFamilies.includes(cell.color)
}

const pct = (x: number): string => `${Math.round(x * 100)}%`

export function buildRationale(p: {
  signal: ManufacturingSignal
  aesthetic: string
  group: string
  color: string | null
  demandIntents14d: number
  remixes: number
  purchases: number
  clusters: number
  conversion: number
  supply: number
  lowStockShare: number
}): { en: string; zh: string } {
  const label = SIGNAL_LABEL[p.signal]
  const cell = `${aestheticName(p.aesthetic)} × ${categoryGroupName(p.group)}${
    p.color ? ` · ${colorFamilyName(p.color)}` : ''
  }`
  const low = p.supply > 0 ? ` (${pct(p.lowStockShare)} low stock)` : ''
  const en = `${label.en} (${label.zh}): ${cell}. Last 14 days: ${p.demandIntents14d} searches, ${p.remixes} remixes, ${p.purchases} purchases across ${p.clusters} taste clusters, ${pct(p.conversion)} conversion; ${p.supply} articles in stock${low}.`
  const lowZh = p.supply > 0 ? `，其中 ${pct(p.lowStockShare)} 低庫存` : ''
  const zh = `建議${label.zh}：${cell}。近 14 天 ${p.demandIntents14d} 次搜尋、${p.remixes} 次 remix、${p.purchases} 筆購買，跨 ${p.clusters} 個品味圈，轉換率 ${pct(p.conversion)}；現有庫存 ${p.supply} 款${lowZh}。`
  return { en, zh }
}

export function recommendManufacturing(
  input: ManufacturingInput,
  opts: ManufacturingOptions = {},
): ManufacturingRow[] {
  const limit = opts.limit ?? 12
  const perAesthetic = opts.perAesthetic ?? 3
  const minDemand = opts.minDemand ?? 10

  const cells = new Map<string, Cell>()
  const cellFor = (aesthetic: string, group: string, color: string | null): Cell => {
    const key = supplyKey(aesthetic, group, color)
    let c = cells.get(key)
    if (!c) {
      c = {
        aesthetic,
        group,
        color,
        demand14d: 0,
        days7: new Set(),
        remixes14d: 0,
        purchases14d: 0,
        articles: new Map(),
        roots: new Set(),
        subcategories: new Map(),
      }
      cells.set(key, c)
    }
    return c
  }

  for (const e of input.events) {
    const age = dayDiff(e.day, input.endDay)
    if (age < 0 || age > 13) continue
    const seen = new Set<Cell>()
    for (const pid of e.articleIds) {
      const p = input.articles.get(pid)
      if (!p) continue
      // Was one cell per aesthetic; the product type stands in for it now.
      for (const a of [p.subcategory]) {
        for (const color of [p.colorFamily, null]) {
          const cell = cellFor(a, p.categoryGroup, color)
          if (seen.has(cell)) continue
          seen.add(cell)
          cell.demand14d += e.weight
          if (age <= 6 && e.weight > 0) cell.days7.add(e.day)
          if (e.type === 'REMIX') cell.remixes14d++
          if (e.type === 'PURCHASE') cell.purchases14d++
          if (e.weight > 0) cell.articles.set(pid, (cell.articles.get(pid) ?? 0) + e.weight)
          if (e.rootLookId) cell.roots.add(e.rootLookId)
          if (age <= 6 && SUBCATEGORY_EVENT_TYPES.has(e.type)) {
            cell.subcategories.set(p.subcategory, (cell.subcategories.get(p.subcategory) ?? 0) + 1)
          }
        }
      }
    }
  }

  const intents = input.intents.toSorted(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || compareStrings(a.id, b.id),
  )
  const candidates: ManufacturingRow[] = []
  for (const cell of cells.values()) {
    if (cell.demand14d < minDemand) continue
    const matching = intents.filter((s) => intentMatches(s, cell))
    const demandIntents14d = matching.length
    const withoutPurchase = matching.filter((s) => !input.sessionsWithPurchase.has(s.id)).length
    const searchGap = demandIntents14d > 0 ? withoutPurchase / demandIntents14d : 0

    const pairRow = input.signals.get(
      trendKey('aesthetic_category', `${cell.aesthetic}|${cell.group}`),
    )
    const colorRow = cell.color ? input.signals.get(trendKey('color', cell.color)) : undefined
    const pairMomentum = pairRow?.momentum ?? 0
    const momentum = cell.color
      ? pairMomentum * (0.5 + 0.5 * ((colorRow?.momentum ?? 0) / 100))
      : pairMomentum
    const conversion = pairRow?.conversion ?? 0
    const crossCluster = pairRow?.crossCluster ?? 0
    const velocity = pairRow?.velocity ?? 0
    const emerging = pairRow?.emerging ?? false
    const clusters =
      typeof pairRow?.evidence.spreadClusters === 'number' ? pairRow.evidence.spreadClusters : 0
    const supplyCell = input.supply.get(supplyKey(cell.aesthetic, cell.group, cell.color)) ?? {
      supply: 0,
      lowStock: 0,
    }
    const supply = supplyCell.supply
    const lowStockShare = supply > 0 ? supplyCell.lowStock / supply : 0
    const supplyGap = supplyGapOf(demandIntents14d, supply)
    const score = manufacturingScore({ momentum, supplyGap, conversion, crossCluster })
    const confidence = manufacturingConfidence({
      demand14d: cell.demand14d,
      crossCluster,
      daysConsistent: cell.days7.size,
    })
    const signal = manufacturingSignal({
      score,
      supply,
      searchGap,
      lowStockShare,
      emerging,
      confidence,
    })
    if (!signal) continue

    const dominantSubcategory =
      [...cell.subcategories.entries()].toSorted(
        (a, b) => b[1] - a[1] || compareStrings(a[0], b[0]),
      )[0]?.[0] ?? null
    const dominantSilhouette = dominantSubcategory
      ? ([...cell.articles.keys()]
          .map((id) => input.articles.get(id))
          .find((p) => p?.subcategory === dominantSubcategory)?.subcategory ?? null)
      : null
    const clusterIds = Object.keys(pairRow?.evidence.byCluster ?? {})
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .toSorted((a, b) => a - b)
    const rationale = buildRationale({
      signal,
      aesthetic: cell.aesthetic,
      group: cell.group,
      color: cell.color,
      demandIntents14d,
      remixes: cell.remixes14d,
      purchases: cell.purchases14d,
      clusters,
      conversion,
      supply,
      lowStockShare,
    })
    candidates.push({
      id: `mr_${cell.aesthetic}_${cell.group}_${cell.color ?? 'any'}`,
      rank: 0,
      aesthetic: cell.aesthetic,
      categoryGroup: cell.group,
      subcategory: dominantSubcategory,
      colorFamily: cell.color,
      momentum: round(momentum, 2),
      confidence: round(clamp01(confidence)),
      projectedDemand: projectedDemandOf(demandIntents14d, velocity),
      rationale: rationale.en,
      score: round(score),
      signal,
      evidence: {
        signal,
        score: round(score),
        demand14d: round(cell.demand14d, 2),
        demandIntents14d,
        supply,
        lowStockShare: round(lowStockShare),
        searchGap: round(searchGap),
        velocity: round(velocity),
        conversion: round(conversion),
        crossCluster: round(crossCluster),
        clusters,
        remixes14d: cell.remixes14d,
        purchases14d: cell.purchases14d,
        daysConsistent: cell.days7.size,
        dominantSilhouette,
        topRootLooks: [...cell.roots].toSorted(compareStrings).slice(0, 3),
        sampleIntents: matching.slice(0, 3).map((s) => s.utterance),
        topProducts: [...cell.articles.entries()]
          .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([id]) => id),
        clusterLabels: clusterIds.map((id) => input.clusterLabels?.get(id) ?? `cluster ${id}`),
        rationaleZh: rationale.zh,
      },
    })
  }

  candidates.sort(
    (a, b) =>
      b.score * b.confidence - a.score * a.confidence ||
      b.momentum - a.momentum ||
      compareStrings(a.id, b.id),
  )
  const perAestheticCount = new Map<string, number>()
  const out: ManufacturingRow[] = []
  for (const c of candidates) {
    if (out.length >= limit) break
    const n = perAestheticCount.get(c.aesthetic) ?? 0
    if (n >= perAesthetic) continue
    perAestheticCount.set(c.aesthetic, n + 1)
    c.rank = out.length + 1
    out.push(c)
  }
  return out
}
