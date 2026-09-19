/**
 * Stock (CATALOG_SPEC §5.3), sold-out sizes (§1.5), rating / reviews / popularity (§5.4) and size
 * runs (§1.5). Streams `sizes`, `stock`, `rating`.
 */
import { logUniformInt } from '../rng'
import { SUBCATEGORIES, medianSize, sizeRunFor, sizeSystemFor } from '../taxonomy'
import type { SubcategoryRow } from '../taxonomy/categories'
import type { BrandTier, Department, Rng, SizeSystem } from '../types'

export interface SizeResult {
  sizeSystem: SizeSystem
  sizes: string[]
}

/**
 * Stream `sizes`: `u` then, for the 25 % drop branch, the drop count (`chance(.7)` ⇒ 1) and the
 * side (`chance(.5)` ⇒ start). 70 % full run; 5 % the run's median only. Runs of ≤ 2 sizes stay full.
 */
export function drawSizes(rng: Rng, sub: SubcategoryRow, department: Department): SizeResult {
  const sizeSystem = sizeSystemFor(sub.sizeSystem, department)
  const run = sizeRunFor(sub.sizeSystem, department)
  const u = rng.next()
  if (run.length <= 2) return { sizeSystem, sizes: [...run] }
  if (u < 0.7) return { sizeSystem, sizes: [...run] }
  if (u < 0.95) {
    const count = rng.chance(0.7) ? 1 : 2
    const fromStart = rng.chance(0.5)
    const sizes = fromStart ? run.slice(count) : run.slice(0, run.length - count)
    return { sizeSystem, sizes }
  }
  return { sizeSystem, sizes: [medianSize(run) ?? run[0]!] }
}

export interface StockResult {
  stock: number
  /** Comma-joined subset of `sizes`; `''` when none; `= sizes` when stock is 0. */
  soldOutSizes: string
}

const STOCK_BOOST_GROUPS = new Set(['accessories'])

/** Stream `stock`: `u`, then one draw per size (sold out with p = .15). */
export function drawStock(
  rng: Rng,
  sub: SubcategoryRow,
  department: Department,
  sizes: readonly string[],
): StockResult {
  const u = rng.next()
  let stock: number
  if (u < 0.06) stock = 0
  else if (u < 0.2) stock = rng.int(1, 5)
  else if (u < 0.78) stock = rng.int(6, 60)
  else stock = logUniformInt(rng, 61, 320)
  if (department === 'kids' || sub.slug === 'socks' || STOCK_BOOST_GROUPS.has(sub.group)) {
    stock = Math.min(400, Math.round(stock * 1.5))
  }
  const soldOut: string[] = []
  for (const size of sizes) if (rng.chance(0.15)) soldOut.push(size)
  const soldOutSizes = stock === 0 ? sizes.join(',') : soldOut.join(',')
  return { stock, soldOutSizes }
}

const TIER_MEAN: Readonly<Record<BrandTier, number>> = {
  budget: 4.1,
  mid: 4.2,
  premium: 4.3,
  luxury: 4.35,
}

const RECENCY: Readonly<Record<number, number>> = { 2026: 1, 2025: 0.8, 2024: 0.6 }

const MAX_WEIGHT_IN_GROUP: ReadonlyMap<string, number> = (() => {
  const out = new Map<string, number>()
  for (const s of SUBCATEGORIES) out.set(s.group, Math.max(out.get(s.group) ?? 0, s.weight))
  return out
})()

/** `w / max w` inside the group (§5.4). */
export function subcategoryPopularity(sub: SubcategoryRow): number {
  return sub.weight / (MAX_WEIGHT_IN_GROUP.get(sub.group) ?? sub.weight)
}

export interface RatingInput {
  sub: SubcategoryRow
  tier: BrandTier
  brandPopularity: number
  dropYear: number
}

export interface RatingResult {
  rating: number
  reviewCount: number
  popularity: number
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/**
 * Stream `rating`: u1, the review-count log-normal (`normal(ln 18, 1.1)`), z (normal), u2 — the
 * draw count is fixed whether or not the product has reviews.
 */
export function drawRating(rng: Rng, input: RatingInput): RatingResult {
  const u1 = rng.next()
  const countDraw = rng.normal(Math.log(18), 1.1)
  const z = rng.normal(0, 1)
  const u2 = rng.next()
  const pop =
    input.brandPopularity * subcategoryPopularity(input.sub) * (RECENCY[input.dropYear] ?? 1)
  const hasReviews = u1 < 0.88 * Math.sqrt(pop) + 0.05
  const reviewCount = hasReviews
    ? Math.min(4800, Math.floor(Math.exp(countDraw) * (0.4 + 1.6 * pop)))
    : 0
  const tierMean = TIER_MEAN[input.tier]
  const r = clamp(tierMean + 0.32 * z, 3.2, 5)
  const n = reviewCount
  const rating =
    n === 0 ? 0 : Math.round(((r * Math.min(n, 5) + tierMean * Math.max(0, 5 - n)) / 5) * 10) / 10
  const popularity = Math.round(clamp(pop * (0.7 + 0.3 * u2), 0, 1) * 1000) / 1000
  return { rating, reviewCount, popularity }
}
