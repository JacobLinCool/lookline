/**
 * Dialogue state (ENGINE_SPEC §1.8): follow-up detection, `mergeIntent(prev, next)` and
 * `applyClarification`.
 */
import { CATEGORY_GROUPS, COLORS, COLOR_FAMILIES, LEXICON, SUBCATEGORIES } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Department } from '@lookline/catalog'
import { FOLLOW_UP_PHRASES, OCCASIONS, ONLY_PATTERNS, RECOLOR_PATTERNS } from '../constants'
import type { FollowUpKind } from '../constants'
import { isClarificationAnswer } from './clarify'
import { finalize } from './finalize'
import { normalizeText } from './normalize'
import type { Intent } from '../types'
import type { IntentContextExt, IntentExt } from './schema'

type Locale = IntentExt['locale']
const t = (locale: Locale, zh: string, en: string): string => (locale === 'en' ? en : zh)

export interface FollowUpEffects {
  kinds: FollowUpKind[]
  colorFamily?: ColorFamily
  group?: CategoryGroup
}

const SUB_GROUP = new Map(SUBCATEGORIES.map((s) => [s.slug, s.group]))
const COLOR_FAMILY_OF = new Map(COLORS.map((c) => [c.slug, c.family]))

function resolveColorFamily(phrase: string): ColorFamily | undefined {
  const p = phrase.trim().toLowerCase()
  for (const e of LEXICON.colorFamilies)
    if (e.terms.some((term) => p === term || p.includes(term))) return e.value as ColorFamily
  for (const e of LEXICON.colors) {
    if (e.terms.some((term) => p === term || p.includes(term))) return COLOR_FAMILY_OF.get(e.value)
  }
  return undefined
}

function resolveGroup(phrase: string): CategoryGroup | undefined {
  const p = phrase.trim().toLowerCase()
  for (const e of LEXICON.categoryGroups)
    if (e.terms.some((term) => p === term || p.includes(term))) return e.value as CategoryGroup
  for (const e of LEXICON.subcategories)
    if (e.terms.some((term) => p === term || p.includes(term))) return SUB_GROUP.get(e.value)
  return undefined
}

/** Follow-up phrases found in `utterance` (§1.8 table). */
export function detectFollowUp(utterance: string): FollowUpEffects {
  const { text } = normalizeText(utterance)
  const kinds: FollowUpKind[] = []
  for (const p of FOLLOW_UP_PHRASES) {
    if (p.terms.some((term) => text.includes(term)) && !kinds.includes(p.kind)) kinds.push(p.kind)
  }
  let colorFamily: ColorFamily | undefined
  for (const re of RECOLOR_PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    const family = resolveColorFamily(m[1] ?? '')
    if (family) {
      colorFamily = family
      break
    }
  }
  if (!colorFamily) {
    const short = text.replace(/[，,。.\s]/g, '')
    if (short.length <= 6) {
      const family = resolveColorFamily(short.replace(/(的|色的)$/, ''))
      if (family && /色|colour|color/.test(short)) colorFamily = family
    }
  }
  if (colorFamily && !kinds.includes('recolor')) kinds.push('recolor')
  let group: CategoryGroup | undefined
  for (const re of ONLY_PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    group = resolveGroup(m[1] ?? '')
    if (group) break
  }
  if (group && !kinds.includes('only-group')) kinds.push('only-group')
  return { kinds, colorFamily, group }
}

/** True when `utterance` is a follow-up to `prev` (phrase match or clarification answer). */
export function isFollowUp(utterance: string, prev: Intent | null | undefined): boolean {
  if (!prev) return false
  if (isClarificationAnswer(utterance, prev)) return true
  const fx = detectFollowUp(utterance)
  return fx.kinds.length > 0
}

const ARRAY_SLOTS = [
  'categoryGroups',
  'subcategories',
  'colors',
  'colorFamilies',
  'materials',
  'patterns',
  'fits',
] as const

const roundTo10 = (x: number): number => Math.max(10, Math.round(x / 10) * 10)
const isDept = (v: string): v is Department => ['women', 'men', 'unisex', 'kids'].includes(v)

/**
 * Merge a follow-up parse into the previous intent: phrase effects first, then every slot `next`
 * filled explicitly replaces `prev`'s; everything else is kept; priors/clarifications/confidence are
 * recomputed by `finalize`.
 */
