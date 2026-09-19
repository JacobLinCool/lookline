/**
 * The ten scoring factors (ENGINE_SPEC §2.3): one function per `FactorName`, each returning a
 * value in [0, 1] (diversity in [−1, 0]), an `applicable` flag and a bilingual evidence string.
 */
import {
  AESTHETICS,
  STYLE_BLOCKS,
  SUBCATEGORIES,
  axisIndex,
  colorFamilyIndex,
} from '@lookline/catalog'
import type { Axis, CategoryGroup, ColorFamily } from '@lookline/catalog'
import type { Department, Article } from '@lookline/db'
import type { FactorName } from '../types'
import {
  aestheticLabel,
  axisLabel,
  colorFamilyLabel,
  fitLabel,
  materialLabel,
  patternLabel,
  seasonLabel,
  subcategoryLabel,
} from './aesthetics'
import {
  axisTargetsOf,
  budgetOf,
  colorWeightsOf,
  isGift,
  localeOf,
  parseTokens,
  priceTierTargetOf,
} from './intent-view'
import type { EngineIntent, Locale } from './intent-view'
import { SOCIAL_KIND_WEIGHT, socialStrength } from './retrieve'
import type { Candidate, TrustedUser } from './retrieve'
import {
  PREFERENCE_BLOCK_WEIGHTS,
  SIMILARITY_BLOCK_WEIGHTS,
  blockCosine,
  clamp01,
  formatTwd,
  round,
} from './vector'

export interface BrandCounts {
  purchases: number
  saves: number
  dismisses: number
}

export interface RankUser {
  id: string
  department: Department
  eventCount: number
  giftEventCount: number
  preference: number[] | null
  giftPreference: number[] | null
  budgetHint: number | null
  brandCounts: Map<number, BrandCounts>
  trusted: TrustedUser[]
}

export interface TrendStat {
  momentum: number
  velocity: number
  emerging: boolean
  crossCluster: number
}

export interface RankContext {
  intent: EngineIntent
  intentVector: number[]
  now: Date
  seed: number
  user: RankUser | null
  /** Keys `aesthetic_category:<a>|<g>`, `aesthetic:<a>`, `color:<f>`, `category:<g>`. */
  trend: Map<string, TrendStat>
  popularityMax: number
  weights: Record<FactorName, number>
  /** Outfit slot being scored (per-slot budget share applies). */
  slot?: CategoryGroup
  /** Per-slot maximum price (outfit mode with a total budget). */
  slotBudgetMax?: number | null
  /** Retrieval relaxation steps applied (surfaced as a caveat). */
  relaxed?: string[]
}

export interface FactorResult {
  factor: FactorName
  value: number
  applicable: boolean
  evidence: string
  details?: Record<string, unknown>
}

const FIT_ADJACENT: ReadonlyArray<readonly [string, string]> = [
  ['slim', 'regular'],
  ['regular', 'relaxed'],
  ['relaxed', 'oversized'],
  ['fitted', 'slim'],
  ['skinny', 'slim'],
  ['straight', 'regular'],
  ['tapered', 'slim'],
  ['wide', 'relaxed'],
  ['boxy', 'oversized'],
]

function fitsAdjacent(a: string, b: string): boolean {
  return FIT_ADJACENT.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}
export function styleSimilarity(c: Candidate, ctx: RankContext): FactorResult {
  const locale = localeOf(ctx.intent)
  const raw = blockCosine(ctx.intentVector, c.product.styleVector, SIMILARITY_BLOCK_WEIGHTS)
  const bonus = c.channels.has('social') || c.channels.has('trend') ? 0.05 : 0
  const value = clamp01(raw + bonus)
  // The aesthetic block is gone, so the evidence names the colour it matched on, or the overall
  // similarity when nothing lines up. It named the shared style tags until the catalogue had none.
  const family = c.product.colorFamily as ColorFamily
  const intentColour = ctx.intentVector[colorFamilyIndex(family)] ?? 0
  const colourNamed = intentColour >= 0.4
  const evidence = colourNamed
    ? locale === 'zh'
      ? `${colorFamilyLabel(family, 'zh')}色符合，整體風格相似度 ${round(raw)}`
      : `colour ${colorFamilyLabel(family, 'en')}; overall style similarity ${round(raw)}`
    : locale === 'zh'
      ? `整體風格相似度 ${round(raw)}`
      : `overall style similarity ${round(raw)}`
  return {
    factor: 'style_similarity',
    value,
    applicable: true,
    evidence,
    details: { raw, bonus },
  }
}

