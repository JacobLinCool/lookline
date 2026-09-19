/**
 * Pure part of `suggestRemix` (ENGINE_SPEC §3.5): score per-slot candidates against the source
 * Look and the remixer, pick one piece per source slot under the budget, and explain each swap
 * ("why this instead"). Every item's `score` equals the sum of its factor contributions.
 */
import {
  aestheticIndex,
  cosineRange,
  findAesthetic,
  findSubcategory,
  type CategoryGroup,
} from '@lookline/catalog'
import type { Article } from '@lookline/db'
import type { Explanation, ExplanationFactor, FactorName, RankedItem } from '../types'
import { normalizeHex } from '../looks/color'

export type RemixProduct = Article & { brandName: string }

export interface RemixSlot {
  /** Source piece this slot replaces. */
  source: RemixProduct
  role: string
  group: CategoryGroup | string
  /** Candidates from retrieval (already department/group/stock filtered). */
  candidates: RemixProduct[]
}

export interface RemixContext {
  /** Source Look style vector (64-d). */
  sourceVector: readonly number[]
  /** Remixer's learned preference vector, when any. */
  preferenceVector: readonly number[] | null
  department: string
  /** Size per size system (`alpha`, `numeric-waist`, `eu-shoe`), when known. */
  sizes: Partial<Record<string, string>>
  budget: number | null
}

/** ENGINE_SPEC §3.1 `slotShareMax`: maximum fraction of the total budget per slot. */
export const SLOT_SHARE_MAX: Readonly<Record<string, number>> = {
  dresses: 0.55,
  tailoring: 0.5,
  outerwear: 0.5,
  footwear: 0.4,
  tops: 0.3,
  bottoms: 0.35,
  bags: 0.35,
  jewelry: 0.25,
  accessories: 0.15,
  activewear: 0.3,
  swimwear: 0.35,
  loungewear: 0.3,
}

