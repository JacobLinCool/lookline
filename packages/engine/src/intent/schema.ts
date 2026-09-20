/**
 * Zod schema of the contract `Intent` (ENGINE_SPEC §1.1) plus the optional engine additions, the
 * LLM output schema (§1.6) and the extended parsing context.
 */
import { CATEGORY_GROUPS, COLOR_FAMILIES, SEASONS } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Department } from '@lookline/catalog'
import { z } from 'zod'
import type { Intent, IntentContext } from '../types'

const DEPARTMENTS = ['women', 'men', 'unisex', 'kids'] as const

export const DepartmentSchema = z.enum(DEPARTMENTS)
export const CategoryGroupSchema = z.enum(
  CATEGORY_GROUPS as unknown as [CategoryGroup, ...CategoryGroup[]],
)
export const ColorFamilySchema = z.enum(
  COLOR_FAMILIES as unknown as [ColorFamily, ...ColorFamily[]],
)
export const SeasonSchema = z.enum(SEASONS)
export const LocaleSchema = z.enum(['zh-TW', 'en', 'mixed'])
export const ModeSchema = z.enum(['single', 'outfit', 'browse'])
export const RecipientKindSchema = z.enum(['self', 'other', 'undisclosed'])

export const RELATIONS = [
  'father',
  'mother',
  'partner',
  'spouse',
  'child',
  'sibling',
  'friend',
  'colleague',
  'boss',
  'unknown',
] as const
export type Relation = (typeof RELATIONS)[number]

export const AssumptionSchema = z.object({
  slot: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  source: z.enum(['utterance', 'context', 'occasion_prior', 'default', 'llm']).optional(),
})

export const ClarificationSchema = z.object({
  slot: z.string(),
  question: z.string(),
  options: z.array(z.string()).min(2).max(5),
  blocking: z.boolean().optional(),
})

export const BudgetSchema = z.object({
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().positive().optional(),
  currency: z.literal('TWD'),
  original: z.string().optional(),
  strictness: z.enum(['hard', 'soft', 'flexible']).optional(),
  scope: z.enum(['total', 'per_item']).optional(),
  originalAmount: z.number().optional(),
  originalCurrency: z.string().optional(),
})

/** Utterance-level signals the lexicon parser extracted; `finalize` re-derives everything else from them. */
export const SignalsSchema = z.object({
  /** Explicit (1.0) and vibe-word aesthetic weights, before occasion priors. */
  aesthetics: z.record(z.string(), z.number()).optional(),
  /** Colour-group words (`淺色`, `earth tones`), before occasion priors. */
  colorWeights: z.record(z.string(), z.number()).optional(),
  /** Summed modifier deltas per axis, clamped to [−1, 1]. */
  axisHints: z.record(z.string(), z.number()).optional(),
  /** Absolute price-tier target from budget words (`cheap` .2, `luxury` .85). */
  priceTier: z.number().optional(),
  /** Negation-scope and attribute tokens from the utterance (priors are added on top). */
  mustAvoid: z.array(z.string()).optional(),
  mustHave: z.array(z.string()).optional(),
  /** Slots filled from explicit tokens (used by `mergeIntent`). */
  explicitSlots: z.array(z.string()).optional(),
  modeSource: z.enum(['word', 'occasion', 'reference', 'browse', 'default', 'llm']).optional(),
  seasonSource: z.enum(['utterance', 'context', 'llm']).optional(),
  /** Age of the recipient when the sentence says so (never a budget). */
  ageHint: z.number().optional(),
})

