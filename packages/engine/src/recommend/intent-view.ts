/**
 * A normalised read of the contract `Intent` plus the optional engine fields ENGINE_SPEC §1.1
 * adds (budget strictness/scope, axisTargets, colorWeights, aestheticWeights, quantity,
 * excludeCategoryGroups, giftCategoryPrior, referenceRole). Nothing here depends on the intent
 * parser's internals: every field is optional and defaulted.
 */
import { CATEGORY_GROUPS, COLOR_FAMILIES } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Season } from '@lookline/catalog'
import type { Department } from '@lookline/db'
import type { Intent } from '../types'

export type BudgetStrictness = 'hard' | 'soft' | 'flexible'
export type BudgetScope = 'total' | 'per_item'

export interface IntentExtras {
  quantity?: number
  aestheticWeights?: Record<string, number>
  colorWeights?: Record<string, number>
  axisTargets?: Record<string, number>
  excludeCategoryGroups?: CategoryGroup[]
  referenceRole?: 'style-source' | 'coordinate-with'
  giftCategoryPrior?: CategoryGroup[]
  budget?: Intent['budget'] & { strictness?: BudgetStrictness; scope?: BudgetScope }
}

/** Contract intent with the engine's optional additions visible. */
export type EngineIntent = Intent & IntentExtras

export type Locale = 'zh' | 'en'

export function localeOf(intent: Pick<Intent, 'locale'>): Locale {
  return intent.locale === 'en' ? 'en' : 'zh'
}

export interface ResolvedBudget {
  min: number | null
  max: number | null
  strictness: BudgetStrictness
  scope: BudgetScope
  /** Per-item maximum used for price-tier targets and single-item budget_fit. */
  perItemMax: number | null
}

export function budgetOf(intent: EngineIntent): ResolvedBudget {
  const b = intent.budget
  const max = b?.max && b.max > 0 ? Math.round(b.max) : null
  const min = b?.min && b.min > 0 ? Math.round(b.min) : null
  const strictness: BudgetStrictness = b?.strictness ?? (max || min ? 'soft' : 'flexible')
  const scope: BudgetScope = b?.scope ?? (intent.mode === 'outfit' ? 'total' : 'per_item')
  let perItemMax: number | null = null
  if (max !== null) perItemMax = scope === 'total' ? Math.round(max * 0.45) : max
  else if (min !== null) perItemMax = Math.round(min * 1.5)
  return { min, max, strictness, scope, perItemMax }
}

/** §2.1 widening for retrieval: hard → max; soft → ×1.30; flexible → none; min ×0.85. */
export function widenedPrice(
  b: ResolvedBudget,
  max: number | null = b.max,
): {
  priceMin: number | null
  priceMax: number | null
} {
  const priceMin = b.min !== null ? Math.round(b.min * 0.85) : null
  if (max === null || b.strictness === 'flexible') return { priceMin, priceMax: null }
  return { priceMin, priceMax: b.strictness === 'hard' ? max : Math.round(max * 1.3) }
}

/** Aesthetic slug → weight in (0, 1]; falls back to a decaying ladder over `intent.aesthetics`. */
export function aestheticWeightsOf(intent: EngineIntent): Record<string, number> {
  const out: Record<string, number> = {}
  if (intent.aestheticWeights) {
    for (const [slug, w] of Object.entries(intent.aestheticWeights))
      if (w > 0) out[slug] = Math.min(1, w)
  }
  intent.aesthetics.forEach((slug, i) => {
    const ladder = i === 0 ? 1 : Math.max(0.3, 1 - 0.2 * i)
    out[slug] = Math.max(out[slug] ?? 0, ladder)
  })
  return out
}

/** Colour family → weight in (0, 1]; explicit families are 1.0, `colorWeights` merged by max. */
export function colorWeightsOf(intent: EngineIntent): Partial<Record<ColorFamily, number>> {
  const out: Partial<Record<ColorFamily, number>> = {}
  for (const f of intent.colorFamilies) if (isFamily(f)) out[f] = 1
  if (intent.colorWeights) {
    for (const [f, w] of Object.entries(intent.colorWeights)) {
      if (isFamily(f) && w > 0) out[f] = Math.max(out[f] ?? 0, Math.min(1, w))
    }
  }
  return out
}

export function isFamily(x: string): x is ColorFamily {
  return (COLOR_FAMILIES as readonly string[]).includes(x)
}

export function isGroup(x: string): x is CategoryGroup {
  return (CATEGORY_GROUPS as readonly string[]).includes(x)
}

export interface ConstraintTokens {
  colorFamilies: ColorFamily[]
  materials: string[]
  subcategories: string[]
  groups: CategoryGroup[]
  brands: string[]
  patterns: string[]
  /** `attribute:<key>` → jsonb key. */
  attributes: string[]
  text: string[]
  aesthetics: string[]
}

/** §1.2 `<slot>:<value>` tokens; bare tokens count as `text`. */
export function parseTokens(tokens: readonly string[] | undefined): ConstraintTokens {
  const out: ConstraintTokens = {
    colorFamilies: [],
    materials: [],
    subcategories: [],
    groups: [],
    brands: [],
    patterns: [],
    attributes: [],
    text: [],
    aesthetics: [],
  }
  for (const raw of tokens ?? []) {
    const t = raw.trim()
    if (!t) continue
    const i = t.indexOf(':')
    if (i <= 0) {
      out.text.push(t.toLowerCase())
      continue
    }
    const slot = t.slice(0, i).toLowerCase()
    const value = t
      .slice(i + 1)
      .trim()
      .toLowerCase()
    if (!value) continue
    switch (slot) {
      case 'color':
      case 'colour':
        if (isFamily(value)) out.colorFamilies.push(value)
        break
      case 'material':
        out.materials.push(value)
        break
      case 'subcategory':
        out.subcategories.push(value)
        break
      case 'group':
        if (isGroup(value)) out.groups.push(value)
        break
      case 'brand':
        out.brands.push(value)
        break
      case 'pattern':
        out.patterns.push(value)
        break
      case 'attribute':
        out.attributes.push(value)
        break
      case 'aesthetic':
        out.aesthetics.push(value)
        break
      default:
        out.text.push(value)
    }
  }
  return out
}

/** §2.1: resolved + unisex; kids alone; unresolved (or unisex) → women, men, unisex. */
export function resolveDepartments(
  intent: EngineIntent,
  userDepartment?: Department | null,
): Department[] {
  const resolved = intent.department ?? intent.recipient?.department ?? userDepartment ?? null
  if (resolved === 'kids') return ['kids']
  if (resolved === 'women' || resolved === 'men') return [resolved, 'unisex']
  return ['women', 'men', 'unisex']
}

export function resolvedDepartment(
  intent: EngineIntent,
  userDepartment?: Department | null,
): Department | null {
  return intent.department ?? intent.recipient?.department ?? userDepartment ?? null
}

export function seasonOf(intent: EngineIntent): Season | null {
  return intent.season ?? null
}

/** Axis targets excluding `price-tier` (which is budget-driven). */
export function axisTargetsOf(intent: EngineIntent): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(intent.axisTargets ?? {})) {
    if (k === 'price-tier') continue
    if (Number.isFinite(v)) out[k] = Math.min(1, Math.max(0, v))
  }
  return out
}

export function priceTierTargetOf(intent: EngineIntent): number | null {
  const t = intent.axisTargets?.['price-tier']
  return typeof t === 'number' && Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : null
}

export function isGift(intent: EngineIntent): boolean {
  return intent.recipient?.kind === 'other'
}