export const REMIX_WEIGHTS: Readonly<Record<FactorName, number>> = {
  style_similarity: 0.35,
  user_preference: 0.25,
  attribute_match: 0.2,
  budget_fit: 0.1,
  popularity_prior: 0.1,
  social_signal: 0,
  trend_momentum: 0,
  brand_affinity: 0,
  diversity: 0,
  compatibility: 0,
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000
const pct = (x: number): string => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`

export function slotBudget(group: string, budget: number | null): number | null {
  if (budget === null || !Number.isFinite(budget) || budget <= 0) return null
  return Math.round(budget * (SLOT_SHARE_MAX[group] ?? 0.3))
}

/** Sizes the remixer can wear in `system`, resolving common aliases used by the web/sim layers. */
export function sizeFor(sizes: Partial<Record<string, string>>, system: string): string | null {
  const aliases: Record<string, string[]> = {
    alpha: ['alpha', 'top', 'tops', 'clothing'],
    'numeric-waist': ['numeric-waist', 'waist', 'bottom', 'bottoms'],
    'eu-shoe': ['eu-shoe', 'shoe', 'shoes', 'footwear'],
  }
  for (const key of aliases[system] ?? [system]) {
    const v = sizes[key]
    if (v) return v
  }
  return null
}

/**
 * Was: drop candidates that do not carry the remixer's size. `articles.csv` ships no size column,
 * so there is nothing to filter on and every candidate is kept. Restore this the day a size feed
 * exists — `sizeFor` above still resolves a person's size per system.
 */
export function filterBySize(candidates: RemixProduct[], _ctx: RemixContext): RemixProduct[] {
  return candidates
}

function factor(
  name: FactorName,
  value: number,
  evidence: string,
  weights: Readonly<Record<FactorName, number>> = REMIX_WEIGHTS,
): ExplanationFactor {
  const weight = weights[name]
  return {
    factor: name,
    weight,
    value: round3(value),
    contribution: round3(weight * value),
    evidence,
  }
}

export function scoreCandidate(
  cand: RemixProduct,
  slot: RemixSlot,
  ctx: RemixContext,
  maxPopularity: number,
): RankedItem {
  const factors: ExplanationFactor[] = []

  const style = Math.max(0, cosineRange(cand.styleVector, ctx.sourceVector, 0, 52))
  // The catalogue tags no aesthetics, so the explanation names none.
  const topTags: string[] = []
  factors.push(
    factor(
      'style_similarity',
      style,
      topTags.length > 0
        ? `${pct(style)} match with the source Look (shares ${topTags.join(', ')})`
        : `${pct(style)} match with the source Look's style vector`,
    ),
  )

  if (ctx.preferenceVector) {
    const pref = Math.max(0, cosineRange(cand.styleVector, ctx.preferenceVector, 0, 52))
    factors.push(factor('user_preference', pref, `${pct(pref)} close to your learned taste`))
  } else {
    factors.push(factor('user_preference', 0, 'no learned preference yet'))
  }

  const sameFamily = cand.colorFamily === slot.source.colorFamily
  const sameSub = cand.subcategory === slot.source.subcategory
  // Nothing to check a size against; see filterBySize above.
  const sizeOk = true
  const attr = (sameFamily ? 0.5 : 0) + (sameSub ? 0.5 : 0)
  const attrBits = [
    sameFamily
      ? `keeps the ${cand.colorFamily} of the source piece`
      : `shifts to ${cand.colorFamily}`,
    sameSub
      ? `same ${findSubcategory(cand.subcategory)?.name.toLowerCase() ?? cand.subcategory}`
      : `${findSubcategory(cand.subcategory)?.name.toLowerCase() ?? cand.subcategory} instead of ${findSubcategory(slot.source.subcategory)?.name.toLowerCase() ?? slot.source.subcategory}`,
    `${ctx.department} sizing`,
  ]
  factors.push(factor('attribute_match', attr, attrBits.join('; ')))

  const cap = slotBudget(slot.group, ctx.budget)
  let budgetValue = 1
  let budgetEvidence = `NT$${cand.price.toLocaleString('en-US')}, no budget set`
  if (cap !== null) {
    budgetValue = cand.price <= cap ? 1 : Math.max(0, 1 - (cand.price - cap) / cap)
    budgetEvidence =
      cand.price <= cap
        ? `NT$${cand.price.toLocaleString('en-US')} within the NT$${cap.toLocaleString('en-US')} slot share`
        : `NT$${cand.price.toLocaleString('en-US')} above the NT$${cap.toLocaleString('en-US')} slot share`
  }
  factors.push(factor('budget_fit', budgetValue, budgetEvidence))

  const pop = maxPopularity > 0 ? Math.max(0, Math.min(1, cand.popularity / maxPopularity)) : 0
  factors.push(
    factor(
      'popularity_prior',
      pop,
      // Sales, not reviews: the catalogue records what sold, never what anyone said about it.
      cand.salesCount > 0 ? `${cand.salesCount} sold` : 'new in',
    ),
  )

  const score = round3(factors.reduce((s, f) => s + f.contribution, 0))
  const summary = `${cand.brandName} ${cand.name} instead of ${slot.source.name}: ${attrBits[0]}, ${attrBits[1]}; ${pct(style)} style match.`
  return {
    product: cand,
    brandName: cand.brandName,
    score,
    explanation: { summary, factors },
    role: slot.role,
  }
}

/** Rank each slot's candidates (deduplicated across slots) and pick one per slot under the budget. */
export function chooseRemixItems(slots: RemixSlot[], ctx: RemixContext): RankedItem[] {
  const ranked = slots.map((slot) => {
    const cands = filterBySize(slot.candidates, ctx)
    const maxPop = cands.reduce((m, c) => Math.max(m, c.popularity), 0)
    return cands
      .map((c) => scoreCandidate(c, slot, ctx, maxPop))
      .toSorted((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id))
  })

  const chosenIndex = ranked.map(() => 0)
  const used = new Set<string>()
  const pick = (): Array<RankedItem | null> =>
    ranked.map((list, i) => list[chosenIndex[i] ?? 0] ?? null)

  // No product twice across slots.
  for (let i = 0; i < ranked.length; i++) {
    const list = ranked[i]!
    let k = 0
    while (k < list.length && used.has(list[k]!.product.id)) k++
    chosenIndex[i] = k
    const item = list[k]
    if (item) used.add(item.product.id)
  }

  // Budget: swap the priciest slot to its next cheaper option until the total fits (bounded).
  if (ctx.budget !== null && ctx.budget > 0) {
    for (let iter = 0; iter < 24; iter++) {
      const items = pick()
      const total = items.reduce((s, it) => s + (it?.product.price ?? 0), 0)
      if (total <= ctx.budget) break
      let bestSlot = -1
      let bestSaving = 0
      let bestK = -1
      items.forEach((it, i) => {
        if (!it) return
        const list = ranked[i]!
        // first cheaper, unused candidate further down this slot's ranking
        for (let k = (chosenIndex[i] ?? 0) + 1; k < list.length; k++) {
          const alt = list[k]!
          if (used.has(alt.product.id)) continue
          const saving = it.product.price - alt.product.price
          if (saving <= 0) continue
          if (saving > bestSaving) {
            bestSaving = saving
            bestSlot = i
            bestK = k
          }
          break
        }
      })
      if (bestSlot < 0) break
      const prev = items[bestSlot]
      if (prev) used.delete(prev.product.id)
      chosenIndex[bestSlot] = bestK
      const next = ranked[bestSlot]![bestK]
      if (next) used.add(next.product.id)
    }
  }

  return pick().filter((it): it is RankedItem => it !== null)
}

