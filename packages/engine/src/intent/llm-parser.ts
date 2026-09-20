import { withTimeout } from '../llm/timeout'
import { TEXT_TIMEOUT_MS } from '../llm/types'
/**
 * LLM path (ENGINE_SPEC §1.6): `INTENT_PROMPT_V1`, structured output, fuzzy slug mapping and
 * `mergeLlm` where code wins on numbers, currency and department.
 */
import {
  AESTHETICS,
  CATEGORY_GROUPS,
  COLOR_FAMILIES,
  FITS,
  SLEEVES,
  LEXICON,
  MATERIALS,
  PATTERNS,
  SUBCATEGORIES,
} from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Department, Season } from '@lookline/catalog'
import { OCCASIONS, canonicalAesthetic, currencyForToken, toTwd } from '../constants'
import type { LlmClient } from '../types'
import { finalize } from './finalize'
import { parseIntentOffline } from './lexicon-parser'
import {
  LlmIntentOutput,
  RELATIONS,
  type IntentContextExt,
  type IntentExt,
  type LlmIntentOutputT,
} from './schema'

// ---------------------------------------------------------------------------
// fuzzy slug mapping
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    prev = cur
  }
  return prev[n] ?? 0
}

const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')

/** Map a free value to a slug using exact slug, lexicon terms, then Levenshtein ≤ 2 (§1.6). */
export function fuzzySlug(
  value: string,
  entries: ReadonlyArray<{ value: string; terms: readonly string[] }>,
): string | undefined {
  const v = norm(value)
  if (v.length === 0) return undefined
  for (const e of entries) if (e.value === v) return e.value
  for (const e of entries) if (e.terms.some((term) => norm(term) === v)) return e.value
  let best: { value: string; d: number } | undefined
  for (const e of entries) {
    for (const cand of [e.value, ...e.terms.map(norm)]) {
      if (Math.abs(cand.length - v.length) > 2) continue
      const d = levenshtein(cand, v)
      if (d <= 2 && (!best || d < best.d)) best = { value: e.value, d }
    }
  }
  return best?.value
}

const OCCASION_ENTRIES = OCCASIONS.map((o) => ({
  value: o.slug,
  terms: [o.labelZh, o.labelEn, ...o.synonymsEn, ...o.synonymsZh],
}))
const AESTHETIC_ENTRIES = LEXICON.aesthetics
const SEASON_VALUES = new Set<string>(['spring', 'summer', 'autumn', 'winter', 'all-season'])
const DEPARTMENTS = new Set<string>(['women', 'men', 'unisex', 'kids'])

const mapAesthetic = (v: string): string | undefined =>
  canonicalAesthetic(v) ?? fuzzySlug(v, AESTHETIC_ENTRIES)

// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------

function projectForPrompt(intent: IntentExt): LlmIntentOutputT {
  const b = intent.budget
  const kind = b
    ? b.min !== undefined && b.max !== undefined
      ? b.strictness === 'soft'
        ? 'around'
        : 'range'
      : b.max !== undefined
        ? 'max'
        : b.min !== undefined
          ? 'min'
          : null
    : null
  return {
    mode: intent.mode,
    categoryGroups: intent.categoryGroups,
    subcategories: intent.subcategories,
    colors: intent.colors,
    colorFamilies: intent.colorFamilies,
    aesthetics: intent.aesthetics.filter((a) => (intent.signals?.aesthetics?.[a] ?? 0) >= 1),
    materials: intent.materials,
    patterns: intent.patterns,
    fits: intent.fits,
    occasion: intent.occasion ?? null,
    season: intent.signals?.seasonSource === 'utterance' ? (intent.season ?? null) : null,
    recipient: {
      kind: intent.recipient.kind,
      relation: intent.recipient.relation ?? null,
      department: intent.recipient.department ?? null,
      label: intent.recipient.label ?? null,
    },
    sizes: Object.entries(intent.sizes ?? {}).map(([system, value]) => ({ system, value })),
    mustHave: intent.mustHave,
    mustAvoid: intent.signals?.mustAvoid ?? [],
    vibe: intent.vibe ?? null,
    referenceHandle: intent.referenceHandle ?? null,
    referenceRole: intent.referenceRole ?? null,
    quantity: intent.quantity ?? null,
    budgetRaw: {
      amount: b?.originalAmount ?? null,
      amount2: kind === 'range' || kind === 'around' ? (b?.max ?? null) : null,
      currency: b?.originalCurrency ?? null,
      kind,
      scope: b?.scope ?? null,
    },
    assumptions: intent.assumptions
      .filter((a) => a.source !== 'occasion_prior' && !a.slot.startsWith('axisTargets.'))
      .slice(0, 4)
      .map(({ slot, value, confidence, reason }) => ({ slot, value, confidence, reason })),
    clarifications: intent.clarifications
      .slice(0, 2)
      .map(({ slot, question, options }) => ({ slot, question, options })),
    rawMentions: [],
  }
}

