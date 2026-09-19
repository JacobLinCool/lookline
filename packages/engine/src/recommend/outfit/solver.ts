/**
 * Beam search over outfit slots under a total budget (ENGINE_SPEC §3.3) and the diversification
 * of the returned outfits.
 */
import { axisIndex } from '@lookline/catalog'
import type { Season } from '@lookline/catalog'
import type { Article } from '@lookline/db'
import type { RankedItem } from '../../types'
import type { BudgetStrictness } from '../intent-view'
import { compat, isUnscoredPair } from './compat'
import type { SlotRole, SlotSpec } from './templates'

export interface SolverSlot extends SlotSpec {
  /** Ranked candidates, score desc then id asc. */
  candidates: RankedItem[]
}

export interface SolverPlan {
  key: string
  slots: SolverSlot[]
}

export interface PlacedItem {
  item: RankedItem
  slotKey: string
  role: SlotRole
  /** True for a product the caller pinned (completeTheLook). */
  pinned?: boolean
}

export interface OutfitState {
  planKey: string
  items: PlacedItem[]
  cost: number
  itemSum: number
  pairSum: number
  pairs: number
  f: number
  overBudget: boolean
}

export interface SolveOptions {
  budgetMax: number | null
  strictness: BudgetStrictness
  /** Intent price-tier target in [0, 1], used for `util` when there is no budget. */
  priceTierTarget?: number | null
  intentSeason?: Season | null
  beam?: number
  perSlot?: number
  returnK?: number
  /** Items already placed (pinned) before the search starts. */
  pinned?: PlacedItem[]
  /** Optional bonus per item (e.g. coordinate-with a partner Look), added to the item score. */
  itemBonus?: (item: RankedItem) => number
}

const PRICE_TIER = axisIndex('price-tier')

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const sorted = xs.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function pairScore(a: Article, b: Article, season: Season | null | undefined): number | null {
  if (isUnscoredPair(a, b)) return null
  return compat(a, b, season).score
}

interface PlanStats {
  minPrice: Map<string, number>
  medianPrice: Map<string, number>
}

function planStats(plan: SolverPlan): PlanStats {
  const minPrice = new Map<string, number>()
  const medianPrice = new Map<string, number>()
  for (const s of plan.slots) {
    const prices = s.candidates.map((c) => c.product.price)
    minPrice.set(s.key, prices.length > 0 ? Math.min(...prices) : 0)
    medianPrice.set(s.key, median(prices))
  }
  return { minPrice, medianPrice }
}

function objective(
  state: Omit<OutfitState, 'f' | 'overBudget'>,
  remainingRequired: readonly SolverSlot[],
  stats: PlanStats,
  opts: SolveOptions,
): number {
  const n = Math.max(1, state.items.length)
  const itemTerm = state.itemSum / n
  const pairTerm = state.pairSum / Math.max(state.pairs, 1)
  let util: number
  if (opts.budgetMax) {
    let projected = state.cost
    for (const s of remainingRequired) projected += stats.medianPrice.get(s.key) ?? 0
    util = Math.min(1, projected / opts.budgetMax)
  } else {
    const target = opts.priceTierTarget ?? 0.45
    let tier = 0
    for (const it of state.items) tier += it.item.product.styleVector[PRICE_TIER] ?? 0.5
    util = 1 - Math.abs(tier / n - target)
  }
  let sameness = 0
  const brands = new Map<number, number>()
  const families = new Map<string, number>()
  for (const it of state.items) {
    brands.set(it.item.product.brandId, (brands.get(it.item.product.brandId) ?? 0) + 1)
    const fam = it.item.product.colorFamily
    if (!['black', 'white', 'grey', 'neutral', 'brown'].includes(fam))
      families.set(fam, (families.get(fam) ?? 0) + 1)
  }
  if ([...brands.values()].some((c) => c > 1)) sameness += 0.1
  if ([...families.values()].some((c) => c >= 3)) sameness += 0.15
  const budgetPenalty =
    opts.strictness === 'soft' && opts.budgetMax ? Math.max(0, state.cost / opts.budgetMax - 1) : 0
  return 0.6 * itemTerm + 0.35 * pairTerm + 0.05 * util - sameness - budgetPenalty
}

