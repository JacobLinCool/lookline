/**
 * Pricing (CATALOG_SPEC §5.2): tier × group ladder, attribute multipliers, log-normal noise, charm
 * rounding, clamp, and the sale draw. Stream `price`, draws in order: z, saleU, discountU.
 */
import type { MaterialRow } from '../taxonomy/materials'
import type { BrandTier, CategoryGroup, Department, Rng } from '../types'

// prettier-ignore
const TIER_GROUP_ROWS: Readonly<Record<BrandTier, readonly number[]>> = {
  //        tops bottoms dresses outer foot bags acc jewel active swim lounge tailor
  budget:  [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  mid:     [1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.0, 1.1, 1.0, 1.0, 1.0, 1.0],
  premium: [1.0, 1.0, 1.1, 1.1, 1.2, 1.4, 1.1, 1.6, 0.9, 1.0, 1.0, 1.1],
  luxury:  [0.9, 0.9, 1.2, 1.2, 1.4, 2.2, 1.3, 3.0, 0.8, 1.0, 1.0, 1.2],
}

const GROUPS: readonly CategoryGroup[] = [
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

/** `TIER_GROUP[tier][group]` price ladder (§5.2). */
export const TIER_GROUP: Readonly<Record<BrandTier, Readonly<Record<CategoryGroup, number>>>> =
  Object.fromEntries(
    Object.entries(TIER_GROUP_ROWS).map(([tier, row]) => [
      tier,
      Object.fromEntries(GROUPS.map((g, i) => [g, row[i] ?? 1])),
    ]),
  ) as Record<BrandTier, Record<CategoryGroup, number>>

export const DEPT_PRICE_MULT: Readonly<Record<Department, number>> = {
  women: 1,
  men: 1,
  unisex: 0.95,
  kids: 0.62,
}

export const SALE_RATE: Readonly<Record<BrandTier, number>> = {
  budget: 0.25,
  mid: 0.2,
  premium: 0.15,
  luxury: 0.05,
}

/** Discount fractions with weights; budget/mid are restricted to ≤ .30 (renormalised). */
export const DISCOUNTS: ReadonlyArray<readonly [fraction: number, weight: number]> = [
  [0.15, 30],
  [0.2, 30],
  [0.3, 20],
  [0.4, 12],
  [0.5, 8],
]

export const PRICE_FLOOR = 190
export const PRICE_CEILING = 480_000

/** Charm rounding per magnitude (§5.2), hard floor 190 and ceiling 480 000. */
export function roundRetail(x: number): number {
  let r: number
  if (x < 1000) r = Math.max(190, Math.round(x / 100) * 100 - 10)
  else if (x < 10_000) r = Math.round(x / 100) * 100 - 10
  else if (x < 50_000) r = Math.round(x / 1000) * 1000 - 100
  else r = Math.round(x / 5000) * 5000
  return Math.min(PRICE_CEILING, Math.max(PRICE_FLOOR, r))
}

/** Product of the §5.2 attribute multipliers (1 when none applies). */
export function attributePriceMultiplier(
  columns: { length?: string | null },
  extras: Readonly<Record<string, string | number | boolean>>,
  group: CategoryGroup,
  subcategory: string,
): number {
  let m = 1
  if (extras.gauge === 'chunky') m *= 1.1
  if (extras.insulation === 'heavy') m *= 1.15
  if (group === 'bags') {
    if (extras.size === 'large') m *= 1.15
    else if (extras.size === 'mini') m *= 0.85
  }
  if (group === 'jewelry') {
    if (extras.scale === 'statement') m *= 1.25
    else if (extras.scale === 'dainty') m *= 0.9
  }
  if (extras.stone === 'pearl') m *= 1.2
  else if (extras.stone === 'cubic-zirconia') m *= 1.1
  if (extras.heel === 'stiletto') m *= 1.1
  if (extras.shaft === 'knee') m *= 1.2
  if (columns.length === 'maxi' || columns.length === 'floor') m *= 1.1
  if (typeof extras.buttons === 'string' && extras.buttons.startsWith('double')) m *= 1.08
  if (extras.lining === 'shearling') m *= 1.25
  if (subcategory === 'watch' && extras.strap === 'steel') m *= 1.15
  return m
}

export interface PriceInput {
  basePrice: number
  sigma: number
  tier: BrandTier
  group: CategoryGroup
  subcategory: string
  department: Department
  brandMultiplier: number
  material: MaterialRow
  columns: { length?: string | null }
  extras: Readonly<Record<string, string | number | boolean>>
  dropYear: number
}

export interface PriceResult {
  price: number
  /** Present only when on sale. */
  compareAtPrice: number | null
  discount: number
}

/** Draws z (normal), saleU, discountU from the `price` stream in that order. */
export function computePrice(rng: Rng, input: PriceInput): PriceResult {
  const z = rng.normal(0, 1)
  const saleU = rng.next()
  const discountU = rng.next()
  const raw =
    input.basePrice *
    input.brandMultiplier *
    TIER_GROUP[input.tier][input.group] *
    input.material.priceFactor *
    DEPT_PRICE_MULT[input.department] *
    attributePriceMultiplier(input.columns, input.extras, input.group, input.subcategory) *
    Math.exp(input.sigma * z)
  const lo = roundRetail(input.basePrice * 0.3)
  const hi = roundRetail(input.basePrice * 40)
  const price = Math.min(hi, Math.max(lo, roundRetail(raw)))

  let pSale = SALE_RATE[input.tier]
  if (input.dropYear === 2024) pSale = Math.min(0.5, pSale * 2)
  if (saleU >= pSale) return { price, compareAtPrice: null, discount: 0 }
  const options =
    input.tier === 'budget' || input.tier === 'mid'
      ? DISCOUNTS.filter(([d]) => d <= 0.3)
      : DISCOUNTS
  const total = options.reduce((s, [, w]) => s + w, 0)
  let r = discountU * total
  let discount = options[options.length - 1]![0]
  for (const [d, w] of options) {
    r -= w
    if (r < 0) {
      discount = d
      break
    }
  }
  let compareAtPrice = roundRetail(price / (1 - discount))
  // Near the 190 floor the charm rounding can land on the price itself; step up one charm price.
  while (compareAtPrice <= price && compareAtPrice < PRICE_CEILING) {
    compareAtPrice = roundRetail(compareAtPrice + retailStep(compareAtPrice))
  }
  return { price, compareAtPrice, discount }
}

/** Distance between neighbouring charm prices at a magnitude. */
function retailStep(x: number): number {
  if (x < 10_000) return 100
  if (x < 50_000) return 1000
  return 5000
}

/** Price bounds of a subcategory base, as clamped by `computePrice`. */
export function priceBounds(basePrice: number): readonly [number, number] {
  return [roundRetail(basePrice * 0.3), roundRetail(basePrice * 40)]
}
