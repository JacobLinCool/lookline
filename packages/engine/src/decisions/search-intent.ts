import {
  AESTHETICS,
  ATTRIBUTE_COLUMNS,
  ATTRIBUTE_SCHEMAS,
  AXES,
  CATEGORY_GROUP_DEFS,
  CLOSURES,
  COLORS,
  COLOR_FAMILY_DEFS,
  DEPARTMENT_DEFS,
  FITS,
  LENGTHS,
  MATERIALS,
  NECKLINES,
  OCCASIONS,
  PATTERNS,
  SEASON_DEFS,
  SILHOUETTE_VALUES,
  SLEEVES,
  SUBCATEGORIES,
} from '@lookline/catalog'
import { z } from 'zod'
import { withTimeout } from '../llm/timeout'
import { budgetCandidates, DECISION_TIMEOUT_MS, JEV_MODEL } from './filters'

export const SEARCH_INTENT_CONTRACT_VERSION = 'search-intent-v1'
export const MAX_SEARCH_PREDICATES = 12
export const MIN_PREDICATE_PROBABILITY = 0.5

export type ConstraintRelation = 'unconstrained' | 'around' | 'at_least' | 'at_most'
export type ConstraintCombination = 'unspecified' | 'one_of' | 'all_of' | 'preferred_order'
export type PredicatePolarity = 'positive' | 'negative'

export interface CategoricalConstraint {
  relevance: number
  explicitness: number
  probabilities: Record<string, number>
  combination: ConstraintCombination
}

export interface OrdinalConstraint {
  relevance: number
  target: number
  relation: ConstraintRelation
  relationProbabilities: Record<ConstraintRelation, number>
  explicitness: number
}

export interface SearchPredicate {
  attribute: string
  value: string
  polarity: PredicatePolarity
  probability: number
}

export interface NumericConstraint {
  relevance: number
  explicitness: number
  currency: 'TWD'
  min?: number
  max?: number
}

export interface SearchIntent {
  query: string
  typePrior: Record<string, number>
  typeRelevance: number
  typeExplicitness: number
  categorical: Record<string, CategoricalConstraint>
  ordinal: Record<string, OrdinalConstraint>
  predicates: SearchPredicate[]
  numeric: { price?: NumericConstraint }
  unresolved: string[]
  model: string
  contractVersion: typeof SEARCH_INTENT_CONTRACT_VERSION
  latencyMs: number
  questionCount: number
  candidateCount: number
}

interface SearchOption {
  value: string
  description: string
  terms: readonly string[]
}

interface CategoricalDimension {
  id: string
  label: string
  options: readonly SearchOption[]
}

interface OrdinalDimension {
  id: string
  label: string
  levels: readonly [string, string, string, string, string]
  explicitTerms: readonly string[]
  guidance?: string
}

export interface SearchCandidate {
  attribute: string
  value: string
  matchedTerm: string
  position: number
}

export interface NoulQuestion {
  type: 'noul'
  instructions: string
  criteria: { true: string; false: string }
}

export interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export interface ScoreQuestion {
  type: 'score'
  instructions: string
  criteria: string[]
}

export type SearchIntentQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion

export interface SearchIntentQuestionPlan {
  questions: Record<string, SearchIntentQuestion>
  candidates: SearchCandidate[]
  budgets: Array<{ min?: number; max?: number }>
}

const uniq = (values: readonly string[]): string[] => [...new Set(values.filter(Boolean))]

const lexicalOption = (row: {
  slug: string
  name: string
  labelZh: string
  synonyms: readonly string[]
}): SearchOption => ({
  value: row.slug,
  description: `${row.name} / ${row.labelZh}`,
  terms: uniq([row.slug, row.slug.replaceAll('-', ' '), row.name, row.labelZh, ...row.synonyms]),
})

const genericColourTerms = new Set(
  COLOR_FAMILY_DEFS.flatMap((row) => lexicalOption(row).terms.map((term) => normalise(term))),
)

const exactColourOption = (row: (typeof COLORS)[number]): SearchOption => {
  const option = lexicalOption(row)
  return {
    ...option,
    // "red" means the family, not necessarily the catalog's canonical crimson swatch.
    terms: option.terms.filter((term) => !genericColourTerms.has(normalise(term))),
  }
}

const vocabOption = (row: {
  slug: string
  name: string
  labelZh: string
  synonyms: readonly string[]
}): SearchOption => lexicalOption(row)

