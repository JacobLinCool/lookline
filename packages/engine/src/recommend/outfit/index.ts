/**
 * Outfit assembly (ENGINE_SPEC §3): per-slot retrieval and ranking, the beam solver and the
 * mapping of solver states to the contract `Outfit`.
 */
import { createHash } from 'node:crypto'
import {
  STYLE_BLOCKS,
  STYLE_DIMENSIONS,
  categoryGroupIndex,
  colorFamilyIndex,
} from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Season } from '@lookline/catalog'
import type { Department, Article } from '@lookline/db'
import type { Explanation, ExplanationFactor, Outfit, RankedItem } from '../../types'
import { colorFamilyLabel, subcategoryLabel } from '../aesthetics'
import { renderSummary, sortFactors } from '../explain'
import type { DetailedFactor } from '../explain'
import type { RankContext } from '../factors'
import { localeOf, priceTierTargetOf } from '../intent-view'
import type { EngineIntent, ResolvedBudget } from '../intent-view'
import { retrieveWithRelaxation } from '../retrieve'
import type { ChannelParams, RelaxStep, Retriever, RetrieveParams } from '../retrieve'
import { rank } from '../score'
import { RETRIEVAL_BLOCK_WEIGHTS, blockScale, clamp01, round } from '../vector'
import { compat, isUnscoredPair, referenceCompat } from './compat'
import { outfitSummary, pairingSentences } from './explain'
import { solveOutfits } from './solver'
import type { OutfitState, PlacedItem, SolverPlan, SolverSlot } from './solver'
import { OPTIONAL_SLOT_MIN_PRICE, orderSlots, planFor, slotShareMax } from './templates'
import type { Plan, SlotSpec } from './templates'

export interface PartnerOutfit {
  name: string
  styleVector: number[]
  colorHex: string
  colorFamily: string
}

export interface BuildOutfitsInput {
  intent: EngineIntent
  intentVector: number[]
  ctx: RankContext
  retriever: Retriever
  channels: ChannelParams
  /** Prefilters shared by every slot (vector, groups, subcategories and prices are set per slot). */
  baseParams: RetrieveParams
  department: Department
  budget: ResolvedBudget
  count: number
  plans?: Plan[]
  pinned?: PlacedItem[]
  partner?: PartnerOutfit | null
  perSlotLimit?: number
}

export interface BuildOutfitsResult {
  outfits: Outfit[]
  /** Union of the per-slot rankings (score desc), for the "also consider" list. */
  slotItems: RankedItem[]
  candidates: number
  relaxed: Set<RelaxStep>
  timings: Record<string, number>
}

const ACCESSORY_GROUPS: ReadonlySet<string> = new Set([
  'footwear',
  'bags',
  'accessories',
  'jewelry',
])
const NEUTRAL_PRIOR: ReadonlyArray<ColorFamily> = ['black', 'white', 'neutral', 'brown']

/** Intent vector with the slot's category one-hot; accessories blend the colour block with neutrals. */
export function slotVector(intentVector: readonly number[], slot: SlotSpec): number[] {
  const v = intentVector.slice(0, 64)
  while (v.length < STYLE_DIMENSIONS) v.push(0)
  for (let i = STYLE_BLOCKS.groups[0]; i < STYLE_BLOCKS.groups[1]; i++) v[i] = 0
  for (const g of slot.groups) v[categoryGroupIndex(g)] = 1
  if (slot.groups.every((g) => ACCESSORY_GROUPS.has(g))) {
    for (let i = 32; i < 44; i++) v[i] = 0.5 * (v[i] ?? 0)
    for (const f of NEUTRAL_PRIOR) {
      const idx = colorFamilyIndex(f)
      v[idx] = (v[idx] ?? 0) + 0.5 * 0.6
    }
  }
  return v
}

export function slotParams(input: BuildOutfitsInput, slot: SlotSpec): RetrieveParams {
  const total = input.budget.scope === 'total' && input.budget.max !== null
  let priceMax: number | null
  if (total) priceMax = Math.round(input.budget.max! * slotShareMax(slot.groups) * 1.3)
  else priceMax = input.baseParams.priceMax
  return {
    ...input.baseParams,
    vector: blockScale(slotVector(input.intentVector, slot), RETRIEVAL_BLOCK_WEIGHTS),
    categoryGroups: slot.groups,
    subcategories: slot.subcategories,
    priceMin: slot.required
      ? input.baseParams.priceMin
      : Math.max(OPTIONAL_SLOT_MIN_PRICE, input.baseParams.priceMin ?? 0),
    priceMax,
    limit: input.perSlotLimit ?? 120,
  }
}