function itemScore(item: RankedItem, opts: SolveOptions): number {
  return item.score + (opts.itemBonus ? opts.itemBonus(item) : 0)
}

function extend(
  state: OutfitState,
  item: RankedItem,
  slot: SolverSlot,
  opts: SolveOptions,
  pinned = false,
): Omit<OutfitState, 'f' | 'overBudget'> {
  let pairSum = state.pairSum
  let pairs = state.pairs
  for (const placed of state.items) {
    const s = pairScore(placed.item.product, item.product, opts.intentSeason)
    if (s === null) continue
    pairSum += s
    pairs += 1
  }
  return {
    planKey: state.planKey,
    items: [...state.items, { item, slotKey: slot.key, role: slot.role, pinned }],
    cost: state.cost + item.product.price,
    itemSum: state.itemSum + itemScore(item, opts),
    pairSum,
    pairs,
  }
}

function budgetCap(opts: SolveOptions): number | null {
  if (!opts.budgetMax) return null
  return opts.budgetMax * (opts.strictness === 'hard' ? 1 : 1.15)
}

function initialState(plan: SolverPlan, opts: SolveOptions): OutfitState {
  let state: OutfitState = {
    planKey: plan.key,
    items: [],
    cost: 0,
    itemSum: 0,
    pairSum: 0,
    pairs: 0,
    f: 0,
    overBudget: false,
  }
  for (const p of opts.pinned ?? []) {
    const slot: SolverSlot = {
      key: p.slotKey,
      role: p.role,
      groups: [],
      subcategories: null,
      required: true,
      core: true,
      candidates: [],
    }
    const ext = extend(state, p.item, slot, opts, true)
    state = { ...ext, f: 0, overBudget: false }
    state.items[state.items.length - 1]!.pinned = true
  }
  return state
}

/** Beam search of one plan; returns terminal states (empty when nothing fits the budget). */
export function solvePlan(plan: SolverPlan, opts: SolveOptions): OutfitState[] {
  const beamWidth = opts.beam ?? 8
  const perSlot = opts.perSlot ?? 25
  const stats = planStats(plan)
  const cap = budgetCap(opts)
  let beam: OutfitState[] = [initialState(plan, opts)]
  const slots = plan.slots
  for (let si = 0; si < slots.length; si++) {
    const slot = slots[si]!
    const remainingAfter = slots.slice(si + 1).filter((s) => s.required)
    let minRemaining = 0
    for (const s of remainingAfter) minRemaining += stats.minPrice.get(s.key) ?? 0
    const options = slot.candidates.slice(0, perSlot)
    const next: OutfitState[] = []
    for (const state of beam) {
      const taken = new Set(state.items.map((it) => it.item.product.id))
      for (const c of options) {
        if (taken.has(c.product.id)) continue
        if (cap !== null && state.cost + c.product.price + minRemaining > cap) continue
        const ext = extend(state, c, slot, opts)
        next.push({ ...ext, f: objective(ext, remainingAfter, stats, opts), overBudget: false })
      }
      if (!slot.required) {
        next.push({ ...state, f: objective(state, remainingAfter, stats, opts) })
      }
    }
    const seen = new Set<string>()
    const deduped: OutfitState[] = []
    for (const s of next) {
      const sig = s.items
        .map((it) => it.item.product.id)
        .toSorted((a, b) => a - b)
        .join(',')
      if (seen.has(sig)) continue
      seen.add(sig)
      deduped.push(s)
    }
    beam = deduped
      .toSorted((a, b) => b.f - a.f || a.cost - b.cost || firstId(a).localeCompare(firstId(b)))
      .slice(0, beamWidth)
    if (beam.length === 0) break
  }
  const requiredKeys = slots.filter((s) => s.required).map((s) => s.key)
  const terminal = beam.filter((s) =>
    requiredKeys.every((k) => s.items.some((it) => it.slotKey === k)),
  )
  return terminal.filter((s) => cap === null || s.cost <= cap)
}