const CATEGORICAL_DIMENSIONS: readonly CategoricalDimension[] = [
  {
    id: 'department',
    label: 'department',
    options: DEPARTMENT_DEFS.map(lexicalOption),
  },
  {
    id: 'categoryGroup',
    label: 'garment category group',
    options: CATEGORY_GROUP_DEFS.map(lexicalOption),
  },
  { id: 'color', label: 'exact colour', options: COLORS.map(exactColourOption) },
  {
    id: 'colorFamily',
    label: 'colour family',
    options: COLOR_FAMILY_DEFS.map(lexicalOption),
  },
  { id: 'aesthetic', label: 'style or aesthetic', options: AESTHETICS.map(lexicalOption) },
  { id: 'material', label: 'material', options: MATERIALS.map(lexicalOption) },
  { id: 'pattern', label: 'pattern', options: PATTERNS.map(lexicalOption) },
  { id: 'fit', label: 'fit', options: FITS.map(lexicalOption) },
  {
    id: 'silhouette',
    label: 'silhouette',
    options: SILHOUETTE_VALUES.map(vocabOption),
  },
  { id: 'length', label: 'garment length', options: LENGTHS.map(vocabOption) },
  { id: 'neckline', label: 'neckline', options: NECKLINES.map(vocabOption) },
  { id: 'sleeve', label: 'sleeve length or style', options: SLEEVES.map(vocabOption) },
  { id: 'closure', label: 'closure', options: CLOSURES.map(vocabOption) },
  { id: 'occasion', label: 'occasion', options: OCCASIONS.map(lexicalOption) },
  { id: 'season', label: 'season', options: SEASON_DEFS.map(lexicalOption) },
]

const ORDINAL_DIMENSIONS: readonly OrdinalDimension[] = [
  {
    id: 'formality',
    label: 'formality',
    levels: ['very casual', 'casual', 'balanced', 'smart', 'very formal'],
    explicitTerms: ['formal', 'dressy', '正式', '隆重', 'casual', 'smart casual', '休閒', '隨性'],
  },
  {
    id: 'warmth',
    label: 'thermal warmth',
    levels: ['very cool', 'cool', 'moderate', 'warm', 'very warm'],
    explicitTerms: ['warm', 'warmer', '保暖', '溫暖', '暖', '涼爽', 'cool'],
    guidance:
      'Judge retained body heat, not physical thickness, weight or bulk. A winter requirement can need high thermal warmth while "not too thick" separately rejects bulky construction; do not lower warmth for that phrase.',
  },
  {
    id: 'boldness',
    label: 'visual boldness',
    levels: ['very understated', 'subtle', 'balanced', 'bold', 'statement-making'],
    explicitTerms: ['bold', 'statement', '低調', '亮眼', '搶眼', '浮誇', 'flashy', 'subtle'],
  },
  {
    id: 'structure',
    label: 'garment structure',
    levels: ['very fluid', 'soft', 'balanced', 'structured', 'sharply tailored'],
    explicitTerms: [
      'structured',
      'tailored',
      'sharp',
      'crisp',
      'flowy',
      'soft',
      '俐落',
      '挺',
      '硬挺',
      '柔軟',
      '飄逸',
    ],
  },
  {
    id: 'price-tier',
    label: 'market price tier independent of an exact budget',
    levels: ['budget', 'affordable', 'mid-market', 'premium', 'luxury'],
    explicitTerms: ['cheap', 'affordable', 'budget', 'luxury', 'premium', '便宜', '平價', '奢華'],
  },
  {
    id: 'coverage',
    label: 'body coverage',
    levels: ['minimal', 'low', 'moderate', 'covered', 'maximum coverage'],
    explicitTerms: ['coverage', 'covered', 'revealing', 'modest', '不要太露', '保守', '露', '遮'],
  },
  {
    id: 'texture',
    label: 'visible or tactile texture',
    levels: ['very smooth', 'smooth', 'moderate', 'textured', 'highly textured'],
    explicitTerms: ['texture', 'textured', 'smooth', '觸感', '紋理', '毛茸', '光滑'],
  },
  {
    id: 'trendiness',
    label: 'trendiness',
    levels: ['timeless', 'classic', 'balanced', 'current', 'highly trend-led'],
    explicitTerms: [
      'trendy',
      'trending',
      'fashionable',
      'latest',
      'timeless',
      'classic',
      '流行',
      '潮',
      '時髦',
      '經典',
      '耐看',
    ],
  },
]