function slotBudgetMax(input: BuildOutfitsInput, slot: SlotSpec): number | null {
  if (input.budget.scope === 'total' && input.budget.max !== null)
    return Math.round(input.budget.max * slotShareMax(slot.groups))
  return null
}

function sha1Id(ids: readonly string[]): string {
  return createHash('sha1')
    .update(ids.toSorted((a, b) => a.localeCompare(b)).join(','))
    .digest('hex')
    .slice(0, 12)
}

/** Mean of the items' A/C/X blocks (clamped) with the category groups unioned. */
export function outfitStyleVector(articles: readonly Article[]): number[] {
  const v = Array.from({ length: STYLE_DIMENSIONS }, () => 0)
  if (articles.length === 0) return v
  const groupsFrom = STYLE_BLOCKS.groups[0]
  for (const p of articles) {
    for (let i = 0; i < groupsFrom; i++)
      v[i] = (v[i] ?? 0) + (p.styleVector[i] ?? 0) / articles.length
    const g = categoryGroupIndex(p.categoryGroup as CategoryGroup)
    if (g >= groupsFrom) v[g] = 1
  }
  for (let i = 0; i < groupsFrom; i++) v[i] = clamp01(v[i] ?? 0)
  return v
}

function dominantFamily(articles: readonly Article[]): { family: string; hex: string } | null {
  const counts = new Map<string, { n: number; hex: string }>()
  for (const p of articles) {
    const c = counts.get(p.colorFamily) ?? { n: 0, hex: p.colorHex }
    c.n += 1
    counts.set(p.colorFamily, c)
  }
  let best: { family: string; hex: string; n: number } | null = null
  for (const [family, { n, hex }] of counts) if (!best || n > best.n) best = { family, hex, n }
  return best ? { family: best.family, hex: best.hex } : null
}

const ITEM_SCALE = 0.6
const COMPAT_WEIGHT = 0.35

/** Rescale an item's factors ×0.60 and append the in-outfit compatibility factor. */
export function outfitItem(
  placed: PlacedItem,
  others: readonly Article[],
  intent: EngineIntent,
  season: Season | null | undefined,
  partner: PartnerOutfit | null | undefined,
): RankedItem {
  const locale = localeOf(intent)
  const item = placed.item
  const scores: number[] = []
  let best: { p: Article; s: number } | null = null
  for (const o of others) {
    if (isUnscoredPair(item.product, o)) continue
    const s = compat(item.product, o, season).score
    scores.push(s)
    if (!best || s > best.s) best = { p: o, s }
  }
  let partnerScore: number | null = null
  if (partner) {
    partnerScore = referenceCompat(item.product, partner)
    scores.push(partnerScore)
  }
  const value = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  let evidence: string
  if (best) {
    const famZh = colorFamilyLabel(best.p.colorFamily, 'zh')
    const name =
      locale === 'zh'
        ? `${famZh.endsWith('色') ? famZh : `${famZh}色`}${subcategoryLabel(best.p.subcategory, 'zh')}`
        : `the ${colorFamilyLabel(best.p.colorFamily, 'en')} ${subcategoryLabel(best.p.subcategory, 'en')}`
    evidence =
      locale === 'zh' ? `與${name}很搭 (${round(best.s)})` : `pairs with ${name} (${round(best.s)})`
  } else {
    evidence = locale === 'zh' ? '單品搭配' : 'standalone piece'
  }
  if (partner && partnerScore !== null) {
    evidence +=
      locale === 'zh'
        ? `；與 ${partner.name} 的穿搭協調 (${round(partnerScore)})`
        : `; harmonises with ${partner.name}'s outfit (${round(partnerScore)})`
  }
  const rescaled: DetailedFactor[] = item.explanation.factors
    .filter((f) => f.factor !== 'compatibility')
    .map((f) => ({
      ...f,
      weight: f.weight * ITEM_SCALE,
      contribution: f.contribution * ITEM_SCALE,
      applicable: f.weight > 0,
    }))
  rescaled.push({
    factor: 'compatibility',
    weight: COMPAT_WEIGHT,
    value,
    contribution: COMPAT_WEIGHT * value,
    evidence,
    applicable: true,
  })
  const factors = sortFactors(rescaled)
  let score = 0
  for (const f of factors) score += f.contribution
  const explanation: Explanation = { summary: renderSummary(factors, locale), factors }
  return { product: item.product, brandName: item.brandName, score, explanation, role: placed.role }
}