/** Source aesthetics still present in the result (by tag; falls back to vector mass ≥ .25). */
export function keptAesthetics(
  sourceAesthetics: readonly string[],
  items: readonly RankedItem[],
): string[] {
  if (items.length === 0) return [...sourceAesthetics]
  // The catalogue tags no aesthetics, so nothing narrows the source list by tag.
  const present = new Set<string>()
  const byTag = sourceAesthetics.filter((a) => present.has(a))
  if (byTag.length > 0) return byTag
  return sourceAesthetics.filter((a) => {
    const idx = aestheticIndex(a)
    if (idx < 0) return false
    const mean = items.reduce((s, it) => s + (it.product.styleVector[idx] ?? 0), 0) / items.length
    return mean >= 0.25
  })
}

/** Source palette hexes whose colour family survives in the result (falls back to the result's hexes). */
export function keptPalette(
  sourceProducts: readonly RemixProduct[],
  items: readonly RankedItem[],
): string[] {
  const families = new Set(items.map((it) => it.product.colorFamily))
  const out: string[] = []
  for (const p of sourceProducts) {
    const hex = normalizeHex(p.colorHex)
    if (hex && families.has(p.colorFamily) && !out.includes(hex)) out.push(hex)
  }
  if (out.length > 0) return out
  for (const it of items) {
    const hex = normalizeHex(it.product.colorHex)
    if (hex && !out.includes(hex)) out.push(hex)
  }
  return out
}

/** Outfit-level explanation: mean factors (Σ contribution = mean item score) + a kept/swapped summary. */
export function remixExplanation(
  slots: readonly RemixSlot[],
  items: readonly RankedItem[],
  kept: readonly string[],
  palette: readonly string[],
): Explanation {
  const names: FactorName[] = [
    'style_similarity',
    'user_preference',
    'attribute_match',
    'budget_fit',
    'popularity_prior',
  ]
  const factors: ExplanationFactor[] = names.map((name) => {
    const rows = items.map((it) => it.explanation.factors.find((f) => f.factor === name))
    const n = Math.max(1, rows.length)
    const value = rows.reduce((s, f) => s + (f?.value ?? 0), 0) / n
    const contribution = rows.reduce((s, f) => s + (f?.contribution ?? 0), 0) / n
    return {
      factor: name,
      weight: REMIX_WEIGHTS[name],
      value: round3(value),
      contribution: round3(contribution),
      evidence: rows[0]?.evidence ?? 'no candidates',
    }
  })
  const families = [...new Set(items.map((it) => it.product.colorFamily))]
  const swaps = items
    .map((it) => {
      const slot = slots.find((s) => s.role === it.role)
      if (!slot || slot.source.id === it.product.id) return null
      const from = findSubcategory(slot.source.subcategory)?.name ?? slot.source.subcategory
      const to = findSubcategory(it.product.subcategory)?.name ?? it.product.subcategory
      return from === to ? `${from} (new colour/brand)` : `${from} → ${to}`
    })
    .filter((s): s is string => s !== null)
  const keptText = [
    palette.length > 0 ? `palette ${families.join('/')}` : null,
    kept.length > 0
      ? `aesthetics ${kept.map((a) => findAesthetic(a)?.name ?? a).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(', ')
  const summary =
    items.length === 0
      ? 'No pieces could be matched for this Look yet.'
      : `Kept: ${keptText || 'the mood'}; swapped: ${swaps.length > 0 ? swaps.join(', ') : 'nothing'}.`
  return { summary, factors }
}