const ATTRIBUTE_VALUE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'weight:heavyweight': ['thick', 'heavy', '厚', '厚重'],
  'weight:lightweight': ['lightweight', 'light weight', '輕薄', '薄'],
  'insulation:heavy': ['heavy insulation', 'heavily insulated', '厚填充', '厚鋪棉'],
  'insulation:light': ['light insulation', 'lightly insulated', '薄填充', '輕鋪棉'],
  'gauge:chunky': ['chunky knit', 'heavy knit', '粗針織', '厚針織'],
  'gauge:fine': ['fine knit', 'fine gauge', '細針織'],
  'rise:high': ['high rise', 'high-rise', 'high waisted', 'high-waisted', '高腰'],
  'rise:low': ['low rise', 'low-rise', 'low waisted', '低腰'],
  'pleats:single': ['single pleat', 'pleated', '打褶', '單褶'],
  'pleats:double': ['double pleat', 'pleated', '打褶', '雙褶'],
  'pleats:flat-front': ['flat front', 'flat-front', 'no pleats', '無褶'],
  'hood:fixed': ['hooded', 'with a hood', '連帽', '有帽'],
  'hood:none': ['no hood', 'without a hood', '無帽', '不要帽'],
}

interface CandidateEntry {
  attribute: string
  value: string
  terms: readonly string[]
  parent?: { attribute: string; value: string }
}

function attributeCandidateEntries(): CandidateEntry[] {
  const values = new Map<string, Set<string>>()
  for (const schema of Object.values(ATTRIBUTE_SCHEMAS)) {
    for (const column of ATTRIBUTE_COLUMNS) {
      const def = schema.columns[column]
      if (!def) continue
      const set = values.get(column) ?? new Set<string>()
      for (const [value] of def.default) set.add(value)
      for (const options of Object.values(def.overrides))
        for (const [value] of options) set.add(value)
      values.set(column, set)
    }
    for (const [key, def] of Object.entries(schema.extras)) {
      const attribute = `attributes.${key}`
      const set = values.get(attribute) ?? new Set<string>()
      for (const [value] of def.default) set.add(value)
      for (const options of Object.values(def.overrides))
        for (const [value] of options) set.add(value)
      values.set(attribute, set)
    }
  }
  return [...values].flatMap(([attribute, entries]) =>
    [...entries].map((value) => {
      const key = `${attribute.replace('attributes.', '')}:${value}`
      return {
        attribute,
        value,
        terms: uniq([value, value.replaceAll('-', ' '), ...(ATTRIBUTE_VALUE_ALIASES[key] ?? [])]),
      }
    }),
  )
}

const CANDIDATE_ENTRIES: readonly CandidateEntry[] = [
  ...SUBCATEGORIES.map((row) => ({
    attribute: 'subcategory',
    value: row.slug,
    terms: lexicalOption(row).terms,
    parent: { attribute: 'categoryGroup', value: row.group },
  })),
  ...CATEGORICAL_DIMENSIONS.flatMap((dimension) =>
    dimension.options.map((option) => ({
      attribute: dimension.id,
      value: option.value,
      terms: option.terms,
      ...(dimension.id === 'color'
        ? {
            parent: {
              attribute: 'colorFamily',
              value: COLORS.find((colour) => colour.slug === option.value)!.family,
            },
          }
        : {}),
    })),
  ),
  ...attributeCandidateEntries(),
]

const predicateValues = (): Record<string, string[]> => {
  const grouped: Record<string, string[]> = {}
  for (const entry of CANDIDATE_ENTRIES) {
    const values = grouped[entry.attribute] ?? []
    if (!values.includes(entry.value)) values.push(entry.value)
    grouped[entry.attribute] = values
  }
  return grouped
}

/** The item-side universe this compiler can express. There is intentionally no `other` bucket. */
export const SEARCH_INTENT_ONTOLOGY = {
  garmentTypes: SUBCATEGORIES.map((row) => row.slug),
  categorical: Object.fromEntries(
    CATEGORICAL_DIMENSIONS.map((dimension) => [
      dimension.id,
      dimension.options.map((option) => option.value),
    ]),
  ) as Record<string, string[]>,
  ordinal: AXES.slice(),
  predicateValues: predicateValues(),
} as const

