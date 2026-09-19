/**
 * Ranking (ENGINE_SPEC §2.4): in-process hard filters, factor scoring with weight redistribution,
 * greedy MMR diversification (recorded as the negative `diversity` factor) and brand/subcategory
 * caps.
 */
import type { CategoryGroup } from '@lookline/catalog'
import type { Article } from '@lookline/db'
import type { FactorName, RankedItem } from '../types'
import { buildExplanation, toExplanationFactor } from './explain'
import type { DetailedFactor } from './explain'
import { compatibilityPlaceholder, diversity, evaluateFactors } from './factors'
import type { RankContext } from './factors'
import { localeOf, parseTokens } from './intent-view'
import type { Candidate } from './retrieve'
import { POSITIVE_FACTORS, redistribute } from './weights'

export interface RankOptions {
  limit?: number
  /** MMR λ; defaults to `ctx.weights.diversity`. */
  lambda?: number
  /** Size of the MMR pool (top-N by score). */
  pool?: number
  maxPerBrand?: number
  maxPerSubcategory?: number
  /** Window (positions) in which the caps apply. */
  capWindow?: number
}

export interface ScoredCandidate {
  candidate: Candidate
  score: number
  factors: DetailedFactor[]
}

/** In-process hard filters beyond SQL (§2.3): `text:`/`pattern:` avoids, sizes, kids mismatch. */
export function hardFilters(cands: readonly Candidate[], ctx: RankContext): Candidate[] {
  const avoid = parseTokens(ctx.intent.mustAvoid)
  const sizes = ctx.intent.sizes ?? {}
  const sizeEntries = Object.entries(sizes).filter(([, v]) => typeof v === 'string' && v.length > 0)
  const wantsKids = ctx.intent.department === 'kids' || ctx.intent.recipient?.department === 'kids'
  return cands.filter((c) => {
    const p = c.product
    if (avoid.text.length > 0) {
      const hay = `${p.name} ${p.description} ${c.brandName}`.toLowerCase()
      if (avoid.text.some((t) => hay.includes(t))) return false
    }
    if (avoid.patterns.length > 0 && avoid.patterns.includes(p.pattern)) return false
    if (avoid.aesthetics.length > 0 && avoid.aesthetics.some((a) => p.aesthetics[0] === a))
      return false
    for (const [system, value] of sizeEntries) {
      if (p.sizeSystem !== system) continue
      if (!p.sizes.includes(value)) return false
    }
    if (wantsKids !== (p.department === 'kids')) {
      if (wantsKids || p.department === 'kids') return false
    }
    return true
  })
}

/** Factors 1–8 with redistributed weights; `score = Σ contribution`. */
export function scoreCandidate(c: Candidate, ctx: RankContext): ScoredCandidate {
  const results = evaluateFactors(c, ctx)
  const applicable = new Set<FactorName>(results.filter((r) => r.applicable).map((r) => r.factor))
  const weights = redistribute(ctx.weights, applicable)
  const factors = results.map((r) => toExplanationFactor(r, weights[r.factor]))
  let score = 0
  for (const f of factors) score += f.contribution
  return { candidate: c, score, factors }
}

function tieBreak(a: ScoredCandidate, b: ScoredCandidate): number {
  return (
    b.score - a.score ||
    b.candidate.product.popularity - a.candidate.product.popularity ||
    a.candidate.product.id - b.candidate.product.id
  )
}

export interface MmrPick {
  scored: ScoredCandidate
  diversityFactor: DetailedFactor
  finalScore: number
}

/**
 * Greedy MMR over the top `pool`: pick `argmax score_i + λ·div_i` subject to ≤ maxPerBrand and
 * ≤ maxPerSubcategory within the first `capWindow` picks (caps are lifted when nothing else is
 * left). Items beyond the pool follow in score order without a diversity penalty.
 */
