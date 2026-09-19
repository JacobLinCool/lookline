/**
 * Distribution targets (CATALOG_SPEC §7.1) and the largest-remainder apportionment used at every
 * level of the plan (§7.2).
 */
import type { BrandTier, CategoryGroup, Department, Season } from '../types'

/** Department shares of the catalog (exact by construction). */
export const DEPT_SHARE: Readonly<Record<Department, number>> = {
  women: 0.46,
  men: 0.3,
  unisex: 0.14,
  kids: 0.1,
}

// prettier-ignore
const GROUP_SHARE_ROWS: Readonly<Record<Department, readonly number[]>> = {
  //       tops bottoms dresses outer foot bags acc jewel active swim lounge tailor
  women:  [18, 11, 16,  8, 11, 9,  6, 7, 5, 3, 3, 3],
  men:    [26, 17,  0, 12, 14, 4,  8, 2, 8, 2, 3, 4],
  unisex: [28, 14,  0, 12, 14, 8, 12, 3, 7, 0, 2, 0],
  kids:   [26, 16,  8, 11, 14, 4,  8, 0, 6, 4, 3, 0],
}

const GROUP_ORDER: readonly CategoryGroup[] = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'footwear',
  'bags',
  'accessories',
  'jewelry',
  'activewear',
  'swimwear',
  'loungewear',
  'tailoring',
]

/** `GROUP_SHARE[dept][group]` in percent; every row sums to 100 (§7.1). */
export const GROUP_SHARE: Readonly<Record<Department, Readonly<Record<CategoryGroup, number>>>> =
  Object.fromEntries(
    Object.entries(GROUP_SHARE_ROWS).map(([dept, row]) => [
      dept,
      Object.fromEntries(GROUP_ORDER.map((g, i) => [g, row[i] ?? 0])),
    ]),
  ) as Record<Department, Record<CategoryGroup, number>>

/** Tier targets (±2 pp; emerges from brand sizes). */
export const TIER_TARGET: Readonly<Record<BrandTier, number>> = {
  budget: 0.3,
  mid: 0.44,
  premium: 0.18,
  luxury: 0.08,
}

/** Season targets (±3 pp). */
export const SEASON_TARGET: Readonly<Record<Season, number>> = {
  'all-season': 0.3,
  spring: 0.17,
  summer: 0.22,
  autumn: 0.18,
  winter: 0.13,
}

/**
 * Largest-remainder apportionment of `total` over `weights`: floors of the exact quotas, then the
 * remaining units go to the largest fractional parts (ties → lower index). Zero weights get 0.
 */
export function largestRemainder(total: number, weights: readonly number[]): number[] {
  const n = weights.length
  const out = Array.from({ length: n }, () => 0)
  if (total <= 0 || n === 0) return out
  let sum = 0
  for (const w of weights) if (w > 0) sum += w
  if (!(sum > 0)) return out
  const fractions: Array<[index: number, frac: number]> = []
  let assigned = 0
  for (let i = 0; i < n; i++) {
    const w = weights[i] ?? 0
    if (w <= 0) continue
    const quota = (total * w) / sum
    const floor = Math.floor(quota)
    out[i] = floor
    assigned += floor
    fractions.push([i, quota - floor])
  }
  fractions.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  let remaining = total - assigned
  for (let k = 0; remaining > 0 && fractions.length > 0; k++) {
    const entry = fractions[k % fractions.length]!
    out[entry[0]] = (out[entry[0]] ?? 0) + 1
    remaining--
  }
  return out
}