function normalise(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim()
}

const isWordCharacter = (character: string | undefined): boolean =>
  character !== undefined && /[\p{L}\p{N}_]/u.test(character)

function findTerm(text: string, rawTerm: string): number {
  const term = normalise(rawTerm)
  if (!term) return -1
  let from = 0
  while (from <= text.length - term.length) {
    const at = text.indexOf(term, from)
    if (at < 0) return -1
    const latinLike = /[a-z0-9]/i.test(term)
    if (!latinLike || (!isWordCharacter(text[at - 1]) && !isWordCharacter(text[at + term.length])))
      return at
    from = at + 1
  }
  return -1
}

/** Fast, deterministic exact/alias retriever for explicit sparse values. */
export function extractSearchCandidates(query: string): SearchCandidate[] {
  const text = normalise(query)
  const direct: Array<SearchCandidate & { parent?: CandidateEntry['parent']; derived?: boolean }> =
    []
  for (const entry of CANDIDATE_ENTRIES) {
    let best: { term: string; at: number } | undefined
    for (const raw of entry.terms) {
      const term = normalise(raw)
      const at = findTerm(text, term)
      if (at >= 0 && (!best || term.length > best.term.length)) best = { term, at }
    }
    if (best)
      direct.push({
        attribute: entry.attribute,
        value: entry.value,
        matchedTerm: best.term,
        position: best.at,
        parent: entry.parent,
      })
  }

  const expanded = [...direct]
  for (const match of direct) {
    if (!match.parent) continue
    expanded.push({
      ...match.parent,
      matchedTerm: match.matchedTerm,
      position: match.position,
      derived: true,
    })
  }
  expanded.sort(
    (a, b) =>
      a.position - b.position ||
      Number(Boolean(a.derived)) - Number(Boolean(b.derived)) ||
      b.matchedTerm.length - a.matchedTerm.length ||
      a.attribute.localeCompare(b.attribute) ||
      a.value.localeCompare(b.value),
  )
  const seen = new Set<string>()
  const result: SearchCandidate[] = []
  for (const candidate of expanded) {
    const key = `${candidate.attribute}:${candidate.value}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      attribute: candidate.attribute,
      value: candidate.value,
      matchedTerm: candidate.matchedTerm,
      position: candidate.position,
    })
    if (result.length >= MAX_SEARCH_PREDICATES) break
  }
  return result
}

const categoricalId = (dimension: string): string => `categorical_${dimension}`
const categoricalRelevanceId = (dimension: string): string => `categorical_${dimension}_relevance`
const ordinalId = (dimension: string): string => `ordinal_${dimension}`
const ordinalRelationId = (dimension: string): string => `ordinal_${dimension}_relation`
const predicateId = (index: number): string => `predicate_${index}`
const combinationId = (index: number): string => `combination_${index}`

const choiceCriteria = (options: readonly SearchOption[]): Record<string, string> =>
  Object.fromEntries(options.map((option) => [option.value, option.description]))

/** Build every independent question before the sole network request. */
export function buildSearchIntentQuestions(query: string): SearchIntentQuestionPlan {
  if (!query.trim() || query.length > 500)
    throw new Error('Describe the search in 1–500 characters.')
  const candidates = extractSearchCandidates(query)
  const budgets = budgetCandidates(query)
  const questions: Record<string, SearchIntentQuestion> = {
    type_prior: {
      type: 'choice',
      instructions:
        'Which garment type best fits this shopping request? Return the probability across every type. If no type is named, infer only a broad prior from the stated use case; the separate relevance answer will keep it from becoming a filter.',
      criteria: Object.fromEntries(
        SUBCATEGORIES.map((row) => [row.slug, `${row.name} / ${row.labelZh}; ${row.group}`]),
      ),
    },
    type_relevance: {
      type: 'noul',
      instructions:
        'Does the request meaningfully constrain garment type? Explicitly naming a garment or category is highly relevant. A use case alone may create a weak prior but must not exclude other plausible garment types.',
      criteria: {
        true: 'Garment type should materially affect retrieval.',
        false: 'Garment type is unconstrained; keep the full catalog searchable.',
      },
    },
  }
  for (const dimension of CATEGORICAL_DIMENSIONS) {
    questions[categoricalId(dimension.id)] = {
      type: 'choice',
      instructions: `Which ${dimension.label} best matches the request? Return the full distribution. Alternatives joined by OR should share probability. Do not turn a merely typical association into a requirement; relevance is judged separately.`,
      criteria: choiceCriteria(dimension.options),
    }
    questions[categoricalRelevanceId(dimension.id)] = {
      type: 'noul',
      instructions: `Does the shopper's request constrain ${dimension.label}? This may be explicit or safely implied by purpose, but unrelated dimensions must be near zero.`,
      criteria: {
        true: `The ${dimension.label} should influence retrieval.`,
        false: `The ${dimension.label} is unconstrained.`,
      },
    }
  }
  for (const dimension of ORDINAL_DIMENSIONS) {
    questions[ordinalId(dimension.id)] = {
      type: 'score',
      instructions: `What target on the ${dimension.label} spectrum best satisfies the request? Judge the desired product, not the literal sentiment of the sentence.${dimension.guidance ? ` ${dimension.guidance}` : ''}`,
      criteria: [...dimension.levels],
    }
    questions[ordinalRelationId(dimension.id)] = {
      type: 'choice',
      instructions: `How does the request constrain ${dimension.label}? For example, "warm" is around or at_least; "not too formal" is at_most. Choose unconstrained when the request gives no signal.${dimension.guidance ? ` ${dimension.guidance}` : ''}`,
      criteria: {
        unconstrained: `No ${dimension.label} preference; this axis must not affect retrieval.`,
        around: `Prefer products near the target ${dimension.label}.`,
        at_least: `Products should meet or exceed the target ${dimension.label}.`,
        at_most: `Products should not exceed the target ${dimension.label}.`,
      },
    }
  }
  candidates.forEach((candidate, index) => {
    questions[predicateId(index)] = {
      type: 'choice',
      instructions: `For the catalog predicate ${candidate.attribute}=${candidate.value}, does the request want it, reject it, or merely mention words that should not constrain this exact value? Follow the final correction and preserve negation.`,
      criteria: {
        positive: 'This exact value is wanted or is one acceptable alternative.',
        negative: 'This exact value is explicitly rejected.',
        irrelevant: 'The matching words do not constrain this exact catalog value.',
        uncertain: 'The polarity cannot be determined safely.',
      },
    }
  })
  const grouped = new Map<string, SearchCandidate[]>()
  for (const candidate of candidates) {
    const group = grouped.get(candidate.attribute) ?? []
    group.push(candidate)
    grouped.set(candidate.attribute, group)
  }
  let combinationIndex = 0
  for (const [attribute, group] of grouped) {
    if (group.length < 2) continue
    questions[combinationId(combinationIndex++)] = {
      type: 'choice',
      instructions: `How should multiple confirmed positive values for ${attribute} (${group.map((item) => item.value).join(', ')}) combine? Judge only their logical relationship in the request.`,
      criteria: {
        one_of: 'Alternatives: any one value is sufficient (OR).',
        all_of: 'The product should contain all positive values together (AND).',
        preferred_order: 'Values are ranked from preferred to fallback.',
        unspecified: 'The request does not establish a multi-value relationship.',
      },
    }
  }
  if (budgets.length > 0)
    questions.price = {
      type: 'choice',
      instructions:
        'Which locally parsed TWD bounds represent the final requested budget? Never calculate or invent a number. Select uncertain if none is safe.',
      criteria: {
        unconstrained: 'No price constraint is intended.',
        uncertain: 'A price is intended but none of the parsed candidates is safely correct.',
        ...Object.fromEntries(
          budgets.map((budget, index) => [
            `budget_${index}`,
            [
              budget.min === undefined ? '' : `at least TWD ${budget.min}`,
              budget.max === undefined ? '' : `at most TWD ${budget.max}`,
            ]
              .filter(Boolean)
              .join(' and '),
          ]),
        ),
      },
    }
  return { questions, candidates, budgets }
}