export function mmr(
  scored: readonly ScoredCandidate[],
  ctx: RankContext,
  opts: Required<
    Pick<
      RankOptions,
      'limit' | 'lambda' | 'pool' | 'maxPerBrand' | 'maxPerSubcategory' | 'capWindow'
    >
  >,
): MmrPick[] {
  const locale = localeOf(ctx.intent)
  const sorted = scored.toSorted(tieBreak)
  const pool = sorted.slice(0, opts.pool)
  const rest = sorted.slice(opts.pool)
  const picks: MmrPick[] = []
  const selected: Array<{ product: Article; position: number }> = []
  const brandCount = new Map<number, number>()
  const subCount = new Map<string, number>()
  const remaining = [...pool]
  while (picks.length < opts.limit && remaining.length > 0) {
    let bestIdx = -1
    let bestScore = -Infinity
    let bestFactor: DetailedFactor | null = null
    let bestUncapped = -1
    let bestUncappedScore = -Infinity
    let bestUncappedFactor: DetailedFactor | null = null
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]!
      const div = diversity(s.candidate, selected, locale)
      const factor = toExplanationFactor(div, opts.lambda)
      const total = s.score + factor.contribution
      const withinWindow = picks.length < opts.capWindow
      const brandOk =
        !withinWindow || (brandCount.get(s.candidate.product.brandId) ?? 0) < opts.maxPerBrand
      const subOk =
        !withinWindow ||
        (subCount.get(s.candidate.product.subcategory) ?? 0) < opts.maxPerSubcategory
      if (brandOk && subOk) {
        if (total > bestScore) {
          bestScore = total
          bestIdx = i
          bestFactor = factor
        }
      } else if (total > bestUncappedScore) {
        bestUncappedScore = total
        bestUncapped = i
        bestUncappedFactor = factor
      }
    }
    if (bestIdx < 0) {
      bestIdx = bestUncapped
      bestScore = bestUncappedScore
      bestFactor = bestUncappedFactor
    }
    if (bestIdx < 0 || !bestFactor) break
    const s = remaining.splice(bestIdx, 1)[0]!
    picks.push({ scored: s, diversityFactor: bestFactor, finalScore: bestScore })
    selected.push({ product: s.candidate.product, position: picks.length })
    brandCount.set(
      s.candidate.product.brandId,
      (brandCount.get(s.candidate.product.brandId) ?? 0) + 1,
    )
    subCount.set(
      s.candidate.product.subcategory,
      (subCount.get(s.candidate.product.subcategory) ?? 0) + 1,
    )
  }
  for (const s of rest) {
    if (picks.length >= opts.limit) break
    const factor = toExplanationFactor(diversity(s.candidate, [], locale), opts.lambda)
    picks.push({ scored: s, diversityFactor: factor, finalScore: s.score })
  }
  return picks
}

export function toRankedItem(pick: MmrPick, ctx: RankContext, slot?: CategoryGroup): RankedItem {
  const locale = localeOf(ctx.intent)
  const factors: DetailedFactor[] = [
    ...pick.scored.factors,
    pick.diversityFactor,
    toExplanationFactor(compatibilityPlaceholder(locale), 0),
  ]
  const explanation = buildExplanation(factors, locale, { relaxed: ctx.relaxed })
  const item: RankedItem = {
    product: pick.scored.candidate.product,
    brandName: pick.scored.candidate.brandName,
    score: pick.finalScore,
    explanation,
  }
  if (slot) item.role = slot
  return item
}

/** Hard filters → factors → sort → MMR → explanations. */
export function rank(
  cands: readonly Candidate[],
  ctx: RankContext,
  opts: RankOptions = {},
): RankedItem[] {
  const limit = opts.limit ?? 10
  const browse = ctx.intent.mode === 'browse'
  const kept = hardFilters(cands, ctx)
  const scored = kept.map((c) => scoreCandidate(c, ctx))
  const picks = mmr(scored, ctx, {
    limit,
    lambda: opts.lambda ?? ctx.weights.diversity,
    pool: opts.pool ?? 60,
    maxPerBrand: opts.maxPerBrand ?? (browse ? 3 : 2),
    maxPerSubcategory: opts.maxPerSubcategory ?? 4,
    capWindow: opts.capWindow ?? 20,
  })
  return picks.map((p) => toRankedItem(p, ctx))
}

export { POSITIVE_FACTORS }
