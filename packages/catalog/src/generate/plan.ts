/**
 * The fixed allocation plan (CATALOG_SPEC §7.2): largest-remainder apportionment
 * department → group → subcategory → brand, leaves grouped into `(subcategory, brand)` cells with
 * contiguous slot ranges, and the coprime affine id scramble that makes any `size ≤ planSize` the
 * exact id-prefix of the full plan.
 */
import { createRng, hashSeed } from '../rng'
import { CATEGORY_GROUPS, DEPARTMENTS, SUBCATEGORIES, subcategoriesFor } from '../taxonomy'
import type { SubcategoryRow } from '../taxonomy/categories'
import type { BrandTier, Department, GeneratedBrand } from '../types'
import { GENERALIST_IDS, generateBrands, type BrandRecord } from './brands'
import { DEFAULT_CATALOG_SIZE } from './constants'
import { DEPT_SHARE, GROUP_SHARE, TIER_TARGET, largestRemainder } from './distribution'

export interface PlanCell {
  /** `subcategoryIndex × 1000 + brandId`. */
  id: number
  /** Position in `plan.cells`. */
  index: number
  subcategoryIndex: number
  subcategory: SubcategoryRow
  brand: BrandRecord
  /** First slot of the cell; slots `[start, start + n)` belong to it. */
  start: number
  n: number
  /** Leaf counts per department (dept order women, men, unisex, kids). */
  deptCounts: Readonly<Record<Department, number>>
  /** Departments with a non-zero count, in dept order. */
  departments: readonly Department[]
}

export interface Plan {
  seed: number
  size: number
  brands: readonly BrandRecord[]
  cells: readonly PlanCell[]
  /** `cellStart[k] = cells[k].start`, for the binary search of `indexToCell`. */
  cellStart: Int32Array
  /** Largest cell size. */
  maxCell: number
}

export const SCRAMBLE_A = 73_856_093
export const SCRAMBLE_B = 12_345

/** Largest cell size the name grammar can label injectively (256 line words × 4 Roman suffixes). */
export const MAX_CELL_SIZE = 1024

const TIER_INDEX: Readonly<Record<BrandTier, number>> = { budget: 0, mid: 1, premium: 2, luxury: 3 }

export function tierIndex(tier: BrandTier): number {
  return TIER_INDEX[tier]
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = a % b
    a = b
    b = t
  }
  return a
}

/** `A` of the scramble, incremented by 2 until coprime with `planSize` (never for 100 000). */
export function scrambleMultiplier(planSize: number): number {
  let a = SCRAMBLE_A
  while (gcd(a, planSize) !== 1) a += 2
  return a
}

/** Slot of the 0-based product index `i` in the plan: `(i × A + B) mod planSize`. */
export function slotOf(i: number, planSize: number): number {
  const a = scrambleMultiplier(planSize)
  // i × A stays below 2^53 for every realistic plan size (i < 1e7 ⇒ < 7.4e14).
  return (i * a + SCRAMBLE_B) % planSize
}

/** Plan size for a requested catalog size: the 100k plan unless the catalog is larger. */
export function planSizeFor(size: number): number {
  return Math.max(DEFAULT_CATALOG_SIZE, size)
}

const isBrandRecord = (b: GeneratedBrand): b is BrandRecord =>
  typeof (b as Partial<BrandRecord>).size === 'number' &&
  typeof (b as Partial<BrandRecord>).departmentWeights === 'object' &&
  typeof (b as Partial<BrandRecord>).groupWeights === 'object'

const fullBrandsBySeed = new Map<number, BrandRecord[]>()

/**
 * The in-memory brand extras (§4.1) are recomputed from the seed when the caller passes plain
 * `GeneratedBrand` rows (e.g. read back from the database); `BrandRecord`s pass through.
 */
export function resolveBrandRecords(
  seed: number,
  brands: readonly GeneratedBrand[],
): readonly BrandRecord[] {
  if (brands.every(isBrandRecord)) return brands
  let full = fullBrandsBySeed.get(seed)
  if (!full) {
    full = generateBrands(seed)
    fullBrandsBySeed.set(seed, full)
  }
  const byId = new Map(full.map((b) => [b.id, b]))
  return brands.map((b) => {
    if (isBrandRecord(b)) return b
    const record = byId.get(b.id)
    if (!record) throw new Error(`@lookline/catalog: brand ${b.id} has no generated record`)
    return { ...record, ...b, size: record.size } as BrandRecord
  })
}

interface Leaf {
  subcategoryIndex: number
  brand: BrandRecord
  dept: Department
  n: number
}