const probability = z.number().min(0).max(1)
const noulAnswerSchema = z.object({ type: z.literal('noul'), noul: probability })
const choiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  confidence: probability,
  probabilities: z.record(z.string(), probability),
})
const scoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number().finite(),
  confidence: probability,
  legend: z.record(z.string(), z.string()),
  probabilities: z.record(z.string(), probability),
})
const answerSchema = z.discriminatedUnion('type', [
  noulAnswerSchema,
  choiceAnswerSchema,
  scoreAnswerSchema,
])
const searchResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), answerSchema),
})
type SearchAnswer = z.infer<typeof answerSchema>
type SearchResponse = z.infer<typeof searchResponseSchema>

function sameKeys(actual: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(actual)
  return keys.length === expected.length && expected.every((key) => key in actual)
}

function validDistribution(
  probabilities: Record<string, number>,
  expected: readonly string[],
): boolean {
  return (
    sameKeys(probabilities, expected) &&
    Math.abs(Object.values(probabilities).reduce((sum, value) => sum + value, 0) - 1) <= 0.02
  )
}

function validateAnswers(
  questions: Record<string, SearchIntentQuestion>,
  response: SearchResponse,
): void {
  if (!sameKeys(response.answers, Object.keys(questions)))
    throw new Error('Search intent service returned an incomplete answer set.')
  for (const [id, question] of Object.entries(questions)) {
    const answer = response.answers[id]
    if (!answer || answer.type !== question.type)
      throw new Error(`Search intent service returned the wrong answer type for ${id}.`)
    if (answer.type === 'noul') continue
    if (answer.type === 'choice' && question.type === 'choice') {
      const keys = Object.keys(question.criteria)
      if (
        !keys.includes(answer.choice) ||
        !validDistribution(answer.probabilities, keys) ||
        (answer.probabilities[answer.choice] ?? -1) <
          Math.max(...Object.values(answer.probabilities)) - 1e-8
      )
        throw new Error(`Search intent service returned an invalid choice distribution for ${id}.`)
      continue
    }
    if (answer.type === 'score' && question.type === 'score') {
      const keys = question.criteria.map((_, index) => String(index))
      const weighted = keys.reduce(
        (sum, key, index) => sum + index * (answer.probabilities[key] ?? 0),
        0,
      )
      if (
        !validDistribution(answer.probabilities, keys) ||
        !sameKeys(answer.legend, keys) ||
        keys.some((key, index) => answer.legend[key] !== question.criteria[index]) ||
        answer.score < 0 ||
        answer.score > question.criteria.length - 1 ||
        Math.abs(answer.score - weighted) > 0.03
      )
        throw new Error(`Search intent service returned an invalid score distribution for ${id}.`)
      continue
    }
    throw new Error(`Search intent service returned an invalid answer for ${id}.`)
  }
}