export const IntentSchema = z.object({
  utterance: z.string().max(500),
  locale: LocaleSchema,
  mode: ModeSchema,
  department: DepartmentSchema.optional(),
  categoryGroups: z.array(CategoryGroupSchema).max(6).default([]),
  subcategories: z.array(z.string()).max(6).default([]),
  colors: z.array(z.string()).default([]),
  colorFamilies: z.array(ColorFamilySchema).max(6).default([]),
  aesthetics: z.array(z.string()).max(6).default([]),
  materials: z.array(z.string()).max(4).default([]),
  patterns: z.array(z.string()).max(4).default([]),
  fits: z.array(z.string()).max(2).default([]),
  occasion: z.string().optional(),
  season: SeasonSchema.optional(),
  budget: BudgetSchema.optional(),
  recipient: z.object({
    kind: RecipientKindSchema,
    relation: z.string().optional(),
    department: DepartmentSchema.optional(),
    label: z.string().optional(),
  }),
  sizes: z.record(z.string(), z.string()).optional(),
  mustHave: z.array(z.string()).max(8).default([]),
  mustAvoid: z.array(z.string()).max(8).default([]),
  vibe: z.string().optional(),
  referenceCardId: z.string().optional(),
  referenceHandle: z.string().optional(),
  assumptions: z.array(AssumptionSchema),
  clarifications: z.array(ClarificationSchema),
  confidence: z.number().min(0).max(1),
  // engine additions (§1.1)
  quantity: z.number().int().min(1).max(8).optional(),
  aestheticWeights: z.record(z.string(), z.number()).optional(),
  colorWeights: z.record(z.string(), z.number()).optional(),
  axisTargets: z.record(z.string(), z.number()).optional(),
  excludeCategoryGroups: z.array(CategoryGroupSchema).optional(),
  referenceRole: z.enum(['style-source', 'coordinate-with']).optional(),
  giftCategoryPrior: z.array(CategoryGroupSchema).optional(),
  parser: z.enum(['lexicon', 'jev', 'llm', 'merged']).optional(),
  // engine-internal additions
  previousUtterance: z.string().optional(),
  signals: SignalsSchema.optional(),
})

export type IntentExt = z.infer<typeof IntentSchema>
export type IntentSignals = z.infer<typeof SignalsSchema>
export type IntentAssumptionExt = z.infer<typeof AssumptionSchema>
export type IntentClarificationExt = z.infer<typeof ClarificationSchema>
export type IntentBudget = z.infer<typeof BudgetSchema>

/** Compile-time check: every `IntentExt` is a contract `Intent`. */
const _assignable: Intent = null as unknown as IntentExt
void _assignable

export interface IntentContact {
  userId: string
  displayName: string
  handle: string
  department?: Department
  latestCardId?: string
  latestCardIds?: string[]
}

export interface IntentBrand {
  id: number
  name: string
  slug: string
}

/** `IntentContext` plus the optional additions of §1.1 (all optional, additive). */
export interface IntentContextExt extends IntentContext {
  signal?: AbortSignal
  /** Enables season inference from date phrases and seasonal occasions. */
  now?: Date
  contacts?: IntentContact[]
  brands?: IntentBrand[]
  trendingAesthetics?: string[]
  /** Feedback event count of the user (preference blend strength in `intentToVector`). */
  eventCount?: number
  /**
   * Return the decision result without waiting for the generative parser, leaving the escalation
   * to the caller. `apps/web` sets it and runs the refinement in `after()`.
   */
  deferRefinement?: boolean
}

// ---------------------------------------------------------------------------
// LLM structured output (§1.6) — nullable instead of optional so strict schemas work
// ---------------------------------------------------------------------------

export const LlmIntentOutput = z.object({
  mode: ModeSchema,
  categoryGroups: z.array(z.string()).max(6),
  subcategories: z.array(z.string()).max(6),
  colors: z.array(z.string()).max(6),
  colorFamilies: z.array(z.string()).max(6),
  aesthetics: z.array(z.string()).max(6),
  materials: z.array(z.string()).max(4),
  patterns: z.array(z.string()).max(4),
  fits: z.array(z.string()).max(2),
  occasion: z.string().nullable(),
  season: z.string().nullable(),
  recipient: z.object({
    kind: RecipientKindSchema,
    relation: z.string().nullable(),
    department: z.string().nullable(),
    label: z.string().nullable(),
  }),
  sizes: z.array(z.object({ system: z.string(), value: z.string() })).max(3),
  mustHave: z.array(z.string()).max(8),
  mustAvoid: z.array(z.string()).max(8),
  vibe: z.string().nullable(),
  referenceHandle: z.string().nullable(),
  referenceRole: z.enum(['style-source', 'coordinate-with']).nullable(),
  quantity: z.number().int().nullable(),
  budgetRaw: z.object({
    amount: z.number().nullable(),
    amount2: z.number().nullable(),
    currency: z.string().nullable(),
    kind: z.enum(['max', 'min', 'around', 'range']).nullable(),
    scope: z.enum(['total', 'per_item']).nullable(),
  }),
  assumptions: z.array(
    z.object({
      slot: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
  clarifications: z.array(
    z.object({ slot: z.string(), question: z.string(), options: z.array(z.string()) }),
  ),
  rawMentions: z.array(z.string()),
})

export type LlmIntentOutputT = z.infer<typeof LlmIntentOutput>