export function attributeMatch(c: Candidate, ctx: RankContext): FactorResult {
  const intent = ctx.intent
  const locale = localeOf(intent)
  const p = c.product
  const checks: Array<{ w: number; v: number; label: string | null }> = []
  const passed: string[] = []

  if (intent.subcategories.length > 0) {
    let v = 0
    if (intent.subcategories.includes(p.subcategory)) v = 1
    else {
      const groups = new Set(intent.subcategories.map((s) => subcategoryGroup(s)).filter(Boolean))
      if (groups.has(p.categoryGroup)) v = 0.5
    }
    checks.push({ w: 0.3, v, label: v === 1 ? subcategoryLabel(p.subcategory, locale) : null })
  }

  const colourWeights = colorWeightsOf(intent)
  const wanted = Object.entries(colourWeights)
    .filter(([, w]) => (w ?? 0) >= 0.5)
    .map(([f]) => f as ColorFamily)
  if (wanted.length > 0) {
    // H&M files each colourway as its own article, so there is no second colour to fall back on.
    const v = wanted.includes(p.colorFamily as ColorFamily) ? 1 : 0
    checks.push({ w: 0.25, v, label: v > 0 ? colorFamilyLabel(p.colorFamily, locale) : null })
  }

  if (intent.materials.length > 0) {
    const v = intent.materials.includes(p.material) ? 1 : 0
    checks.push({ w: 0.15, v, label: v === 1 ? materialLabel(p.material, locale) : null })
  }
  if (intent.patterns.length > 0) {
    const v = intent.patterns.includes(p.pattern) ? 1 : 0
    checks.push({ w: 0.05, v, label: v === 1 ? patternLabel(p.pattern, locale) : null })
  }
  if (intent.season) {
    const v = p.seasons.includes(intent.season) || p.seasons.includes('all-season') ? 1 : 0.3
    const label =
      locale === 'zh'
        ? `${seasonLabel(intent.season, 'zh')}可穿`
        : `suits ${seasonLabel(intent.season, 'en')}`
    checks.push({ w: 0.1, v, label: v === 1 ? label : null })
  }
  if (intent.fits.length > 0) {
    const fit = p.fit
    let v = 0
    if (intent.fits.includes(fit)) v = 1
    else if (intent.fits.some((f) => fitsAdjacent(f, fit))) v = 0.5
    checks.push({ w: 0.1, v, label: v === 1 ? fitLabel(fit, locale) : null })
  }
  const axes = axisTargetsOf(intent)
  const axisKeys = Object.keys(axes)
  let axisPhrase: string | null = null
  if (axisKeys.length > 0) {
    let sum = 0
    let worst: { axis: string; diff: number } | null = null
    for (const axis of axisKeys) {
      const idx = axisIndexOf(axis)
      if (idx < 0) continue
      const diff = Math.abs((axes[axis] ?? 0.5) - (p.styleVector[idx] ?? 0))
      sum += diff
      if (!worst || diff > worst.diff) worst = { axis, diff }
    }
    const v = clamp01(1 - sum / axisKeys.length)
    checks.push({ w: 0.15, v, label: null })
    if (worst) {
      axisPhrase =
        locale === 'zh'
          ? `${axisLabel(worst.axis, 'zh')}差 ${round(worst.diff)}`
          : `${axisLabel(worst.axis, 'en')} within ${round(worst.diff)}`
    }
  }
  const have = parseTokens(intent.mustHave)
  const haveTokens = [
    ...have.attributes.map((a) => `attribute:${a}`),
    ...have.text.map((t) => `text:${t}`),
  ]
  if (haveTokens.length > 0) {
    const hay = `${p.name} ${p.description} ${c.brandName}`.toLowerCase()
    let found = 0
    for (const a of have.attributes) if (p.attributes?.[a] === true) found++
    for (const t of have.text) if (hay.includes(t)) found++
    const v = found / haveTokens.length
    checks.push({ w: 0.1, v, label: v > 0 ? (locale === 'zh' ? '必要條件' : 'must-haves') : null })
  }
  if (intent.giftCategoryPrior && intent.giftCategoryPrior.length > 0) {
    const v = intent.giftCategoryPrior.includes(p.categoryGroup as CategoryGroup) ? 1 : 0
    checks.push({
      w: 0.1,
      v,
      label: v === 1 ? (locale === 'zh' ? '適合送禮的品類' : 'gift-friendly category') : null,
    })
  }

  if (checks.length === 0) {
    return {
      factor: 'attribute_match',
      value: 0,
      applicable: false,
      evidence: locale === 'zh' ? '沒有指定屬性' : 'no attributes requested',
    }
  }
  let wsum = 0
  let vsum = 0
  for (const ch of checks) {
    wsum += ch.w
    vsum += ch.w * ch.v
    if (ch.label) passed.push(ch.label)
  }
  const value = clamp01(wsum > 0 ? vsum / wsum : 0)
  let evidence: string
  const nothing =
    value >= 0.5
      ? locale === 'zh'
        ? '屬性大致符合'
        : 'attributes roughly match'
      : locale === 'zh'
        ? '屬性沒有對上'
        : 'no attribute matched'
  if (locale === 'zh') {
    evidence = passed.length > 0 ? `符合：${passed.join('、')}` : nothing
    if (axisPhrase) evidence += `；${axisPhrase}`
  } else {
    evidence = passed.length > 0 ? `checks: ${passed.join(', ')}` : nothing
    if (axisPhrase) evidence += `; ${axisPhrase}`
  }
  return { factor: 'attribute_match', value, applicable: true, evidence, details: { checks } }
}