const getAnswer = <T extends SearchAnswer['type']>(
  answers: Record<string, SearchAnswer>,
  id: string,
  type: T,
): Extract<SearchAnswer, { type: T }> => {
  const answer = answers[id]
  if (!answer || answer.type !== type) throw new Error(`Missing validated ${type} answer ${id}.`)
  return answer as Extract<SearchAnswer, { type: T }>
}

function isExplicit(query: string, terms: readonly string[]): boolean {
  const text = normalise(query)
  return terms.some((term) => findTerm(text, term) >= 0)
}

function combinationAnswers(
  candidates: readonly SearchCandidate[],
  answers: Record<string, SearchAnswer>,
): Map<string, ConstraintCombination> {
  const grouped = new Map<string, SearchCandidate[]>()
  for (const candidate of candidates) {
    const group = grouped.get(candidate.attribute) ?? []
    group.push(candidate)
    grouped.set(candidate.attribute, group)
  }
  const result = new Map<string, ConstraintCombination>()
  let index = 0
  for (const [attribute, group] of grouped) {
    if (group.length < 2) continue
    const answer = getAnswer(answers, combinationId(index++), 'choice')
    const selectedProbability = answer.probabilities[answer.choice] ?? 0
    result.set(
      attribute,
      selectedProbability >= MIN_PREDICATE_PROBABILITY
        ? (answer.choice as ConstraintCombination)
        : 'unspecified',
    )
  }
  return result
}

export interface CompileSearchIntentOptions {
  apiKey?: string
  model?: string
  signal?: AbortSignal
  fetch?: typeof fetch
  timeoutMs?: number
}

/**
 * Compile natural language into a complete, relevance-gated search space in one Jev round trip.
 * Provider errors and malformed output are explicit; this function has no semantic fallback.
 */
