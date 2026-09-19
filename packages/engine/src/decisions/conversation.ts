import { SEARCH_FACETS } from '@lookline/catalog'
import { z } from 'zod'
import { extractFacetCandidates, type FacetCandidate } from './candidates'
import {
  budgetCandidates,
  evaluateFilterPlan,
  filterQuestions,
  filterStateSchema,
  type FilterResolveOptions,
  type FilterState,
} from './filters'
import {
  extractKeywordContext,
  KEYWORD_INSTRUCTIONS,
  type ExtractKeywordsOptions,
} from './keywords'

export const CONVERSATION_BYTES = 24 * 1024
export const CONVERSATION_CANDIDATES = 64
export const CONVERSATION_RULES = `Read the complete shopping conversation chronologically. Track each attribute independently: changing a colour does not remove an earlier garment category. The final user choice for an attribute wins, including a change made using the filter controls. For example, 黑色 → manually blue → 改白色 means white only.  A concrete assistant recommendation counts as a current preference only when compatible with ALL explicit user constraints. A user saying 不要黑色 / no black prohibits black even if the assistant later recommends black. Questions and examples do not count as recommendations. Resolve short user answers against the preceding options. Unchosen alternatives are unmentioned, NOT rejected. Do not infer related attributes. The cleared list removes manual restrictions; keywords: [] clears keyword restrictions. `

const messageSchema = z
  .object({
    kind: z.literal('message'),
    id: z.string().min(1).max(100),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    status: z.enum(['partial', 'complete', 'interrupted']),
  })
  .strict()

const filterKeySchema = z.enum(
  Object.keys(filterStateSchema.shape) as [keyof FilterState, ...Array<keyof FilterState>],
)
const manualSchema = z
  .object({
    kind: z.literal('filters'),
    id: z.string().min(1).max(100),
    values: filterStateSchema,
    cleared: z.array(filterKeySchema),
    keywords: z.array(z.string().max(128)).max(4).optional(),
  })
  .strict()
  .refine(
    (e) => !e.cleared.some((key) => e.values[key] !== undefined),
    'A field cannot be set and cleared.',
  )

export const conversationEventSchema = z.discriminatedUnion('kind', [messageSchema, manualSchema])
export type ConversationEvent = z.infer<typeof conversationEventSchema>
export type ConversationMessage = Extract<ConversationEvent, { kind: 'message' }>
export const conversationSchema = z.array(conversationEventSchema).superRefine((events, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(events)).byteLength > CONVERSATION_BYTES)
    ctx.addIssue({ code: 'custom', message: 'Conversation is full. Start a new conversation.' })
  if (new Set(events.map((event) => event.id)).size !== events.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate conversation event.' })
})

export const conversationRequestSchema = z
  .object({
    base: filterStateSchema,
    events: conversationSchema,
    revision: z.number().int().nonnegative(),
    epoch: z.number().int().nonnegative(),
  })
  .strict()

export function conversationBaseline(
  base: FilterState,
  events: readonly ConversationEvent[],
): FilterState {
  const next = { ...base }
  for (const event of events)
    if (event.kind === 'filters') {
      for (const key of event.cleared) delete next[key]
      Object.assign(next, event.values)
    }
  return filterStateSchema.parse(next)
}

export function conversationPlan(base: FilterState, events: readonly ConversationEvent[]) {
  const validated = conversationSchema.parse(events)
  const baseline = conversationBaseline(filterStateSchema.parse(base), validated)
  const candidates = new Map<string, FacetCandidate>()
  const budgets = new Map<string, { min?: number; max?: number }>()
  for (const event of validated) {
    if (event.kind === 'message') {
      for (const candidate of extractFacetCandidates(event.text, CONVERSATION_CANDIDATES + 1))
        candidates.set(`${candidate.key}:${candidate.value}`, candidate)
      for (const budget of budgetCandidates(event.text)) budgets.set(JSON.stringify(budget), budget)
    } else if (event.values.priceMin !== undefined || event.values.priceMax !== undefined) {
      const budget = { min: event.values.priceMin, max: event.values.priceMax }
      budgets.set(JSON.stringify(budget), budget)
    }
  }
  // Previously selected lexical values must remain decidable even when a reply only says "no".
  for (const facet of SEARCH_FACETS.filter((f) => f.decision === 'lexical')) {
    for (const value of [...(baseline[facet.key] ?? []), ...(baseline[facet.excludeKey] ?? [])])
      candidates.set(`${facet.key}:${value}`, { key: facet.key, value, term: value, position: 0 })
  }
  if (candidates.size > CONVERSATION_CANDIDATES) throw new ConversationLimitError()
  const plan = filterQuestions('', baseline, {
    candidates: [...candidates.values()],
    budgets: [...budgets.values()],
    rules: CONVERSATION_RULES,
  })
  // Sentence questions ask what the shopper explicitly requested. Conversation questions must
  // also admit recommendations, without treating an unchosen answer as an explicit exclusion.
  for (const facet of SEARCH_FACETS)
    for (const value of facet.values) {
      const question = plan.questions[`${facet.key}:${value.slug}`]
      if (!question) continue
      question.instructions = `${CONVERSATION_RULES}Determine whether the current shopping direction includes, excludes, or leaves unmentioned this EXACT catalog value: ${facet.id} = ${value.name} / ${value.labelZh} (${value.slug}); names and synonyms: ${value.synonyms.join(', ')}. Concrete assistant recommendations are accepted immediately; explicit user constraints win. Consider only this attribute, not neighboring attributes.`
      const lastManual = validated.findLast(
        (event) =>
          event.kind === 'filters' &&
          (event.values[facet.key] !== undefined ||
            event.values[facet.excludeKey] !== undefined ||
            event.cleared.includes(facet.key) ||
            event.cleared.includes(facet.excludeKey)),
      )
      if (lastManual)
        question.instructions += ` For this attribute, manual event ${lastManual.id} supersedes ALL earlier choices. Use its selection and only subsequent dialogue; older alternatives are neutral, not exclusions.`
      question.criteria = {
        include: `${value.name} / ${value.labelZh} is currently wanted: the final user choice, or an assistant recommendation the user has not prohibited.`,
        exclude: `${value.name} / ${value.labelZh} is explicitly unwanted (no, without, 不要). An assistant suggestion cannot override this user prohibition.`,
        neutral: `${value.name} / ${value.labelZh} is absent, mentioned only in a question, an unchosen option, or an old preference replaced by a later selection.`,
      }
    }
  return {
    baseline,
    state: {
      initialFilters: base,
      events: validated,
    },
    plan,
  }
}

export class ConversationLimitError extends Error {
  constructor() {
    super('Conversation has too many different attributes. Start a new conversation.')
  }
}

export function resolveConversationFilters(
  base: FilterState,
  events: readonly ConversationEvent[],
  options: FilterResolveOptions = {},
) {
  const { baseline, state, plan } = conversationPlan(base, events)
  return evaluateFilterPlan(state, baseline, plan, {
    ...options,
    timeoutMs: options.timeoutMs ?? 2_500,
    contractVersion: 'filters-conversation-v1',
  })
}

export function extractConversationKeywords(
  base: FilterState,
  events: readonly ConversationEvent[],
  options: ExtractKeywordsOptions,
) {
  return extractKeywordContext(
    { initialFilters: filterStateSchema.parse(base), events: conversationSchema.parse(events) },
    `${KEYWORD_INSTRUCTIONS}\n${CONVERSATION_RULES}`,
    options,
  )
}