const SUB_GROUP: ReadonlyMap<string, string> = new Map(SUBCATEGORIES.map((s) => [s.slug, s.group]))
const subcategoryGroup = (slug: string): string | undefined => SUB_GROUP.get(slug)
const axisIndexOf = (axis: string): number => {
  const i = axisIndex(axis as Axis)
  const [from, to] = STYLE_BLOCKS.axes
  return i >= from && i < to ? i : -1
}

export function budgetFit(c: Candidate, ctx: RankContext): FactorResult {
  const intent = ctx.intent
  const locale = localeOf(intent)
  const budget = budgetOf(intent)
  const price = c.product.price
  const priceTierTarget = priceTierTargetOf(intent)
  let max: number | null = ctx.slotBudgetMax ?? null
  let min: number | null = null
  if (max === null) {
    if (budget.max !== null)
      max = budget.scope === 'total' && intent.mode === 'outfit' ? budget.perItemMax : budget.max
    if (budget.min !== null && budget.scope !== 'total') min = budget.min
  }
  const over = (m: number): number => Math.max(0, 1 - (price - m) / (0.5 * m))
  if (max !== null || min !== null) {
    let value: number
    let evidence: string
    if (max !== null && price > max) {
      value = over(max)
      const pct = Math.round(((price - max) / max) * 100)
      evidence =
        locale === 'zh'
          ? `${formatTwd(price)}，超出預算 ${pct}%`
          : `${formatTwd(price)}, ${pct}% over budget`
    } else if (min !== null && price < min) {
      value = Math.max(0, 1 - (min - price) / min)
      evidence =
        locale === 'zh'
          ? `${formatTwd(price)}，低於你想的 ${formatTwd(min)}`
          : `${formatTwd(price)}, below the ${formatTwd(min)} you had in mind`
    } else {
      value = 1
      evidence =
        max !== null
          ? locale === 'zh'
            ? `${formatTwd(price)}，在預算 ${formatTwd(max)} 內`
            : `${formatTwd(price)}, within ${formatTwd(max)}`
          : locale === 'zh'
            ? `${formatTwd(price)}，在你的價位以上`
            : `${formatTwd(price)}, at or above your floor`
    }
    return { factor: 'budget_fit', value, applicable: true, evidence, details: { min, max, price } }
  }
  if (priceTierTarget !== null) {
    const tier = c.product.styleVector[axisIndex('price-tier')] ?? 0.5
    const value = clamp01(1 - Math.abs(priceTierTarget - tier))
    return {
      factor: 'budget_fit',
      value,
      applicable: true,
      evidence:
        locale === 'zh'
          ? `${formatTwd(price)}，價位接近你的目標`
          : `${formatTwd(price)}, price tier close to your target`,
      details: { priceTierTarget, tier },
    }
  }
  const hint = ctx.user?.budgetHint ?? null
  if (hint !== null && hint > 0) {
    const value = price > hint ? over(hint) : 1
    return {
      factor: 'budget_fit',
      value,
      applicable: true,
      evidence:
        locale === 'zh'
          ? `${formatTwd(price)}，接近你平常的 ${formatTwd(hint)}`
          : `${formatTwd(price)}, around your usual ${formatTwd(hint)}`,
      details: { hint },
    }
  }
  return {
    factor: 'budget_fit',
    value: 0,
    applicable: false,
    evidence: locale === 'zh' ? '沒有預算條件' : 'no budget given',
  }
}

