/**
 * Lightweight in-memory ranker for the evaluation harness. It mirrors the factor semantics of
 * ENGINE_SPEC §2.3 (style similarity, attribute match, budget fit, user preference, brand
 * affinity, popularity prior; social and trend inapplicable in the sandbox) and the weight
 * redistribution rule of §2.3 so that `Σ contribution === score`. `rank`/`MemoryRetriever` of the
 * recommend module did not exist when this was written; see packages/engine/REQUESTS.md.
 */
import { axisIndex, colorFamilyIndex, type Axis } from '@lookline/catalog'
import type { Department } from '@lookline/db'
import type { FactorName } from '../types'
import type { EvalProduct } from './eval-catalog'
import { templateAxisTargets, type IntentTemplate } from './sim-users'
import {
  BLOCK,
  PREFERENCE_BLOCK_WEIGHTS,
  SIMILARITY_BLOCK_WEIGHTS,
  blockWeightsPerDim,
} from './vector'

const PREF_W2 = blockWeightsPerDim(PREFERENCE_BLOCK_WEIGHTS).map((w) => w * w)
const SIM_W2 = blockWeightsPerDim(SIMILARITY_BLOCK_WEIGHTS).map((w) => w * w)
const PREF_END = BLOCK.G[0]

/** Preference-weighted geometry of a product vector, precomputed once. */
export interface PrefGeometry {
  /** `v_i · w_i²` for dims 0–51. */
  scaled: Float64Array
  /** `‖w ∘ v‖`. */
  norm: number
}

export function prefGeometry(v: ArrayLike<number>): PrefGeometry {
  const scaled = new Float64Array(PREF_END)
  let n = 0
  for (let i = 0; i < PREF_END; i++) {
    const w2 = PREF_W2[i] ?? 0
    const x = v[i] ?? 0
    scaled[i] = x * w2
    n += x * x * w2
  }
  return { scaled, norm: Math.sqrt(n) }
}

/** `‖w ∘ p‖` of a preference vector under the preference block weights. */
export function prefNorm(p: ArrayLike<number>): number {
  let n = 0
  for (let i = 0; i < PREF_END; i++) n += (p[i] ?? 0) * (p[i] ?? 0) * (PREF_W2[i] ?? 0)
  return Math.sqrt(n)
}

/** `blockCosine(p, v, PREFERENCE_BLOCK_WEIGHTS)` using the precomputed geometry of `v`. */
export function prefCosine(p: ArrayLike<number>, pNorm: number, g: PrefGeometry): number {
  if (pNorm === 0 || g.norm === 0) return 0
  let dot = 0
  for (let i = 0; i < PREF_END; i++) dot += (p[i] ?? 0) * (g.scaled[i] ?? 0)
  return dot / (pNorm * g.norm)
}