function firstId(s: OutfitState): string {
  return s.items[0]?.item.product.id ?? ''
}

/** Cheapest complete state of a plan (required slots only), flagged over budget. */
export function cheapestState(plan: SolverPlan, opts: SolveOptions): OutfitState | null {
  let state = initialState(plan, opts)
  for (const slot of plan.slots) {
    if (!slot.required) continue
    const taken = new Set(state.items.map((it) => it.item.product.id))
    const cheapest = [...slot.candidates]
      .filter((c) => !taken.has(c.product.id))
      .toSorted((a, b) => a.product.price - b.product.price || a.product.id.localeCompare(b.product.id))[0]
    if (!cheapest) return null
    const ext = extend(state, cheapest, slot, opts)
    state = { ...ext, f: 0, overBudget: true }
  }
  const stats = planStats(plan)
  state.f = objective(state, [], stats, opts)
  state.overBudget = opts.budgetMax !== null && state.cost > opts.budgetMax
  return state
}

export function dominantAesthetic(state: OutfitState): number {
  const sum = Array.from({ length: 32 }, () => 0)
  for (const it of state.items)
    for (let i = 0; i < 32; i++) sum[i] = (sum[i] ?? 0) + (it.item.product.styleVector[i] ?? 0)
  let best = 0
  for (let i = 1; i < 32; i++) if ((sum[i] ?? 0) > (sum[best] ?? 0)) best = i
  return best
}

export function coreItemId(state: OutfitState): number {
  const core = state.items.find(
    (it) => ['dress', 'top', 'tailoring', 'activewear', 'swimwear'].includes(it.role) && !it.pinned,
  )
  return core?.item.product.id ?? state.items[0]?.item.product.id ?? ''
}

function jaccard(a: OutfitState, b: OutfitState): number {
  const sa = new Set(a.items.map((it) => it.item.product.id))
  const sb = new Set(b.items.map((it) => it.item.product.id))
  let inter = 0
  for (const id of sa) if (sb.has(id)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * Greedily accept outfits in `f` order with Jaccard ≤ 0.4 to every accepted one and a different
 * dominant aesthetic or core item; relax to ≤ 0.6 then ≤ 0.8 when fewer than `k` qualify.
 */
export function diversify(pool: readonly OutfitState[], k: number): OutfitState[] {
  const sorted = pool.toSorted((a, b) => b.f - a.f || a.cost - b.cost || firstId(a).localeCompare(firstId(b)))
  const accepted: OutfitState[] = []
  const ids = new Set<string>()
  for (const threshold of [0.4, 0.6, 0.8]) {
    for (const s of sorted) {
      if (accepted.length >= k) break
      const sig = s.items
        .map((it) => it.item.product.id)
        .toSorted((a, b) => a - b)
        .join(',')
      if (ids.has(sig)) continue
      const ok = accepted.every((acc) => {
        if (jaccard(acc, s) > threshold) return false
        if (threshold === 0.4)
          return (
            dominantAesthetic(acc) !== dominantAesthetic(s) || coreItemId(acc) !== coreItemId(s)
          )
        return true
      })
      if (!ok) continue
      accepted.push(s)
      ids.add(sig)
    }
    if (accepted.length >= k) break
  }
  return accepted
}

/** All plans compete; when no plan fits the budget, the cheapest complete outfit is returned flagged. */
export function solveOutfits(plans: readonly SolverPlan[], opts: SolveOptions): OutfitState[] {
  const pool: OutfitState[] = []
  for (const plan of plans) pool.push(...solvePlan(plan, opts))
  if (pool.length === 0) {
    const fallbacks = plans
      .map((p) => cheapestState(p, opts))
      .filter((s): s is OutfitState => s !== null)
    const best = fallbacks.toSorted((a, b) => a.cost - b.cost || b.f - a.f)[0]
    return best ? [best] : []
  }
  return diversify(pool, opts.returnK ?? 3)
}
