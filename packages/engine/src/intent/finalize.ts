/**
 * Priors, axis composition, gift priors, clarifications and confidence (ENGINE_SPEC §1.4 steps
 * 9–11, §1.5, §1.7). Pure: re-runnable on any `IntentExt` (its `signals` carry the raw utterance
 * evidence), which is what `mergeIntent`, `mergeLlm` and `applyClarification` rely on.
 */
import type { CategoryGroup, ColorFamily, Season } from '@lookline/catalog'
import {
  AESTHETIC_AXIS_PRIOR,
  OCCASION_PRIORS,
  PRIOR_AXES,
  findEngineOccasion,
  type PriorAxis,
} from '../constants'
import { buildClarifications } from './clarify'
import type { IntentAssumptionExt, IntentContextExt, IntentExt } from './schema'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const round4 = (x: number): number => Math.round(x * 10000) / 10000
const round2 = (x: number): number => Math.round(x * 100) / 100
const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`

type Locale = IntentExt['locale']
const t = (locale: Locale, zh: string, en: string): string => (locale === 'en' ? en : zh)

/** §0.6 season → axis targets. */
export const SEASON_AXIS_TARGETS: Readonly<Record<Season, Partial<Record<PriorAxis, number>>>> = {
  spring: { warmth: 0.4, coverage: 0.5 },
  summer: { warmth: 0.15, coverage: 0.3 },
  autumn: { warmth: 0.6, coverage: 0.7 },
  winter: { warmth: 0.9, coverage: 0.9 },
  'all-season': {},
}

const GIFT_PRIORS: Readonly<Record<string, readonly CategoryGroup[]>> = {
  father: ['outerwear', 'accessories', 'footwear', 'tops'],
  mother: ['bags', 'accessories', 'jewelry', 'tops'],
  'partner:women': ['jewelry', 'bags', 'accessories', 'dresses'],
  'partner:men': ['accessories', 'tops', 'outerwear', 'footwear'],
  child: ['tops', 'outerwear', 'footwear', 'accessories'],
  other: ['accessories', 'bags', 'loungewear', 'tops'],
  hiking: ['outerwear', 'footwear', 'accessories', 'activewear'],
  practical: ['accessories', 'bags', 'outerwear', 'tops'],
}

const PRIOR_SOURCE = 'occasion_prior'

function sortWeights(weights: Record<string, number>): string[] {
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .toSorted((a, b) => b[1] - a[1])
    .map(([slug]) => slug)
}

export function giftCategoryPrior(
  intent: IntentExt,
  practical: boolean,
): CategoryGroup[] | undefined {
  if (
    intent.recipient.kind !== 'other' ||
    intent.categoryGroups.length > 0 ||
    intent.mode === 'outfit'
  )
    return undefined
  if (intent.occasion === 'hiking') return [...GIFT_PRIORS.hiking!]
  if (practical) return [...GIFT_PRIORS.practical!]
  const relation = intent.recipient.relation ?? 'unknown'
  const dept = intent.recipient.department ?? intent.department
  if (relation === 'partner' || relation === 'spouse') {
    return [...(dept === 'men' ? GIFT_PRIORS['partner:men']! : GIFT_PRIORS['partner:women']!)]
  }
  return [...(GIFT_PRIORS[relation] ?? GIFT_PRIORS.other!)]
}

/** §1.7 confidence over the filled slots. */
export function computeConfidence(intent: IntentExt): number {
  const filled: string[] = []
  const has = (slot: string, value: unknown): void => {
    if (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null)
      filled.push(slot)
  }
  has('mode', intent.mode)
  has('department', intent.department)
  has('categoryGroups', intent.categoryGroups)
  has('colorFamilies', intent.colorFamilies)
  has('aesthetics', intent.aesthetics)
  has('occasion', intent.occasion)
  has('season', intent.season)
  has('budget', intent.budget)
  has('recipient', intent.recipient)
  has('sizes', intent.sizes && Object.keys(intent.sizes).length > 0 ? intent.sizes : undefined)
  has('fits', intent.fits)
  has('materials', intent.materials)
  const conf = (slot: string): number => {
    const matches = intent.assumptions.filter(
      (a) => a.slot === slot || a.slot.startsWith(`${slot}.`),
    )
    if (matches.length === 0) return 1
    return Math.min(...matches.map((a) => a.confidence))
  }
  const mean =
    filled.length === 0 ? 0.5 : filled.reduce((s, slot) => s + conf(slot), 0) / filled.length
  const blocking = intent.clarifications.filter((c) => c.blocking).length
  let value = clamp(mean - 0.1 * blocking, 0.3, 0.98)
  if (intent.mode === 'browse') value = Math.min(value, 0.5)
  return round4(value)
}

/** Apply priors, compose axes, rebuild clarifications and confidence. Idempotent. */
export function finalize(input: IntentExt, ctx: IntentContextExt = {}): IntentExt {
  const intent = structuredClone(input)
  const signals = intent.signals ?? {}
  const locale = intent.locale
  const assumptions: IntentAssumptionExt[] = intent.assumptions.filter(
    (a) => a.source !== PRIOR_SOURCE && !a.slot.startsWith('axisTargets.'),
  )
  const occasion = intent.occasion ? findEngineOccasion(intent.occasion) : undefined
  const prior = intent.occasion ? OCCASION_PRIORS[intent.occasion] : undefined
  const occasionLabel = occasion
    ? t(locale, occasion.labelZh, occasion.labelEn)
    : (intent.occasion ?? '')

  // --- aesthetics -----------------------------------------------------------
  const avoidAesthetics = new Set(
    (signals.mustAvoid ?? []).filter((x) => x.startsWith('aesthetic:')).map((x) => x.slice(10)),
  )
  const weights: Record<string, number> = {}
  for (const [slug, w] of Object.entries(signals.aesthetics ?? {})) {
    if (!avoidAesthetics.has(slug)) weights[slug] = Math.max(weights[slug] ?? 0, w)
  }
  const fromPrior: string[] = []
  if (prior) {
    for (const [slug, w] of Object.entries(prior.aesthetics)) {
      if (avoidAesthetics.has(slug)) continue
      if (weights[slug] === undefined) fromPrior.push(slug)
      weights[slug] = Math.max(weights[slug] ?? 0, w)
    }
  }
  intent.aestheticWeights = weights
  intent.aesthetics = sortWeights(weights).slice(0, 6)
  if (fromPrior.length > 0) {
    assumptions.push({
      slot: 'aesthetics',
      value: fromPrior.join(', '),
      confidence: 0.6,
      reason: t(locale, `${occasionLabel}常見的風格`, `Styles common for ${occasionLabel}`),
      source: PRIOR_SOURCE,
    })
  }

  // --- colours ----------------------------------------------------------------
  const colorWeights: Record<string, number> = {}
  for (const [f, w] of Object.entries(signals.colorWeights ?? {}))
    colorWeights[f] = Math.max(colorWeights[f] ?? 0, w)
  for (const f of intent.colorFamilies) colorWeights[f] = 1
  let priorColours = false
  if (prior) {
    for (const [f, w] of Object.entries(prior.colors) as Array<[ColorFamily, number]>) {
      const scaled = round2(w * 0.7)
      if ((colorWeights[f] ?? 0) < scaled) {
        colorWeights[f] = scaled
        priorColours = true
      }
    }
  }
  intent.colorWeights = colorWeights
  if (priorColours) {
    assumptions.push({
      slot: 'colorWeights',
      value: Object.entries(prior?.colors ?? {})
        .map(([f]) => f)
        .join(', '),
      confidence: 0.6,
      reason: t(locale, `${occasionLabel}常見的顏色`, `Colours common for ${occasionLabel}`),
      source: PRIOR_SOURCE,
    })
  }

  // --- must-have / must-avoid ---------------------------------------------------
  const mustHave = Array.from(new Set(signals.mustHave ?? intent.mustHave))
  const mustAvoid = Array.from(new Set(signals.mustAvoid ?? intent.mustAvoid))
  if (prior) {
    for (const f of prior.avoid) {
      const token = `color:${f}`
      if (intent.colorFamilies.includes(f) || mustAvoid.includes(token)) continue
      mustAvoid.push(token)
      assumptions.push({
        slot: 'mustAvoid',
        value: token,
        confidence: 0.7,
        reason: t(locale, `${occasionLabel}通常避免${f}`, `${occasionLabel}: usually avoid ${f}`),
        source: PRIOR_SOURCE,
      })
    }
  }
  intent.mustHave = mustHave.slice(0, 8)
  intent.mustAvoid = mustAvoid.slice(0, 8)

  // --- axis targets --------------------------------------------------------------
  const hints: Record<string, number> = {}
  for (const [k, v] of Object.entries(signals.axisHints ?? {})) hints[k] = clamp(v, -1, 1)
  const season = intent.season ? SEASON_AXIS_TARGETS[intent.season] : {}
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  const aestheticMean = (axis: PriorAxis): number | undefined => {
    if (totalWeight === 0) return undefined
    let sum = 0
    for (const [slug, w] of Object.entries(weights))
      sum += w * (AESTHETIC_AXIS_PRIOR[slug]?.[axis] ?? 0.5)
    return sum / totalWeight
  }
  const axisTargets: Record<string, number> = {}
  for (const axis of PRIOR_AXES) {
    let base: number | undefined
    let baseSource = ''
    if (occasion && (axis === 'formality' || axis === 'coverage' || axis === 'boldness')) {
      base = occasion[axis]
      baseSource = occasionLabel
    } else if (season[axis] !== undefined) {
      base = season[axis]
      baseSource = intent.season ?? ''
    } else {
      const m = aestheticMean(axis)
      if (m !== undefined) {
        base = m
        baseSource = t(locale, '風格平均', 'aesthetic mean')
      }
    }
    const b = base ?? 0.5
    const hint = hints[axis] ?? 0
    axisTargets[axis] = round4(clamp01(b + 0.5 * hint))
    if (hint !== 0) {
      assumptions.push({
        slot: `axisTargets.${axis}`,
        value: String(axisTargets[axis]),
        confidence: 0.8,
        reason: `${baseSource || t(locale, '預設', 'default')} ${pct(b)}，${t(locale, '修飾詞', 'modifier')} ${hint > 0 ? '+' : '−'}${pct(Math.abs(hint) * 0.5)}`,
        source: 'utterance',
      })
    }
  }
  const priceHint = hints['price-tier'] ?? 0
  if (signals.priceTier !== undefined || priceHint !== 0) {
    axisTargets['price-tier'] = round4(clamp01((signals.priceTier ?? 0.45) + 0.5 * priceHint))
  }
  intent.axisTargets = axisTargets

  // --- gift prior ------------------------------------------------------------------
  const practical = (signals.mustHave ?? []).includes('flag:practical')
  intent.mustHave = intent.mustHave.filter((x) => x !== 'flag:practical')
  const gift = giftCategoryPrior(intent, practical)
  if (gift) {
    intent.giftCategoryPrior = gift
    assumptions.push({
      slot: 'categoryGroups',
      value: gift.join(', '),
      confidence: 0.5,
      reason: t(
        locale,
        `送${intent.recipient.label ?? intent.recipient.relation ?? '對方'}常見的品類`,
        `Common gift categories for ${intent.recipient.label ?? intent.recipient.relation ?? 'them'}`,
      ),
      source: PRIOR_SOURCE,
    })
  } else {
    delete intent.giftCategoryPrior
  }

  // --- budget scope default -----------------------------------------------------------
  if (intent.budget && !intent.budget.scope) {
    intent.budget.scope = intent.mode === 'outfit' ? 'total' : 'per_item'
  }

  // --- clarifications & confidence ----------------------------------------------------
  intent.assumptions = assumptions
  const kept = intent.clarifications.filter((c) => c.slot === 'referenceLookId')
  intent.clarifications = kept
  intent.clarifications = buildClarifications(intent)
  intent.confidence = computeConfidence(intent)
  void ctx
  return intent
}