export function mergeIntent(prev: Intent, next: Intent, ctx: IntentContextExt = {}): IntentExt {
  const merged = structuredClone(prev) as IntentExt
  const n = next as IntentExt
  const locale = n.locale
  merged.utterance = n.utterance
  merged.locale = n.locale
  merged.previousUtterance = prev.utterance
  merged.parser = n.parser ?? merged.parser
  const signals = { ...merged.signals }
  signals.axisHints = { ...signals.axisHints }
  signals.explicitSlots = [...(signals.explicitSlots ?? [])]
  const explicitNext = new Set(n.signals?.explicitSlots ?? [])
  const assumptions = [...merged.assumptions]
  const dropAssumptions = (slot: string): void => {
    for (let i = assumptions.length - 1; i >= 0; i--) {
      const a = assumptions[i]!
      if (a.slot === slot || a.slot.startsWith(`${slot}.`)) assumptions.splice(i, 1)
    }
  }
  const takeAssumptions = (slot: string): void => {
    for (const a of n.assumptions)
      if (a.slot === slot || a.slot.startsWith(`${slot}.`)) assumptions.push(a)
  }

  // phrase effects
  const fx = detectFollowUp(n.utterance)
  for (const kind of fx.kinds) {
    switch (kind) {
      case 'cheaper':
        if (merged.budget?.max !== undefined) {
          merged.budget = { ...merged.budget, max: roundTo10(merged.budget.max * 0.8) }
          dropAssumptions('budget')
          assumptions.push({
            slot: 'budget',
            value: t(locale, '上限 ×0.8', 'ceiling ×0.8'),
            confidence: 0.8,
            reason: t(locale, '「再便宜一點」', '"cheaper"'),
            source: 'utterance',
          })
        } else {
          signals.axisHints['price-tier'] = (signals.axisHints['price-tier'] ?? 0) - 0.4
        }
        break
      case 'pricier':
        if (merged.budget?.max !== undefined) {
          merged.budget = { ...merged.budget, max: roundTo10(merged.budget.max * 1.3) }
          dropAssumptions('budget')
          assumptions.push({
            slot: 'budget',
            value: t(locale, '上限 ×1.3', 'ceiling ×1.3'),
            confidence: 0.8,
            reason: t(locale, '「可以再貴一點」', '"can go higher"'),
            source: 'utterance',
          })
        } else {
          signals.axisHints['price-tier'] = (signals.axisHints['price-tier'] ?? 0) + 0.4
        }
        break
      case 'recolor':
        if (fx.colorFamily) {
          merged.colorFamilies = [fx.colorFamily]
          merged.colors = []
          signals.colorWeights = { [fx.colorFamily]: 1 }
          signals.mustAvoid = (signals.mustAvoid ?? []).filter(
            (x) => x !== `color:${fx.colorFamily}`,
          )
          explicitNext.delete('colorFamilies')
          explicitNext.delete('colors')
          if (!signals.explicitSlots.includes('colorFamilies'))
            signals.explicitSlots.push('colorFamilies')
        }
        break
      case 'more-formal':
        signals.axisHints.formality = (signals.axisHints.formality ?? 0) + 0.3
        break
      case 'more-casual':
        signals.axisHints.formality = (signals.axisHints.formality ?? 0) - 0.3
        break
      case 'only-group':
        if (fx.group) {
          merged.mode = 'single'
          merged.categoryGroups = [fx.group]
          merged.subcategories = []
          explicitNext.delete('categoryGroups')
          explicitNext.delete('subcategories')
          explicitNext.delete('mode')
          dropAssumptions('mode')
        }
        break
      case 'whole-outfit':
        merged.mode = 'outfit'
        dropAssumptions('mode')
        explicitNext.delete('mode')
        break
      case 'for-me':
        merged.recipient = { kind: 'self' }
        merged.department = ctx.user?.department ?? merged.department
        dropAssumptions('recipient')
        dropAssumptions('department')
        if (ctx.user?.department) {
          assumptions.push({
            slot: 'department',
            value: ctx.user.department,
            confidence: 0.9,
            reason: t(locale, '依你的個人資料', 'From your profile'),
            source: 'context',
          })
        }
        explicitNext.delete('recipient')
        explicitNext.delete('department')
        break
      case 'different':
      case 'not-this':
        break
      default:
        break
    }
  }

  // explicit slots of `next` replace prev's
  for (const slot of ARRAY_SLOTS) {
    if (explicitNext.has(slot) && n[slot].length > 0) {
      ;(merged as Record<string, unknown>)[slot] = [...n[slot]]
      dropAssumptions(slot)
      takeAssumptions(slot)
      if (!signals.explicitSlots.includes(slot)) signals.explicitSlots.push(slot)
      if (slot === 'colorFamilies') {
        signals.colorWeights = {}
        signals.mustAvoid = (signals.mustAvoid ?? []).filter(
          (x) => !n.colorFamilies.includes(x.slice(6) as ColorFamily),
        )
      }
    }
  }
  if (explicitNext.has('aesthetics') && n.signals?.aesthetics) {
    signals.aesthetics = { ...n.signals.aesthetics }
    dropAssumptions('aesthetics')
  }
  if (explicitNext.has('occasion') && n.occasion) {
    merged.occasion = n.occasion
    dropAssumptions('occasion')
    takeAssumptions('occasion')
  }
  if (explicitNext.has('season') && n.season) {
    merged.season = n.season
    dropAssumptions('season')
  }
  if (explicitNext.has('budget') && n.budget) {
    merged.budget = { ...n.budget }
    dropAssumptions('budget')
    takeAssumptions('budget')
  }
  if (explicitNext.has('quantity') && n.quantity !== undefined) merged.quantity = n.quantity
  if (explicitNext.has('sizes') && n.sizes) merged.sizes = { ...merged.sizes, ...n.sizes }
  if (explicitNext.has('mode')) {
    merged.mode = n.mode
    dropAssumptions('mode')
  }
  if (explicitNext.has('recipient')) {
    merged.recipient = { ...n.recipient }
    dropAssumptions('recipient')
    takeAssumptions('recipient')
    if (n.department) {
      merged.department = n.department
      dropAssumptions('department')
      takeAssumptions('department')
    }
  }
  if (explicitNext.has('department') && n.department) {
    merged.department = n.department
    dropAssumptions('department')
    takeAssumptions('department')
  }
  if (n.signals?.axisHints) {
    for (const [k, v] of Object.entries(n.signals.axisHints)) {
      if (v !== 0) signals.axisHints[k] = (signals.axisHints[k] ?? 0) + v
    }
  }
  const nextAvoid = (n.signals?.mustAvoid ?? []).filter((x) => !x.startsWith('aesthetic:') || true)
  signals.mustAvoid = Array.from(new Set([...(signals.mustAvoid ?? []), ...nextAvoid]))
  signals.mustHave = Array.from(
    new Set([...(signals.mustHave ?? []), ...(n.signals?.mustHave ?? [])]),
  )
  if (n.referenceCardId) {
    merged.referenceCardId = n.referenceCardId
    merged.referenceHandle = n.referenceHandle
    merged.referenceRole = n.referenceRole
    dropAssumptions('referenceCardId')
    takeAssumptions('referenceCardId')
  }
  if (n.vibe && n.mode !== 'browse') merged.vibe = n.vibe
  merged.signals = signals
  merged.assumptions = assumptions
  merged.clarifications = merged.clarifications.filter((c) => c.slot === 'referenceCardId')
  return finalize(merged, ctx)
}