const FEW_SHOT_CTX: IntentContextExt = {
  now: new Date('2026-09-18T01:00:00.000Z'),
  user: { department: 'women', budgetHint: null, displayName: 'Demo' },
  contacts: [
    {
      userId: 'u_000002',
      displayName: 'Alice',
      handle: 'alice',
      department: 'women',
      latestCardId: 'lk_alice_01',
    },
    {
      userId: 'u_000003',
      displayName: 'Jacob',
      handle: 'jacob',
      department: 'men',
      latestCardId: 'lk_jacob_01',
    },
  ],
}

const FEW_SHOT_UTTERANCES = [
  '下週要去朋友婚禮，預算五千，不想太正式',
  'gift for my dad under $100, he likes hiking',
  'running shoes size 42, not Nike',
  '想跟 Jacob 一起去音樂祭，幫我配一套跟他的 look 搭的',
]

const list = (xs: readonly string[]): string => xs.join(', ')

const validToken = (x: string): boolean =>
  /^(color|material|subcategory|group|brand|pattern|attribute|sleeve|text|aesthetic):[a-z0-9\-' ]+$/i.test(
    x,
  )

function buildPrompt(): string {
  const lines: string[] = [
    'You are Engine 01 of Lookline, a fashion shopping assistant. Turn ONE sentence (中文 or English) into a JSON intent.',
    '',
    'Allowed slugs — use ONLY these:',
    `aesthetics: ${AESTHETICS.map((a) => `${a.slug} (${a.labelZh})`).join(', ')}`,
    `colorFamilies: ${list(COLOR_FAMILIES)}`,
    `categoryGroups: ${list(CATEGORY_GROUPS)}`,
    `subcategories: ${list(SUBCATEGORIES.map((s) => s.slug))}`,
    `materials: ${list(MATERIALS.map((m) => m.slug))}`,
    `patterns: ${list(PATTERNS.map((p) => p.slug))}`,
    `fits: ${list(FITS.map((f) => f.slug))}`,
    `occasions: ${OCCASIONS.map((o) => `${o.slug} (${o.labelZh})`).join(', ')}`,
    `relations: ${list(RELATIONS)}`,
    'seasons: spring, summer, autumn, winter, all-season · departments: women, men, unisex, kids · size systems: alpha, numeric-waist, eu-shoe',
    `sleeves: ${list(SLEEVES.map((s) => s.slug))} — as a "sleeve:<slug>" mustHave/mustAvoid token, never as a fit`,
    'mustHave / mustAvoid tokens are "<slot>:<value>" with slot ∈ color, material, subcategory, group, brand, pattern, attribute, sleeve, text.',
    '',
    'Rules:',
    '- Use only the listed slugs. Anything you cannot map goes into rawMentions.',
    '- Copy the budget number and currency exactly as written into budgetRaw; never convert. kind: max (under/以內), min (over/以上), around (左右/about), range (N to M).',
    "- recipient.kind = 'other' only when the sentence says it is for someone else; set relation and label from the sentence.",
    '- mode: outfit for a whole look / occasion without a category, single for one item, browse when nothing specific is asked.',
    '- Every inferred slot must appear in assumptions with the phrase that triggered it (confidence 0–1).',
    '- Ask a clarification only when two answers would change the result materially; never more than 2.',
    '- Output language of questions and reasons = language of the sentence.',
    '',
    'Examples:',
  ]
  for (const u of FEW_SHOT_UTTERANCES) {
    const parsed = parseIntentOffline(u, FEW_SHOT_CTX)
    lines.push(`Sentence: ${u}`)
    lines.push(JSON.stringify(projectForPrompt(parsed)))
    lines.push('')
  }
  return lines.join('\n')
}