function topOverlapAesthetic(pref: readonly number[], product: readonly number[]): string | null {
  let best: { slug: string; s: number } | null = null
  for (const a of AESTHETICS) {
    const s = (pref[a.index] ?? 0) * (product[a.index] ?? 0)
    if (s > 0 && (!best || s > best.s)) best = { slug: a.slug, s }
  }
  return best?.slug ?? null
}

const notApplicable = (why: string): FactorResult => ({
  factor: 'user_preference',
  value: 0,
  applicable: false,
  evidence: why,
})

export function userPreference(c: Candidate, ctx: RankContext): FactorResult {
  const locale = localeOf(ctx.intent)
  const user = ctx.user
  if (!user) return notApplicable(locale === 'zh' ? '尚未登入' : 'not signed in')
  const gift = isGift(ctx.intent)
  if (gift && user.giftPreference && user.giftEventCount >= 3) {
    const value = clamp01(
      blockCosine(user.giftPreference, c.product.styleVector, PREFERENCE_BLOCK_WEIGHTS),
    )
    return {
      factor: 'user_preference',
      value,
      applicable: true,
      evidence:
        locale === 'zh'
          ? `跟你之前幫別人挑的方向一致（${user.giftEventCount} 次互動）`
          : `in line with what you picked for others before (${user.giftEventCount} signals)`,
    }
  }
  if (!user.preference || user.eventCount < 3) {
    return notApplicable(locale === 'zh' ? '還在學習你的喜好' : 'still learning your taste')
  }
  const cos = clamp01(blockCosine(user.preference, c.product.styleVector, PREFERENCE_BLOCK_WEIGHTS))
  if (gift) {
    const value = clamp01(0.5 * cos + 0.25)
    return {
      factor: 'user_preference',
      value,
      applicable: true,
      evidence:
        locale === 'zh'
          ? '你幫別人買的資料還不多，先參考通用範圍'
          : 'not much gift history yet — these reflect your own style',
    }
  }
  const slug = topOverlapAesthetic(user.preference, c.product.styleVector)
  const tag = slug ? aestheticLabel(slug, locale) : locale === 'zh' ? '這類' : 'similar'
  return {
    factor: 'user_preference',
    value: cos,
    applicable: true,
    evidence:
      locale === 'zh'
        ? `跟你常收藏的${tag}單品很像（${user.eventCount} 次互動）`
        : `close to the ${tag} pieces you saved (${user.eventCount} signals)`,
  }
}

function agePhrase(at: Date, now: Date, locale: Locale): string {
  const days = (now.getTime() - at.getTime()) / 86_400_000
  if (days <= 7) return locale === 'zh' ? '這週' : 'this week'
  if (days <= 14) return locale === 'zh' ? '上週' : 'last week'
  return locale === 'zh' ? '最近' : 'recently'
}

const KIND_EN: Readonly<Record<string, string>> = {
  look: 'wore this in a Look',
  purchase: 'bought this',
  save: 'saved this',
  advise: 'recommended this',
}
const KIND_ZH: Readonly<Record<string, string>> = {
  look: '用它做了 Look',
  purchase: '買了它',
  save: '收藏了它',
  advise: '推薦了它',
}