/** `blockCosine(a, b, SIMILARITY_BLOCK_WEIGHTS)`. */
export function similarityCosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < BLOCK.X[0]; i++) {
    const w2 = SIM_W2[i] ?? 0
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y * w2
    na += x * x * w2
    nb += y * y * w2
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

export interface PoolItem {
  /** Index into the catalog's product array. */
  product: number
  /** `style_similarity` value. */
  sim: number
  /** `attribute_match` value (0 when not applicable). */
  attr: number
  /** `popularity_prior` value. */
  pop: number
  /** Preference geometry of the product vector. */
  geometry: PrefGeometry
}

export interface CandidatePool {
  department: Department
  template: IntentTemplate
  attrApplicable: boolean
  items: PoolItem[]
}

/** Departments a user of `department` is shown (§2.1 unisex inclusion, kids isolation). */
export function visibleDepartments(department: Department): readonly Department[] {
  switch (department) {
    case 'women':
      return ['women', 'unisex']
    case 'men':
      return ['men', 'unisex']
    case 'kids':
      return ['kids']
    case 'unisex':
    default:
      return ['women', 'men', 'unisex']
  }
}

function attributeMatch(
  p: EvalProduct,
  t: IntentTemplate,
  targets: Partial<Record<Axis, number>>,
): number {
  let weight = 0
  let sum = 0
  if (t.categoryGroups.length > 0) {
    weight += 0.3
    sum += 0.3 * (t.categoryGroups.includes(p.categoryGroup) ? 1 : 0)
  }
  if (t.colorFamily) {
    weight += 0.25
    const secondary = (p.vector[colorFamilyIndex(t.colorFamily)] ?? 0) >= 0.4
    sum += 0.25 * (p.colorFamily === t.colorFamily ? 1 : secondary ? 0.6 : 0)
  }
  const axes = Object.entries(targets) as Array<[Axis, number | undefined]>
  if (axes.length > 0) {
    weight += 0.15
    let diff = 0
    let n = 0
    for (const [axis, target] of axes) {
      if (target === undefined) continue
      diff += Math.abs(target - (p.vector[axisIndex(axis)] ?? 0))
      n += 1
    }
    sum += 0.15 * (n > 0 ? 1 - diff / n : 0)
  }
  return weight > 0 ? sum / weight : 0
}

/**
 * Brute-force retrieval: products visible to the department, restricted to the template's
 * category groups, ranked by intent similarity; the top `size` become the candidate pool.
 */
export function buildPool(
  products: readonly EvalProduct[],
  department: Department,
  template: IntentTemplate,
  intentVector: ArrayLike<number>,
  popularityMax: number,
  size: number,
): CandidatePool {
  const visible = new Set(visibleDepartments(department))
  const groups = new Set(template.categoryGroups)
  const targets = templateAxisTargets(template)
  const attrApplicable =
    template.categoryGroups.length > 0 ||
    template.colorFamily !== undefined ||
    Object.keys(targets).length > 0
  const logMax = Math.log1p(Math.max(popularityMax, 1e-9))
  const scored: Array<{ index: number; sim: number; pop: number }> = []
  for (let i = 0; i < products.length; i++) {
    const p = products[i]!
    if (!visible.has(p.department)) continue
    if (groups.size > 0 && !groups.has(p.categoryGroup)) continue
    scored.push({
      index: i,
      sim: similarityCosine(intentVector, p.vector),
      pop: Math.log1p(p.popularity) / logMax,
    })
  }
  const ranked = scored.toSorted(
    (a, b) =>
      b.sim - a.sim ||
      products[b.index]!.popularity - products[a.index]!.popularity ||
      a.index - b.index,
  )
  const items: PoolItem[] = ranked.slice(0, size).map((s) => {
    const p = products[s.index]!
    return {
      product: s.index,
      sim: s.sim,
      attr: attrApplicable ? attributeMatch(p, template, targets) : 0,
      pop: s.pop,
      geometry: prefGeometry(p.vector),
    }
  })
  return { department, template, attrApplicable, items }
}

/** `budget_fit` (§2.3): 1 within budget, linear to 0 at 1.5× over. */
export function budgetFit(price: number, budgetMax: number): number {
  if (price <= budgetMax) return 1
  return Math.max(0, 1 - (price - budgetMax) / (0.5 * budgetMax))
}

export interface BrandCounts {
  purchases: number
  saves: number
  dismisses: number
}

/** `brand_affinity` (§2.3): `min(1, .4 + .15·purchases + .05·saves − .2·dismisses)`, cold → .4. */
export function brandAffinity(counts: BrandCounts | undefined): number {
  if (!counts) return 0.4
  return Math.min(1, 0.4 + 0.15 * counts.purchases + 0.05 * counts.saves - 0.2 * counts.dismisses)
}

export interface RankUser {
  /** Effective preference vector (already decayed) or null. */
  preference: ArrayLike<number> | null
  /** `user_preference` counts only with ≥ 3 events (or the oracle). */
  preferenceApplicable: boolean
  budgetMax: number
  brandCounts: ReadonlyMap<number, BrandCounts> | null
}

const APPLICABLE_ALWAYS: readonly FactorName[] = [
  'style_similarity',
  'budget_fit',
  'brand_affinity',
  'popularity_prior',
]

/** Effective (redistributed) weights of the applicable factors; they sum to 1. */
export function effectiveWeights(
  weights: Record<FactorName, number>,
  pool: CandidatePool,
  user: RankUser,
): Record<FactorName, number> {
  const applicable = new Set<FactorName>(APPLICABLE_ALWAYS)
  if (pool.attrApplicable) applicable.add('attribute_match')
  if (user.preferenceApplicable && user.preference) applicable.add('user_preference')
  let sum = 0
  for (const f of applicable) sum += weights[f]
  const out = {} as Record<FactorName, number>
  for (const f of Object.keys(weights) as FactorName[])
    out[f] = applicable.has(f) && sum > 0 ? weights[f] / sum : 0
  return out
}

/**
 * Score the pool for a user and return the indices (into `pool.items`) of the top `k`, ties by
 * popularity desc then product id asc. `scores` receives every item's score when given.
 */
export function rankPool(
  pool: CandidatePool,
  products: readonly EvalProduct[],
  weights: Record<FactorName, number>,
  user: RankUser,
  k: number,
  scores?: Float64Array,
): number[] {
  const w = effectiveWeights(weights, pool, user)
  const pNorm = user.preference && w.user_preference > 0 ? prefNorm(user.preference) : 0
  const top: number[] = []
  const topScore: number[] = []
  const items = pool.items
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const p = products[item.product]!
    let s =
      w.style_similarity * item.sim +
      w.popularity_prior * item.pop +
      w.budget_fit * budgetFit(p.price, user.budgetMax)
    if (w.attribute_match > 0) s += w.attribute_match * item.attr
    if (w.user_preference > 0 && user.preference)
      s += w.user_preference * prefCosine(user.preference, pNorm, item.geometry)
    if (w.brand_affinity > 0)
      s += w.brand_affinity * brandAffinity(user.brandCounts?.get(p.brandId))
    if (scores) scores[i] = s
    // insertion into the sorted top-k
    let pos = top.length
    while (pos > 0) {
      const j = pos - 1
      const other = items[top[j]!]!
      const so = topScore[j]!
      const before =
        s > so ||
        (s === so &&
          (p.popularity > products[other.product]!.popularity ||
            (p.popularity === products[other.product]!.popularity &&
              p.id < products[other.product]!.id)))
      if (!before) break
      pos = j
    }
    if (pos < k) {
      top.splice(pos, 0, i)
      topScore.splice(pos, 0, s)
      if (top.length > k) {
        top.pop()
        topScore.pop()
      }
    }
  }
  return top
}
