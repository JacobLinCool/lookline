/**
 * Engine 01, stage 1 — closed-option decisions in front of the generative parser.
 *
 * REALTIME_FILTER_SPEC's capability routing already sends known categories, colours, aesthetics
 * and department to Jev; this applies the same routing to the sentence parser. Nearly every
 * description is a set of catalog attributes, and Jev decides those from the catalog's own
 * vocabulary in roughly a third of a second — well inside the text budget the generative parser
 * cannot meet. `routeIntent` names the sentences it structurally cannot finish; only those escalate.
 *
 * Measured over ENGINE_SPEC §1.10 (F1–F17): median 347 ms, max 891 ms, and the two signals below
 * separate the escalating sentences from the rest. Span coverage does not — Jev answers questions
 * without reporting which words produced each answer, so everything it resolves semantically looks
 * uncovered. `unresolved` is likewise not an escalation signal: it fires more often on the
 * sentences Jev handles completely.
 */
import {
  AXES,
  CATEGORY_GROUPS,
  COLOR_FAMILIES,
  DEPARTMENTS,
  SEASONS,
  SUBCATEGORIES,
  type CategoryGroup,
  type ColorFamily,
  type Department,
  type Season,
} from '@lookline/catalog'
import { MIN_PREDICATE_PROBABILITY, type SearchIntent } from '../decisions/search-intent'
import type { IntentContextExt, IntentExt } from './schema'

/** Headroom over the 891 ms worst case measured across the F-scenarios. */
export const INTENT_DECISION_TIMEOUT_MS = 1_800

/** Below this the sentence names no garment type Jev recognises (F2, F3, F14, F16). */
export const MIN_TYPE_RELEVANCE = 0.5

/** A constraint Jev considers this irrelevant to the sentence is noise, not a filter. */
const MIN_CONSTRAINT_RELEVANCE = 0.5

/** A garment type below this is a guess, not a reading of the sentence. */
const MIN_TYPE_PRIOR = 0.3

export interface DecisionEnv {
  TYPESAFE_API_KEY?: string
}

/** No key means the decision stage is not deployed, which is a configuration, not a failure. */
export function decisionsConfigured(env: DecisionEnv = process.env as DecisionEnv): boolean {
  return Boolean(env.TYPESAFE_API_KEY)
}

export type RouteReason =
  | 'decision-failed'
  | 'reference'
  | 'recipient'
  | 'type-unclear'
  | 'no-catalog-term'

export interface IntentRoute {
  escalate: boolean
  /** Why, for `intent_sessions` and the lab; null when the decision stands on its own. */
  reason: RouteReason | null
}

/**
 * Which sentences the attribute decision cannot finish.
 *
 * The first two come from the deterministic detectors, because neither is a product attribute and
 * no amount of catalog vocabulary will produce them: `reference.ts` for 「跟 Jacob 搭的」 and
 * `recipient.ts` for 「幫我爸買」. The last two come from Jev itself — a sentence with no
 * recognised garment type or no literal catalog term is not describing a product.
 */
export function routeIntent(lex: IntentExt, search: SearchIntent | null): IntentRoute {
  if (!search) return { escalate: true, reason: 'decision-failed' }
  if (lex.referenceHandle || lex.referenceCardId) return { escalate: true, reason: 'reference' }
  if (lex.recipient.kind === 'other') return { escalate: true, reason: 'recipient' }
  if (search.typeRelevance < MIN_TYPE_RELEVANCE) return { escalate: true, reason: 'type-unclear' }
  if (search.candidateCount === 0) return { escalate: true, reason: 'no-catalog-term' }
  return { escalate: false, reason: null }
}

/** `mustAvoid` slots `parseTokens` understands; anything else would degrade to a text match. */
const AVOID_SLOT: Record<string, string> = {
  colorFamily: 'color',
  material: 'material',
  pattern: 'pattern',
  subcategory: 'subcategory',
  categoryGroup: 'group',
  aesthetic: 'aesthetic',
}

const SUBCATEGORY_GROUP = new Map(SUBCATEGORIES.map((s) => [s.slug, s.group]))

const addUnique = (target: string[], value: string, cap: number): void => {
  if (!target.includes(value) && target.length < cap) target.push(value)
}

/**
 * Fold a decision into the lexical intent. The lexicon wins wherever it spoke explicitly: it read
 * the actual words, and its budget parse is the only one allowed to produce numbers (the decision
 * selects among candidates, it never invents them). Jev fills what the sentence left open.
 */