let promptCache: string | null = null

/** Static, versioned system prompt (built once from the slug tables and four offline parses). */
export function intentPromptV1(): string {
  if (!promptCache) promptCache = buildPrompt()
  return promptCache
}

export const INTENT_PROMPT_VERSION = 'INTENT_PROMPT_V1'

export function userMessage(utterance: string, ctx: IntentContextExt): string {
  const now = ctx.now ? ctx.now.toISOString().slice(0, 10) : 'unknown'
  const contacts = (ctx.contacts ?? []).map((c) => c.displayName).join(', ') || 'none'
  const prev = ctx.previousIntent
    ? JSON.stringify({
        utterance: ctx.previousIntent.utterance,
        mode: ctx.previousIntent.mode,
        categoryGroups: ctx.previousIntent.categoryGroups,
        colorFamilies: ctx.previousIntent.colorFamilies,
        occasion: ctx.previousIntent.occasion ?? null,
        budget: ctx.previousIntent.budget ?? null,
      })
    : 'null'
  return [
    `Sentence: ${utterance}`,
    `Today: ${now}`,
    `UserDepartment: ${ctx.user?.department ?? 'unknown'}`,
    `Contacts: ${contacts}`,
    `PreviousIntent: ${prev}`,
  ].join('\n')
}

/** Bounded enrichment; cancellation reaches the provider, including injected clients. */
export async function parseIntentLlm(
  utterance: string,
  ctx: IntentContextExt,
  llm: LlmClient,
  timeoutMs = TEXT_TIMEOUT_MS,
): Promise<LlmIntentOutputT | null> {
  try {
    return await withTimeout(
      timeoutMs,
      (signal) =>
        llm.generateJson({
          schema: LlmIntentOutput,
          system: intentPromptV1(),
          prompt: userMessage(utterance, ctx),
          purpose: 'intent',
          signal,
          timeoutMs,
        }),
      ctx.signal,
    )
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// merge (§1.6): LLM wins on semantics, code wins on numbers
// ---------------------------------------------------------------------------

const t = (locale: IntentExt['locale'], zh: string, en: string): string =>
  locale === 'en' ? en : zh

export function mergeLlm(
  lex: IntentExt,
  llm: LlmIntentOutputT,
  ctx: IntentContextExt = {},
): IntentExt {
  const merged = structuredClone(lex)
  const locale = merged.locale
  const signals = { ...merged.signals }
  const explicit = new Set(signals.explicitSlots ?? [])
  const rawMentions = [...llm.rawMentions]
  const assumptions = [...merged.assumptions]

  const mapAll = (
    values: readonly string[],
    entries: ReadonlyArray<{ value: string; terms: readonly string[] }>,
  ): string[] => {
    const out: string[] = []
    for (const v of values) {
      const slug = fuzzySlug(v, entries)
      if (slug) {
        if (!out.includes(slug)) out.push(slug)
      } else rawMentions.push(v)
    }
    return out
  }

  // aesthetics (LLM wins; explicit lexicon hits keep 1.0, LLM-only ones 0.8)
  const aesthetics: Record<string, number> = {}
  for (const v of llm.aesthetics) {
    const slug = mapAesthetic(v)
    if (!slug) {
      rawMentions.push(v)
      continue
    }
    aesthetics[slug] = signals.aesthetics?.[slug] === 1 ? 1 : 0.8
  }
  if (Object.keys(aesthetics).length > 0) {
    signals.aesthetics = aesthetics
    explicit.add('aesthetics')
  }

  // categories
  const groups = mapAll(llm.categoryGroups, LEXICON.categoryGroups).filter((g) =>
    CATEGORY_GROUPS.includes(g as CategoryGroup),
  ) as CategoryGroup[]
  const subs = mapAll(llm.subcategories, LEXICON.subcategories)
  const subGroup = new Map(SUBCATEGORIES.map((s) => [s.slug, s.group]))
  for (const s of subs) {
    const g = subGroup.get(s)
    if (g && !groups.includes(g)) groups.push(g)
  }
  if (groups.length > 0) {
    merged.categoryGroups = groups.slice(0, 6)
    explicit.add('categoryGroups')
  }
  if (subs.length > 0) {
    merged.subcategories = subs.slice(0, 6)
    explicit.add('subcategories')
  }

  // colours (explicit only)
  const families = mapAll(llm.colorFamilies, LEXICON.colorFamilies).filter((f) =>
    COLOR_FAMILIES.includes(f as ColorFamily),
  ) as ColorFamily[]
  const colors = mapAll(llm.colors, LEXICON.colors)
  if (families.length > 0 || colors.length > 0) {
    merged.colorFamilies = families.slice(0, 6)
    merged.colors = colors
    explicit.add('colorFamilies')
  }

  // fits / materials / patterns / vibe (LLM wins)
  const fits = mapAll(llm.fits, LEXICON.fits)
  if (fits.length > 0) merged.fits = fits.slice(0, 2)
  const materials = mapAll(llm.materials, LEXICON.materials)
  if (materials.length > 0) merged.materials = materials.slice(0, 4)
  const patterns = mapAll(llm.patterns, LEXICON.patterns)
  if (patterns.length > 0) merged.patterns = patterns.slice(0, 4)
  if (llm.vibe && llm.vibe.trim().length > 0) merged.vibe = llm.vibe.trim()

  // occasion / season / mode
  if (llm.occasion) {
    const slug = fuzzySlug(llm.occasion, OCCASION_ENTRIES)
    if (slug) {
      merged.occasion = slug
      explicit.add('occasion')
    } else rawMentions.push(llm.occasion)
  }
  if (llm.season && SEASON_VALUES.has(norm(llm.season)) && !merged.season) {
    merged.season = norm(llm.season) as Season
    signals.seasonSource = 'llm'
  }
  merged.mode = llm.mode
  signals.modeSource = 'llm'
  for (let i = assumptions.length - 1; i >= 0; i--)
    if (assumptions[i]!.slot === 'mode') assumptions.splice(i, 1)

  // must-have / must-avoid: union with lexicon negation hits
  signals.mustAvoid = Array.from(
    new Set([
      ...(signals.mustAvoid ?? []),
      ...llm.mustAvoid.filter(validToken).map((x) => x.toLowerCase()),
    ]),
  )
  signals.mustHave = Array.from(
    new Set([
      ...(signals.mustHave ?? []),
      ...llm.mustHave.filter(validToken).map((x) => x.toLowerCase()),
    ]),
  )

  // recipient (relation from LLM; department: lexicon ≥ .9 wins)
  const lexDeptConf = explicit.has('department')
    ? 1
    : (lex.assumptions.find((a) => a.slot === 'department')?.confidence ?? 0)
  merged.recipient = {
    ...merged.recipient,
    kind: llm.recipient.kind,
    relation:
      llm.recipient.relation && (RELATIONS as readonly string[]).includes(llm.recipient.relation)
        ? llm.recipient.relation
        : merged.recipient.relation,
    label: llm.recipient.label ?? merged.recipient.label,
  }
  if (lexDeptConf < 0.9 && llm.recipient.department && DEPARTMENTS.has(llm.recipient.department)) {
    const d = llm.recipient.department as Department
    merged.department = d
    merged.recipient.department =
      merged.recipient.kind === 'other' ? d : merged.recipient.department
    for (let i = assumptions.length - 1; i >= 0; i--) {
      if (assumptions[i]!.slot === 'department' || assumptions[i]!.slot === 'recipient.department')
        assumptions.splice(i, 1)
    }
    assumptions.push({
      slot: 'department',
      value: d,
      confidence: 0.8,
      reason: t(locale, '由語意模型推測', 'Inferred by the language model'),
      source: 'llm',
    })
  }
  if (merged.recipient.kind !== 'other') delete merged.recipient.department

  // numbers: lexicon wins when it found a number
  const lexFoundNumber = lex.budget?.originalAmount !== undefined
  if (!lexFoundNumber && llm.budgetRaw.amount !== null && llm.budgetRaw.amount > 0) {
    const code = llm.budgetRaw.currency
      ? (currencyForToken(llm.budgetRaw.currency) ??
        (llm.budgetRaw.currency.toUpperCase().length === 3
          ? llm.budgetRaw.currency.toUpperCase()
          : 'TWD'))
      : 'TWD'
    const amount = toTwd(llm.budgetRaw.amount, code)
    const kind = llm.budgetRaw.kind ?? 'max'
    const amount2 = llm.budgetRaw.amount2 !== null ? toTwd(llm.budgetRaw.amount2, code) : undefined
    merged.budget = {
      currency: 'TWD',
      originalAmount: llm.budgetRaw.amount,
      originalCurrency: code,
      strictness: kind === 'around' ? 'soft' : 'hard',
      ...(kind === 'max' ? { max: amount } : {}),
      ...(kind === 'min' ? { min: amount } : {}),
      ...(kind === 'around'
        ? { min: Math.round(amount * 0.75), max: Math.round(amount * 1.25) }
        : {}),
      ...(kind === 'range' ? { min: amount, max: amount2 ?? amount } : {}),
      ...(llm.budgetRaw.scope ? { scope: llm.budgetRaw.scope } : {}),
    }
    explicit.add('budget')
    assumptions.push({
      slot: 'budget',
      value: `${llm.budgetRaw.amount} ${code}`,
      confidence: 0.7,
      reason: t(locale, '由語意模型讀出金額', 'Amount read by the language model'),
      source: 'llm',
    })
  }
  if (!explicit.has('sizes') && llm.sizes.length > 0) {
    const sizes: Record<string, string> = {}
    for (const s of llm.sizes)
      if (['alpha', 'numeric-waist', 'eu-shoe'].includes(s.system))
        sizes[s.system] = s.value.toUpperCase()
    if (Object.keys(sizes).length > 0) merged.sizes = sizes
  }
  if (!explicit.has('quantity') && llm.quantity !== null && llm.quantity >= 1 && llm.quantity <= 8)
    merged.quantity = llm.quantity

  // references
  if (!merged.referenceHandle && llm.referenceHandle) {
    merged.referenceHandle = llm.referenceHandle
    merged.referenceRole = llm.referenceRole ?? 'style-source'
    const contact = (ctx.contacts ?? []).find(
      (c) =>
        c.displayName.toLowerCase() === llm.referenceHandle!.toLowerCase() ||
        c.handle.toLowerCase() === llm.referenceHandle!.toLowerCase(),
    )
    if (contact?.latestCardId) merged.referenceCardId = contact.latestCardId
  }

  // assumptions: union by slot keeping the higher confidence
  for (const a of llm.assumptions) {
    const existing = assumptions.find((x) => x.slot === a.slot)
    if (existing) {
      if (a.confidence > existing.confidence)
        Object.assign(existing, {
          value: a.value,
          confidence: a.confidence,
          reason: a.reason,
          source: 'llm',
        })
    } else assumptions.push({ ...a, source: 'llm' })
  }
  const vibeLower = (merged.vibe ?? '').toLowerCase()
  const unmapped = Array.from(
    new Set(rawMentions.map((x) => x.trim()).filter((x) => x.length > 0)),
  ).filter((x) => !vibeLower.includes(x.toLowerCase()))
  if (unmapped.length > 0) {
    merged.vibe = [merged.vibe, ...unmapped].filter((x): x is string => Boolean(x)).join(' ')
    assumptions.push({
      slot: 'vibe',
      value: unmapped.join(', '),
      confidence: 0.3,
      reason: t(locale, '無法對應到型錄詞彙', 'Could not map to catalog terms'),
      source: 'llm',
    })
  }

  signals.explicitSlots = Array.from(explicit)
  merged.signals = signals
  merged.assumptions = assumptions
  merged.parser = 'merged'
  const out = finalize(merged, ctx)
  for (const c of llm.clarifications) {
    if (out.clarifications.length >= 2) break
    if (out.clarifications.some((x) => x.slot === c.slot) || c.options.length < 2) continue
    out.clarifications.push({
      slot: c.slot,
      question: c.question,
      options: c.options.slice(0, 5),
      blocking: false,
    })
  }
  return out
}