/** Map a solver state to the contract `Outfit`. */
export function toOutfit(
  state: OutfitState,
  intent: EngineIntent,
  budget: ResolvedBudget,
  partner: PartnerOutfit | null | undefined,
  caveats: string[] = [],
): Outfit {
  const locale = localeOf(intent)
  const season = intent.season ?? null
  const articles = state.items.map((it) => it.item.product)
  const items = state.items.map((placed) =>
    outfitItem(
      placed,
      articles.filter((p) => p.id !== placed.item.product.id),
      intent,
      season,
      partner,
    ),
  )
  const total = articles.reduce((s, p) => s + p.price, 0)
  const pairs = pairingSentences(articles, locale, season)
  const compatibility =
    pairs.length > 0 ? pairs.reduce((s, p) => s + p.compat.score, 0) / pairs.length : 1
  const styleVector = outfitStyleVector(articles)
  const budgetMax = budget.scope === 'total' ? budget.max : null
  const util = budgetMax ? Math.min(1, total / budgetMax) : 1
  const meanStyle =
    items.reduce(
      (s, it) =>
        s + (it.explanation.factors.find((f) => f.factor === 'style_similarity')?.value ?? 0),
      0,
    ) / Math.max(1, items.length)
  const strongest = items
    .filter((_, i) => !state.items[i]?.pinned)
    .flatMap((it) =>
      it.explanation.factors.filter(
        (f) => f.factor !== 'compatibility' && f.factor !== 'diversity',
      ),
    )
    .toSorted((a, b) => b.contribution - a.contribution)[0]
  const summary = outfitSummary(
    {
      styleVector,
      total,
      budget: budgetMax,
      pairings: pairs,
      strongestItemReason: strongest && strongest.value >= 0.5 ? strongest.evidence : null,
      overBudget: state.overBudget || (budgetMax !== null && total > budgetMax),
      caveats,
    },
    locale,
  )
  const factors: ExplanationFactor[] = [
    {
      factor: 'compatibility',
      weight: COMPAT_WEIGHT,
      value: compatibility,
      contribution: COMPAT_WEIGHT * compatibility,
      evidence: pairs[0]?.text ?? (locale === 'zh' ? '單件' : 'single piece'),
    },
    {
      factor: 'budget_fit',
      weight: 0.05,
      value:
        budgetMax !== null && total > budgetMax
          ? clamp01(1 - (total - budgetMax) / (0.5 * budgetMax))
          : util,
      contribution: 0,
      evidence:
        budgetMax !== null
          ? locale === 'zh'
            ? `總價 NT$${total.toLocaleString('en-US')}，預算 NT$${budgetMax.toLocaleString('en-US')}`
            : `NT$${total.toLocaleString('en-US')} of NT$${budgetMax.toLocaleString('en-US')}`
          : locale === 'zh'
            ? `總價 NT$${total.toLocaleString('en-US')}`
            : `NT$${total.toLocaleString('en-US')} total`,
    },
    {
      factor: 'style_similarity',
      weight: ITEM_SCALE,
      value: meanStyle,
      contribution: ITEM_SCALE * meanStyle,
      evidence:
        locale === 'zh'
          ? `平均風格相似度 ${round(meanStyle)}`
          : `mean style similarity ${round(meanStyle)}`,
    },
  ]
  factors[1]!.contribution = factors[1]!.weight * factors[1]!.value
  const outfit: Outfit = {
    id: sha1Id(articles.map((p) => p.id)),
    items,
    total,
    compatibility,
    explanation: { summary, factors },
    styleVector,
  }
  if (budgetMax !== null) outfit.budget = budgetMax
  return outfit
}