export function mergeJev(
  lex: IntentExt,
  search: SearchIntent,
  _ctx: IntentContextExt = {},
): IntentExt {
  const merged = structuredClone(lex)
  const signals = { ...merged.signals }
  const explicit = new Set(signals.explicitSlots ?? [])

  const positive = new Map<string, string[]>()
  const avoid = [...merged.mustAvoid]
  for (const predicate of search.predicates) {
    if (predicate.probability < MIN_PREDICATE_PROBABILITY) continue
    if (predicate.polarity === 'negative') {
      const slot = AVOID_SLOT[predicate.attribute]
      if (slot) addUnique(avoid, `${slot}:${predicate.value}`, 8)
      continue
    }
    const values = positive.get(predicate.attribute) ?? []
    if (!values.includes(predicate.value)) values.push(predicate.value)
    positive.set(predicate.attribute, values)
  }
  merged.mustAvoid = avoid

  const take = (attribute: string): string[] => positive.get(attribute) ?? []

  const groups = [...merged.categoryGroups]
  for (const value of take('categoryGroup'))
    if (CATEGORY_GROUPS.includes(value as CategoryGroup)) addUnique(groups, value, 6)

  const subcategories = [...merged.subcategories]
  for (const value of take('subcategory')) addUnique(subcategories, value, 6)
  if (subcategories.length === 0 && search.typeRelevance >= MIN_TYPE_RELEVANCE) {
    const ranked = Object.entries(search.typePrior)
      .filter(([, probability]) => probability >= MIN_TYPE_PRIOR)
      .toSorted((a, b) => b[1] - a[1])
    for (const [slug] of ranked) addUnique(subcategories, slug, 3)
  }
  for (const slug of subcategories) {
    const group = SUBCATEGORY_GROUP.get(slug)
    if (group) addUnique(groups, group, 6)
  }
  if (groups.length > 0) {
    merged.categoryGroups = groups as CategoryGroup[]
    explicit.add('categoryGroups')
  }
  if (subcategories.length > 0) {
    merged.subcategories = subcategories
    explicit.add('subcategories')
  }

  const colors = [...merged.colors]
  for (const value of take('color')) addUnique(colors, value, 6)
  if (colors.length > 0) merged.colors = colors

  const families = [...merged.colorFamilies]
  for (const value of take('colorFamily'))
    if (COLOR_FAMILIES.includes(value as ColorFamily)) addUnique(families, value, 6)
  if (families.length > 0) {
    merged.colorFamilies = families as ColorFamily[]
    explicit.add('colorFamilies')
  }

  const materials = [...merged.materials]
  for (const value of take('material')) addUnique(materials, value, 4)
  if (materials.length > 0) merged.materials = materials

  const patterns = [...merged.patterns]
  for (const value of take('pattern')) addUnique(patterns, value, 4)
  if (patterns.length > 0) merged.patterns = patterns

  const fits = [...merged.fits]
  for (const value of take('fit')) addUnique(fits, value, 2)
  if (fits.length > 0) merged.fits = fits

  // Aesthetics ride in the signals so `finalize` can apply occasion priors on top; an explicit
  // lexicon hit stays at 1.0, a decision-only one enters at the same weight the LLM path uses.
  const aesthetics = { ...signals.aesthetics }
  for (const value of take('aesthetic')) if (aesthetics[value] !== 1) aesthetics[value] = 0.8
  if (Object.keys(aesthetics).length > 0) {
    signals.aesthetics = aesthetics
    explicit.add('aesthetics')
  }

  const [occasion] = take('occasion')
  if (occasion && !merged.occasion) merged.occasion = occasion
  const [season] = take('season')
  if (season && !merged.season && SEASONS.includes(season as Season))
    merged.season = season as Season
  const [department] = take('department')
  if (department && !merged.department && DEPARTMENTS.includes(department as Department))
    merged.department = department as Department

  // `finalize` recomputes `axisTargets` from the hints plus occasion and season priors, so a
  // decision target enters as a hint relative to the neutral midpoint rather than as a target that
  // would be overwritten. An explicit modifier the lexicon read keeps precedence over the decision.
  const axisHints = { ...signals.axisHints }
  for (const axis of AXES) {
    const constraint = search.ordinal[axis]
    if (!constraint || constraint.relevance < MIN_CONSTRAINT_RELEVANCE) continue
    if (constraint.relation === 'unconstrained' || axisHints[axis] !== undefined) continue
    axisHints[axis] = Math.max(-1, Math.min(1, (constraint.target - 0.5) * 2))
  }
  if (Object.keys(axisHints).length > 0) signals.axisHints = axisHints

  const price = search.numeric.price
  if (price && !merged.budget && price.relevance >= MIN_CONSTRAINT_RELEVANCE) {
    const budget: NonNullable<IntentExt['budget']> = { currency: 'TWD' }
    if (price.min !== undefined) budget.min = price.min
    if (price.max !== undefined) budget.max = price.max
    if (budget.min !== undefined || budget.max !== undefined) merged.budget = budget
  }

  signals.explicitSlots = [...explicit]
  merged.signals = signals
  merged.parser = merged.parser === 'llm' || merged.parser === 'merged' ? 'merged' : 'jev'
  return merged
}