export function socialSignal(c: Candidate, ctx: RankContext): FactorResult {
  const locale = localeOf(ctx.intent)
  const user = ctx.user
  if (!user || user.trusted.length === 0) {
    return {
      factor: 'social_signal',
      value: 0,
      applicable: false,
      evidence: locale === 'zh' ? '還沒有信任的朋友' : 'no trusted people yet',
    }
  }
  const s = socialStrength(c.socialEvidence)
  const value = clamp01(1 - Math.exp(-s))
  if (c.socialEvidence.length === 0) {
    return {
      factor: 'social_signal',
      value,
      applicable: true,
      evidence:
        locale === 'zh'
          ? '你信任的人最近沒選過它'
          : 'none of the people you trust picked it recently',
      details: { s },
    }
  }
  const people = new Set(c.socialEvidence.map((e) => e.userId))
  const best = c.socialEvidence.toSorted(
    (a, b) => b.strength * SOCIAL_KIND_WEIGHT[b.kind] - a.strength * SOCIAL_KIND_WEIGHT[a.kind],
  )[0]!
  let evidence: string
  if (people.size > 1) {
    evidence =
      locale === 'zh'
        ? `${people.size} 位你信任品味的人最近都選了它`
        : `${people.size} people whose taste you trust used it recently`
  } else {
    const when = agePhrase(best.at, ctx.now, locale)
    evidence =
      locale === 'zh'
        ? `${best.displayName} ${when}${KIND_ZH[best.kind]}`
        : `${best.displayName} ${KIND_EN[best.kind]} ${when}`
  }
  return {
    factor: 'social_signal',
    value,
    applicable: true,
    evidence,
    details: { s, people: people.size },
  }
}

export function trendMomentum(c: Candidate, ctx: RankContext): FactorResult {
  const locale = localeOf(ctx.intent)
  if (ctx.trend.size === 0) {
    return {
      factor: 'trend_momentum',
      value: 0,
      applicable: false,
      evidence: locale === 'zh' ? '目前沒有趨勢資料' : 'no trend data yet',
    }
  }
  const p = c.product
  let best: { key: string; label: string; stat: TrendStat } | null = null
  const consider = (key: string, label: string): void => {
    const stat = ctx.trend.get(key)
    if (stat && (!best || stat.momentum > best.stat.momentum)) best = { key, label, stat }
  }
  // The trend index keys its finest dimension on the product type, the catalogue having no
  // aesthetic tags of its own.
  for (const tag of [p.subcategory]) {
    consider(
      `aesthetic_category:${tag}|${p.categoryGroup}`,
      `${aestheticLabel(tag, locale)}${locale === 'zh' ? '×' : ' '}${p.categoryGroup}`,
    )
    consider(`aesthetic:${tag}`, aestheticLabel(tag, locale))
  }
  consider(`color:${p.colorFamily}`, colorFamilyLabel(p.colorFamily, locale))
  consider(`category:${p.categoryGroup}`, p.categoryGroup)
  if (c.trendEvidence) {
    const key = `${c.trendEvidence.dimension}:${c.trendEvidence.key}`
    if (!ctx.trend.has(key)) {
      const stat: TrendStat = {
        momentum: c.trendEvidence.momentum,
        velocity: 0,
        emerging: c.trendEvidence.emerging,
        crossCluster: 0,
      }
      if (!best || stat.momentum > (best as { stat: TrendStat }).stat.momentum)
        best = { key, label: c.trendEvidence.key, stat }
    }
  }
  if (!best) {
    return {
      factor: 'trend_momentum',
      value: 0.3,
      applicable: true,
      evidence: locale === 'zh' ? '這個風格目前沒有趨勢訊號' : 'no trend signal for this style yet',
    }
  }
  const { label, stat } = best as { key: string; label: string; stat: TrendStat }
  const value = clamp01(stat.momentum / 100)
  const m = Math.round(stat.momentum)
  const evidence = stat.emerging
    ? locale === 'zh'
      ? `${label} 正在跨品味圈擴散（動能 ${m}）`
      : `${label} is spreading across taste circles (momentum ${m})`
    : locale === 'zh'
      ? `${label} 本週動能 ${m}`
      : `${label} momentum ${m} this week`
  return {
    factor: 'trend_momentum',
    value,
    applicable: true,
    evidence,
    details: { key: (best as { key: string }).key, stat },
  }
}