export async function buildOutfits(input: BuildOutfitsInput): Promise<BuildOutfitsResult> {
  const timings: Record<string, number> = {}
  const t0 = performance.now()
  const season = input.intent.season ?? null
  const plans = input.plans ?? planFor(input.intent, { department: input.department, season })
  const pinnedGroups = new Set((input.pinned ?? []).map((p) => p.item.product.categoryGroup))
  // A pinned core piece (top, dress, …) only fits plans whose core has its slot; extras fit every plan.
  const coreHosts = plans.filter((p) =>
    p.slots.some((s) => s.core && s.groups.some((g) => pinnedGroups.has(g))),
  )
  const hostPlans = coreHosts.length > 0 ? coreHosts : plans
  const effectivePlans = hostPlans
    .map((p) => ({
      ...p,
      slots: p.slots.filter((s) => !s.groups.some((g) => pinnedGroups.has(g))),
    }))
    .filter((p) => p.slots.length > 0)

  // Unique slots across plans share one retrieval + ranking.
  const uniqueSlots = new Map<string, SlotSpec>()
  for (const p of effectivePlans)
    for (const s of p.slots) if (!uniqueSlots.has(s.key)) uniqueSlots.set(s.key, s)
  const anchorKey = effectivePlans[0]?.slots.find((s) => s.core)?.key ?? null
  const relaxed = new Set<RelaxStep>()
  let candidates = 0
  const ranked = new Map<string, RankedItem[]>()
  await Promise.all(
    [...uniqueSlots.values()].map(async (slot) => {
      const params = slotParams(input, slot)
      const result = await retrieveWithRelaxation(input.retriever, params, input.channels, {
        allowDropGroups: false,
        keepSubcategories: slot.strictHints === true,
      })
      for (const step of result.relaxed) relaxed.add(step)
      candidates += result.candidates.length
      // Template hints are soft: they count inside attribute_match (exact subcategory = 1, same
      // group = .5) and their relaxation is not surfaced as a caveat unless the user named them.
      const userNamed = input.intent.subcategories.length > 0
      const ctx: RankContext = {
        ...input.ctx,
        intent:
          slot.subcategories && !userNamed
            ? { ...input.intent, subcategories: slot.subcategories }
            : input.intent,
        slot: slot.groups[0],
        slotBudgetMax: slotBudgetMax(input, slot),
        relaxed: userNamed
          ? result.relaxed
          : result.relaxed.filter((step) => step !== 'subcategories'),
      }
      const items = rank(result.candidates, ctx, {
        limit: slot.key === anchorKey ? 40 : 25,
        lambda: 0.1,
      })
      ranked.set(
        slot.key,
        items.map((it) => ({ ...it, role: slot.role })),
      )
    }),
  )
  timings.outfitRetrieve = performance.now() - t0

  const t1 = performance.now()
  const solverPlans: SolverPlan[] = effectivePlans
    .map((p) => ({
      key: p.key,
      // A required extra slot with no affordable candidates (e.g. formal outerwear under a tight
      // budget) is demoted to optional; a core slot without candidates drops the plan.
      slots: orderSlots(p.slots).map<SolverSlot>((s) => {
        const slotCandidates = ranked.get(s.key) ?? []
        return {
          ...s,
          required: s.required && (s.core || slotCandidates.length > 0),
          candidates: slotCandidates,
        }
      }),
    }))
    .filter((p) => p.slots.filter((s) => s.core).every((s) => s.candidates.length > 0))

  const partner = input.partner ?? null
  let states = solveOutfits(solverPlans, {
    budgetMax: input.budget.scope === 'total' ? input.budget.max : null,
    strictness: input.budget.strictness,
    priceTierTarget: priceTierTargetOf(input.intent),
    intentSeason: season,
    returnK: input.count,
    pinned: input.pinned,
    itemBonus: partner ? (item) => 0.15 * referenceCompat(item.product, partner) : undefined,
  })

  const caveats: string[] = []
  if (partner && states.length > 0) {
    const locale = localeOf(input.intent)
    const kept = states.filter((s) => {
      const dom = dominantFamily(s.items.map((it) => it.item.product))
      if (!dom) return true
      const harmony = compat(
        { ...s.items[0]!.item.product, colorHex: dom.hex, colorFamily: dom.family },
        {
          ...s.items[0]!.item.product,
          colorHex: partner.colorHex,
          colorFamily: partner.colorFamily,
        },
        season,
      ).colour.score
      return harmony >= 0.65
    })
    if (kept.length > 0) states = kept
    else {
      states = states.slice(0, 1)
      caveats.push(
        locale === 'zh'
          ? `配色與 ${partner.name} 的穿搭不同`
          : `palette differs from ${partner.name}'s outfit`,
      )
    }
  }
  const outfits = states.map((s) => toOutfit(s, input.intent, input.budget, partner, caveats))
  timings.outfitSolve = performance.now() - t1

  const seen = new Set<string>()
  const slotItems: RankedItem[] = []
  for (const items of ranked.values()) {
    for (const it of items) {
      if (seen.has(it.product.id)) continue
      seen.add(it.product.id)
      slotItems.push(it)
    }
  }
  return {
    outfits,
    slotItems: slotItems.toSorted(
      (a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id),
    ),
    candidates,
    relaxed,
    timings,
  }
}