function brandWeight(
  b: BrandRecord,
  dept: Department,
  sub: SubcategoryRow,
  factor: number,
): number {
  if (tierIndex(b.tier) < sub.minTier) return 0
  if (dept === 'kids' && b.tier === 'luxury') return 0
  return b.size * (b.departmentWeights[dept] ?? 0) * (b.groupWeights[sub.group] ?? 0) * factor
}

/** Stop fitting once every brand is within this share of the catalog of its size (0.01 pp). */
export const BRAND_FIT_TOLERANCE = 0.0001
export const BRAND_FIT_ITERATIONS = 40

/**
 * Target share per brand: its `size` (§4.1) rescaled inside its tier so the tier totals equal
 * `TIER_TARGET` exactly (the clamped brand sizes alone sum to roughly 27.6 / 43.4 / 19.6 / 9.5).
 */
export function brandTargets(brands: readonly BrandRecord[]): number[] {
  const tierSum: Record<BrandTier, number> = { budget: 0, mid: 0, premium: 0, luxury: 0 }
  for (const b of brands) tierSum[b.tier] += b.size
  return brands.map((b) =>
    tierSum[b.tier] > 0 ? (b.size * TIER_TARGET[b.tier]) / tierSum[b.tier] : 0,
  )
}

/**
 * Leaves of the plan for per-brand weight factors. The factors are fitted iteratively
 * (proportional fitting on the brand marginals) so each brand's realised share lands on its
 * target — and with it the tier shares on `TIER_TARGET` — instead of drifting with the
 * eligibility structure; every other level is exact by construction.
 */
function buildLeaves(
  planSize: number,
  brands: readonly BrandRecord[],
  factors: readonly number[],
): Leaf[] {
  const subIndex = new Map(SUBCATEGORIES.map((s, i) => [s.slug, i]))
  const leaves: Leaf[] = []
  const deptCounts = largestRemainder(
    planSize,
    DEPARTMENTS.map((d) => DEPT_SHARE[d]),
  )
  DEPARTMENTS.forEach((dept, di) => {
    const deptTotal = deptCounts[di] ?? 0
    if (deptTotal === 0) return
    const groupCounts = largestRemainder(
      deptTotal,
      CATEGORY_GROUPS.map((g) => GROUP_SHARE[dept][g]),
    )
    CATEGORY_GROUPS.forEach((group, gi) => {
      const groupTotal = groupCounts[gi] ?? 0
      if (groupTotal === 0) return
      const subs = subcategoriesFor(group, dept)
      const subCounts = largestRemainder(
        groupTotal,
        subs.map((s) => s.weight),
      )
      subs.forEach((sub, si) => {
        const subTotal = subCounts[si] ?? 0
        if (subTotal === 0) return
        let weights = brands.map((b, bi) => brandWeight(b, dept, sub, factors[bi] ?? 1))
        if (!weights.some((w) => w > 0)) {
          weights = brands.map((b) => (GENERALIST_IDS.includes(b.id) ? 1 : 0))
        }
        const brandCounts = largestRemainder(subTotal, weights)
        brands.forEach((brand, bi) => {
          const n = brandCounts[bi] ?? 0
          if (n > 0) leaves.push({ subcategoryIndex: subIndex.get(sub.slug)!, brand, dept, n })
        })
      })
    })
  })
  return leaves
}