export async function compileSearchIntent(
  query: string,
  options: CompileSearchIntentOptions = {},
): Promise<SearchIntent> {
  const start = performance.now()
  const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY
  if (!apiKey) throw new Error('Search intent compilation is not configured.')
  const plan = buildSearchIntentQuestions(query)
  const response = await withTimeout(
    options.timeoutMs ?? DECISION_TIMEOUT_MS,
    async (signal) => {
      const result = await (options.fetch ?? fetch)('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model ?? process.env.TYPESAFE_MODEL ?? JEV_MODEL,
          state: query,
          questions: plan.questions,
        }),
      })
      if (!result.ok)
        throw new Error(`Search intent service returned HTTP ${result.status}. Try again.`)
      return searchResponseSchema.parse(await result.json())
    },
    options.signal,
  )
  validateAnswers(plan.questions, response)

  const type = getAnswer(response.answers, 'type_prior', 'choice')
  const typeRelevance = getAnswer(response.answers, 'type_relevance', 'noul').noul
  const categorical: Record<string, CategoricalConstraint> = {}
  const combinations = combinationAnswers(plan.candidates, response.answers)
  for (const dimension of CATEGORICAL_DIMENSIONS) {
    const answer = getAnswer(response.answers, categoricalId(dimension.id), 'choice')
    categorical[dimension.id] = {
      relevance: getAnswer(response.answers, categoricalRelevanceId(dimension.id), 'noul').noul,
      explicitness: plan.candidates.some((candidate) => candidate.attribute === dimension.id)
        ? 1
        : 0,
      probabilities: answer.probabilities,
      combination: combinations.get(dimension.id) ?? 'unspecified',
    }
  }

  const ordinal: Record<string, OrdinalConstraint> = {}
  for (const dimension of ORDINAL_DIMENSIONS) {
    const score = getAnswer(response.answers, ordinalId(dimension.id), 'score')
    const relation = getAnswer(response.answers, ordinalRelationId(dimension.id), 'choice')
    ordinal[dimension.id] = {
      relevance: 1 - relation.probabilities.unconstrained!,
      target: score.score / (dimension.levels.length - 1),
      relation: relation.choice as ConstraintRelation,
      relationProbabilities: relation.probabilities as Record<ConstraintRelation, number>,
      explicitness: isExplicit(query, dimension.explicitTerms) ? 1 : 0,
    }
  }

  const predicates: SearchPredicate[] = []
  const unresolved: string[] = []
  plan.candidates.forEach((candidate, index) => {
    const answer = getAnswer(response.answers, predicateId(index), 'choice')
    const selectedProbability = answer.probabilities[answer.choice] ?? 0
    if (
      (answer.choice === 'positive' || answer.choice === 'negative') &&
      selectedProbability >= MIN_PREDICATE_PROBABILITY
    )
      predicates.push({
        attribute: candidate.attribute,
        value: candidate.value,
        polarity: answer.choice,
        probability: selectedProbability,
      })
    else if (answer.choice === 'uncertain' || selectedProbability < MIN_PREDICATE_PROBABILITY)
      unresolved.push(`${candidate.attribute}:${candidate.value}`)
  })

  const numeric: SearchIntent['numeric'] = {}
  if (plan.budgets.length > 0) {
    const price = getAnswer(response.answers, 'price', 'choice')
    const selectedProbability = price.probabilities[price.choice] ?? 0
    if (price.choice.startsWith('budget_') && selectedProbability >= MIN_PREDICATE_PROBABILITY) {
      const budget = plan.budgets[Number(price.choice.slice('budget_'.length))]
      if (!budget) throw new Error('Search intent service selected an unknown budget candidate.')
      numeric.price = {
        relevance: selectedProbability,
        explicitness: 1,
        currency: 'TWD',
        ...budget,
      }
    } else if (price.choice === 'uncertain' || selectedProbability < MIN_PREDICATE_PROBABILITY) {
      unresolved.push('price')
    }
  }

  return {
    query,
    typePrior: type.probabilities,
    typeRelevance,
    typeExplicitness: plan.candidates.some(
      (candidate) =>
        candidate.attribute === 'subcategory' || candidate.attribute === 'categoryGroup',
    )
      ? 1
      : 0,
    categorical,
    ordinal,
    predicates,
    numeric,
    unresolved,
    model: response.model,
    contractVersion: SEARCH_INTENT_CONTRACT_VERSION,
    latencyMs: performance.now() - start,
    questionCount: Object.keys(plan.questions).length,
    candidateCount: plan.candidates.length,
  }
}