/**
 * Sets `slot` to `value`, removes the clarification, replaces assumptions on that slot with
 * confidence 1 (source `utterance`), and re-runs `finalize`.
 */
export function applyClarification(
  intent: Intent,
  slot: string,
  value: string,
  ctx: IntentContextExt = {},
): IntentExt {
  const next = structuredClone(intent) as IntentExt
  next.signals = { ...next.signals }
  const explicit = new Set(next.signals.explicitSlots ?? [])
  switch (slot) {
    case 'department':
      if (isDept(value)) next.department = value
      explicit.add('department')
      break
    case 'recipient.department':
      if (isDept(value)) {
        next.recipient = { ...next.recipient, department: value }
        next.department = value
      }
      explicit.add('department')
      break
    case 'categoryGroups':
      if (CATEGORY_GROUPS.includes(value as CategoryGroup))
        next.categoryGroups = [value as CategoryGroup]
      explicit.add('categoryGroups')
      break
    case 'budget.max': {
      const max = Number(value)
      if (Number.isFinite(max) && max > 0) {
        next.budget = {
          ...(next.budget ?? { currency: 'TWD' }),
          max,
          strictness: next.budget?.strictness ?? 'soft',
        }
        explicit.add('budget')
      } else {
        next.budget = { ...(next.budget ?? { currency: 'TWD' }), strictness: 'flexible' }
      }
      break
    }
    case 'budget.currency': {
      const amount = next.budget?.originalAmount
      if (next.budget && amount !== undefined) {
        const code = value.toUpperCase()
        const rate = code === 'USD' ? 32 : 1
        const factor = next.budget.max !== undefined && next.budget.min !== undefined ? null : rate
        if (factor !== null) {
          const converted = Math.round(amount * rate)
          next.budget = { ...next.budget, originalCurrency: code }
          if (next.budget.max !== undefined) next.budget.max = converted
          else if (next.budget.min !== undefined) next.budget.min = converted
        }
      }
      break
    }
    case 'sizes.alpha':
      next.sizes = { ...next.sizes, alpha: value.toUpperCase() }
      explicit.add('sizes')
      break
    case 'occasion':
      if (OCCASIONS.some((o) => o.slug === value)) next.occasion = value
      explicit.add('occasion')
      if (next.mode === 'browse') {
        next.mode = 'outfit'
        next.assumptions = next.assumptions.filter((a) => a.slot !== 'mode')
      }
      break
    case 'referenceCardId':
      next.referenceCardId = value
      break
    default:
      break
  }
  next.signals.explicitSlots = Array.from(explicit)
  next.clarifications = next.clarifications.filter((c) => c.slot !== slot)
  next.assumptions = next.assumptions.filter(
    (a) =>
      a.slot !== slot &&
      !(slot === 'recipient.department' && a.slot === 'department') &&
      !(slot === 'department' && a.slot === 'recipient.department'),
  )
  next.assumptions.push({
    slot,
    value,
    confidence: 1,
    reason: t(next.locale, '你已回答', 'You answered'),
    source: 'utterance',
  })
  return finalize(next, ctx)
}

export { COLOR_FAMILIES }