function buildPlan(seed: number, planSize: number, brands: readonly BrandRecord[]): Plan {
  const factors = brands.map(() => 1)
  const targets = brandTargets(brands)
  const brandIndex = new Map(brands.map((b, bi) => [b.id, bi]))
  let leaves: Leaf[] = []
  for (let iter = 0; iter < BRAND_FIT_ITERATIONS; iter++) {
    leaves = buildLeaves(planSize, brands, factors)
    const realised = brands.map(() => 0)
    for (const leaf of leaves) {
      const bi = brandIndex.get(leaf.brand.id)!
      realised[bi] = (realised[bi] ?? 0) + leaf.n
    }
    let maxErr = 0
    brands.forEach((b, bi) => {
      maxErr = Math.max(maxErr, Math.abs((realised[bi] ?? 0) / planSize - (targets[bi] ?? 0)))
    })
    if (maxErr <= BRAND_FIT_TOLERANCE) break
    brands.forEach((b, bi) => {
      const target = (targets[bi] ?? 0) * planSize
      const got = Math.max(1, realised[bi] ?? 0)
      const next = (factors[bi] ?? 1) * (target / got)
      factors[bi] = Math.min(1e6, Math.max(1e-6, next))
    })
  }

  const cellMap = new Map<
    number,
    { sub: number; brand: BrandRecord; counts: Record<Department, number> }
  >()
  for (const leaf of leaves) {
    const id = leaf.subcategoryIndex * 1000 + leaf.brand.id
    let cell = cellMap.get(id)
    if (!cell) {
      cell = {
        sub: leaf.subcategoryIndex,
        brand: leaf.brand,
        counts: { women: 0, men: 0, unisex: 0, kids: 0 },
      }
      cellMap.set(id, cell)
    }
    cell.counts[leaf.dept] += leaf.n
  }
  const ordered = [...cellMap.entries()].toSorted(
    (a, b) => a[1].sub - b[1].sub || a[1].brand.id - b[1].brand.id,
  )
  const cells: PlanCell[] = []
  let start = 0
  let maxCell = 0
  ordered.forEach(([id, c], index) => {
    const n = DEPARTMENTS.reduce((s, d) => s + c.counts[d], 0)
    if (n > MAX_CELL_SIZE) {
      throw new Error(
        `@lookline/catalog: cell ${SUBCATEGORIES[c.sub]?.slug}/${c.brand.slug} has ${n} products (> ${MAX_CELL_SIZE})`,
      )
    }
    maxCell = Math.max(maxCell, n)
    cells.push({
      id,
      index,
      subcategoryIndex: c.sub,
      subcategory: SUBCATEGORIES[c.sub]!,
      brand: c.brand,
      start,
      n,
      deptCounts: c.counts,
      departments: DEPARTMENTS.filter((d) => c.counts[d] > 0),
    })
    start += n
  })
  if (start !== planSize) {
    throw new Error(`@lookline/catalog: plan slots (${start}) do not sum to planSize (${planSize})`)
  }
  const cellStart = new Int32Array(cells.length)
  cells.forEach((c, k) => {
    cellStart[k] = c.start
  })
  return { seed, size: planSize, brands, cells, cellStart, maxCell }
}

const planCache = new WeakMap<readonly GeneratedBrand[], Map<string, Plan>>()

/**
 * Memoised per `(seed, planSize, brands identity)`. Deterministic: only brand sizes depend on the
 * seed; every apportionment tie breaks by table order.
 */
export function createPlan(
  seed: number,
  planSize: number,
  brands: readonly GeneratedBrand[],
): Plan {
  let bySeed = planCache.get(brands)
  if (!bySeed) {
    bySeed = new Map()
    planCache.set(brands, bySeed)
  }
  const key = `${seed}:${planSize}`
  let plan = bySeed.get(key)
  if (!plan) {
    plan = buildPlan(seed, planSize, resolveBrandRecords(seed, brands))
    bySeed.set(key, plan)
  }
  return plan
}

/** Cell and ordinal of a slot (binary search over `cellStart`). */
export function indexToCell(plan: Plan, slot: number): { cell: PlanCell; ordinal: number } {
  if (slot < 0 || slot >= plan.size) {
    throw new RangeError(`@lookline/catalog: slot ${slot} outside [0, ${plan.size})`)
  }
  const starts = plan.cellStart
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((starts[mid] ?? 0) <= slot) lo = mid
    else hi = mid - 1
  }
  const cell = plan.cells[lo]!
  return { cell, ordinal: slot - cell.start }
}

const permCache = new WeakMap<Plan, Map<number, Int32Array>>()

/**
 * Cell permutation (§7.2 step 6): `createRng(hashSeed(seed, 'cell-perm', cellId)).shuffle` of
 * `[0, n)`. `perm[j]` is the layout position of ordinal `j`.
 */
export function cellPermutation(plan: Plan, cell: PlanCell): Int32Array {
  let perms = permCache.get(plan)
  if (!perms) {
    perms = new Map()
    permCache.set(plan, perms)
  }
  let perm = perms.get(cell.id)
  if (!perm) {
    const rng = createRng(hashSeed(plan.seed, 'cell-perm', cell.id))
    perm = Int32Array.from(rng.shuffle(Array.from({ length: cell.n }, (_, k) => k)))
    perms.set(cell.id, perm)
  }
  return perm
}

/** Department of layout position `k` in a cell: the leaf counts laid out in dept order. */
export function departmentAt(cell: PlanCell, k: number): Department {
  let acc = 0
  for (const d of DEPARTMENTS) {
    acc += cell.deptCounts[d]
    if (k < acc) return d
  }
  return DEPARTMENTS[DEPARTMENTS.length - 1]!
}