export function brandAffinity(c: Candidate, ctx: RankContext): FactorResult {
  const locale = localeOf(ctx.intent)
  if (!ctx.user) {
    return {
      factor: 'brand_affinity',
      value: 0,
      applicable: false,
      evidence: locale === 'zh' ? '尚未登入' : 'not signed in',
    }
  }
  const counts = ctx.user.brandCounts.get(c.product.brandId)
  if (!counts || counts.purchases + counts.saves + counts.dismisses === 0) {
    return {
      factor: 'brand_affinity',
      value: 0.4,
      applicable: true,
      evidence: locale === 'zh' ? `還沒買過 ${c.brandName}` : `no history with ${c.brandName} yet`,
    }
  }
  const value = clamp01(
    Math.min(1, 0.4 + 0.15 * counts.purchases + 0.05 * counts.saves - 0.2 * counts.dismisses),
  )
  let evidence: string
  if (counts.purchases > 0) {
    evidence =
      locale === 'zh'
        ? `你買過 ${c.brandName} ${counts.purchases} 次`
        : `you've bought ${c.brandName} ${counts.purchases} time${counts.purchases === 1 ? '' : 's'}`
  } else if (counts.saves > 0) {
    evidence =
      locale === 'zh'
        ? `你收藏過 ${c.brandName} ${counts.saves} 次`
        : `you saved ${c.brandName} ${counts.saves} time${counts.saves === 1 ? '' : 's'}`
  } else {
    evidence =
      locale === 'zh'
        ? `你略過 ${c.brandName} ${counts.dismisses} 次`
        : `you dismissed ${c.brandName} ${counts.dismisses} time${counts.dismisses === 1 ? '' : 's'}`
  }
  return { factor: 'brand_affinity', value, applicable: true, evidence, details: { ...counts } }
}

export function popularityPrior(c: Candidate, ctx: RankContext): FactorResult {
  const locale = localeOf(ctx.intent)
  const max = ctx.popularityMax > 0 ? ctx.popularityMax : 1
  const value = clamp01(Math.log1p(Math.max(0, c.product.popularity)) / Math.log1p(max))
  const evidence =
    value >= 0.6
      ? locale === 'zh'
        ? '最近很多人選'
        : 'a frequent pick lately'
      : locale === 'zh'
        ? '較少人選的款'
        : 'a quieter pick'
  return { factor: 'popularity_prior', value, applicable: true, evidence }
}

/** `sim = 0.5·cos_A + 0.3·[same subcategory] + 0.2·[same brand]`. */
export function itemSimilarity(a: Article, b: Article): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < 32; i++) {
    const x = a.styleVector[i] ?? 0
    const y = b.styleVector[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  const cosA = na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0
  return (
    0.5 * cosA +
    0.3 * (a.subcategory === b.subcategory ? 1 : 0) +
    0.2 * (a.brandId === b.brandId ? 1 : 0)
  )
}

/** Diversity during MMR: `−max_j sim(i, j)` over the already selected items (0 for the first). */
export function diversity(
  c: Candidate,
  selected: ReadonlyArray<{ product: Article; position: number }>,
  locale: Locale,
): FactorResult {
  if (selected.length === 0) {
    return {
      factor: 'diversity',
      value: 0,
      applicable: true,
      evidence: locale === 'zh' ? '與前面的單品不重複' : 'no overlap with earlier picks',
    }
  }
  let worst = { sim: -1, position: 0 }
  for (const s of selected) {
    const sim = itemSimilarity(c.product, s.product)
    if (sim > worst.sim) worst = { sim, position: s.position }
  }
  const value = -clamp01(worst.sim)
  return {
    factor: 'diversity',
    value,
    applicable: true,
    evidence:
      locale === 'zh'
        ? `與第 ${worst.position} 件相近 (${round(worst.sim)})`
        : `similar to #${worst.position} (${round(worst.sim)})`,
    details: { sim: worst.sim, position: worst.position },
  }
}

export function compatibilityPlaceholder(locale: Locale): FactorResult {
  return {
    factor: 'compatibility',
    value: 0,
    applicable: false,
    evidence: locale === 'zh' ? '非整套搭配' : 'not part of an outfit',
  }
}

/** Factors 1–8 for one candidate (diversity and compatibility are added by the ranker). */
export function evaluateFactors(c: Candidate, ctx: RankContext): FactorResult[] {
  return [
    styleSimilarity(c, ctx),
    attributeMatch(c, ctx),
    budgetFit(c, ctx),
    userPreference(c, ctx),
    socialSignal(c, ctx),
    trendMomentum(c, ctx),
    brandAffinity(c, ctx),
    popularityPrior(c, ctx),
  ]
}
