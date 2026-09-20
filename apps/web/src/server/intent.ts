import { after } from 'next/server'
import { nanoid } from 'nanoid'
import { eq, intentSessions, users, type IntentProvider, type User } from '@lookline/db'
import {
  getLlm,
  parseIntent,
  recommend,
  type IntentResultExt,
  type FactorName,
  type Intent,
  type IntentContext,
  type Outfit,
  type RankedItem,
} from '@lookline/engine'
import { recordFeedbackFor } from '@/server/actions/feedback'
import { getDb } from '@/server/db'

/**
 * "Say it in one sentence" — the Engine 01 + 02 call path behind `/` and `POST /api/intent`.
 *
 * Two stages so the page can stream: `understand()` (previous-turn lookup, `parseIntent`,
 * `intent_sessions` insert) runs first and renders the intent card; `recommendFor()`
 * (`recommend`, results update, impression feedback) is awaited inside Suspense boundaries.
 * Every engine call is wrapped separately: a stub or provider failure becomes an `EngineFailure`
 * that the UI renders as a Notice, and the parts that worked still show.
 */

export const INTENT_LIMIT = 24
export const OUTFIT_COUNT = 3
export const IMPRESSION_COUNT = 12
export const MAX_UTTERANCE = 500

export type UserLocale = 'zh-TW' | 'en'

export interface EngineFailure {
  ok: false
  /** Engine function that failed, e.g. `parseIntent`. */
  capability: string
  message: string
}

export interface ParseOk {
  ok: true
  intent: Intent
  vector: number[]
  /** `jev` when the decision stage answered on its own, otherwise the generative provider. */
  provider: IntentProvider
  latencyMs: number
  /** Model behind `provider`, when the client can tell us. */
  model: string | null
  /** Set when the route escalated and the refinement is running in `after()`. */
  refining?: boolean
}

export interface Understanding {
  sessionId: string
  q: string
  /** The sentence actually parsed: `q` plus clarification answers as natural text. */
  utterance: string
  clarify: ClarificationAnswer[]
  locale: UserLocale
  previousSessionId: string | null
  previousIntent: Intent | null
  previousError: string | null
  /** Whether the `intent_sessions` row was written (false when Postgres is unreachable). */
  persisted: boolean
  parse: ParseOk | EngineFailure
}

export interface RecommendOk {
  ok: true
  items: RankedItem[]
  outfits: Outfit[]
  candidates: number
  weights: Record<FactorName, number>
  timings: Record<string, number>
  /** The bandit's blend arm, logged on every impression of this slate (§4.4). */
  arm?: { name: string; contextVector: number[] }
}

export interface Recommendation {
  result: RecommendOk | EngineFailure
  /** Impression feedback events written for the signed-in user. */
  impressions: number
}

export interface IntentRun {
  understanding: Understanding
  recommendation: Recommendation
}

export interface RunIntentInput {
  q: string
  /** Raw `?clarify=` values, each `<slot>:<value>`. */
  clarify?: string[]
  previousSessionId?: string | null
  user: User | null
  offline?: boolean
  signal?: AbortSignal
}

export interface ClarificationAnswer {
  slot: string
  value: string
}

// ---------------------------------------------------------------------------
// Clarification answers → natural text
// ---------------------------------------------------------------------------

const SLOT_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{0,40}$/

/** Parse `slot:value` tokens; malformed entries are dropped, duplicates keep the last answer. */
export function parseClarifications(raw: readonly string[] | undefined): ClarificationAnswer[] {
  if (!raw) return []
  const bySlot = new Map<string, string>()
  for (const entry of raw) {
    const colon = entry.indexOf(':')
    if (colon <= 0) continue
    const slot = entry.slice(0, colon).trim()
    const value = entry
      .slice(colon + 1)
      .trim()
      .slice(0, 80)
    if (!SLOT_PATTERN.test(slot) || !value) continue
    bySlot.set(slot, value)
  }
  return [...bySlot].map(([slot, value]) => ({ slot, value }))
}

const CJK = /[㐀-䶿一-鿿豈-﫿　-〿＀-￯]/gu

/** Locale for the engine context: CJK share ≥ 30% (or any CJK when Latin is scarce) → zh-TW. */
export function detectLocale(text: string): UserLocale {
  const cjk = text.match(CJK)?.length ?? 0
  const letters = text.replace(/[\s\d\p{P}]/gu, '').length
  if (cjk === 0 || letters === 0) return 'en'
  return cjk / letters >= 0.3 ? 'zh-TW' : 'en'
}

const DEPARTMENT_PHRASES: Record<UserLocale, Record<string, string>> = {
  en: { women: 'for a woman', men: 'for a man', unisex: 'unisex is fine', kids: 'for a kid' },
  'zh-TW': { women: '女裝', men: '男裝', unisex: '中性就好', kids: '童裝' },
}

const RECIPIENT_DEPARTMENT_PHRASES: Record<UserLocale, Record<string, string>> = {
  en: { women: 'she is a woman', men: 'he is a man', unisex: 'unisex is fine' },
  'zh-TW': { women: '對方是女生', men: '對方是男生', unisex: '中性就好' },
}

const GROUP_PHRASES: Record<UserLocale, Record<string, string>> = {
  en: {
    tops: 'a top',
    bottoms: 'bottoms',
    dresses: 'a dress',
    outerwear: 'outerwear',
    footwear: 'shoes',
    bags: 'a bag',
    accessories: 'an accessory',
    jewelry: 'jewelry',
    activewear: 'activewear',
    swimwear: 'swimwear',
    loungewear: 'loungewear',
    tailoring: 'tailoring',
  },
  'zh-TW': {
    tops: '上衣',
    bottoms: '下身',
    dresses: '洋裝',
    outerwear: '外套',
    footwear: '鞋子',
    bags: '包包',
    accessories: '配件',
    jewelry: '飾品',
    activewear: '運動服',
    swimwear: '泳裝',
    loungewear: '居家服',
    tailoring: '西裝',
  },
}

const OCCASION_PHRASES: Record<UserLocale, Record<string, string>> = {
  en: {
    'wedding-guest': 'for a wedding',
    office: 'for the office',
    interview: 'for an interview',
    date: 'for a date',
    party: 'for a party',
    festival: 'for a festival',
    travel: 'for travel',
    hiking: 'for hiking',
    gym: 'for the gym',
    beach: 'for the beach',
    'casual-daily': 'for everyday',
    graduation: 'for graduation',
    funeral: 'for a funeral',
    school: 'for school',
    gala: 'for a gala',
    'lunar-new-year': 'for lunar new year',
    concert: 'for a concert',
    'family-gathering': 'for a family gathering',
  },
  'zh-TW': {
    'wedding-guest': '婚禮',
    office: '上班',
    interview: '面試',
    date: '約會',
    party: '派對',
    festival: '音樂祭',
    travel: '旅行',
    hiking: '登山',
    gym: '健身',
    beach: '海邊',
    'casual-daily': '日常',
    graduation: '畢業典禮',
    funeral: '告別式',
    school: '上學',
    gala: '晚宴',
    'lunar-new-year': '過年',
    concert: '演唱會',
    'family-gathering': '家庭聚會',
  },
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** A clarification answer as the words a person would have said, in the sentence's language. */
export function clarificationPhrase(answer: ClarificationAnswer, locale: UserLocale): string {
  const { slot, value } = answer
  const zh = locale === 'zh-TW'
  const lower = value.toLowerCase()
  switch (slot) {
    case 'department':
      return DEPARTMENT_PHRASES[locale][lower] ?? value
    case 'recipient.department':
      return RECIPIENT_DEPARTMENT_PHRASES[locale][lower] ?? value
    case 'categoryGroups':
    case 'categoryGroup':
      return GROUP_PHRASES[locale][lower] ?? value
    case 'budget.max':
    case 'budget': {
      if (lower === 'none' || lower === 'no limit' || lower === '不限') {
        return zh ? '預算不限' : 'no budget limit'
      }
      const amount = Number(value.replace(/[^0-9.]/g, ''))
      if (!Number.isFinite(amount) || amount <= 0) return value
      return zh
        ? `預算 ${numberFormat.format(amount)} 元`
        : `budget NT$${numberFormat.format(amount)}`
    }
    case 'budget.currency':
      if (lower === 'usd') return zh ? '金額是美金' : 'the amount is in US dollars'
      if (lower === 'twd') return zh ? '金額是台幣' : 'the amount is in TWD'
      return value
    case 'sizes.alpha':
    case 'sizes.numeric-waist':
    case 'sizes.eu-shoe':
      return zh ? `尺寸 ${value.toUpperCase()}` : `size ${value.toUpperCase()}`
    case 'occasion':
      return (
        OCCASION_PHRASES[locale][lower] ??
        (zh ? `場合是${value}` : `for ${value.replace(/-/g, ' ')}`)
      )
    case 'season':
      return zh ? `${value}穿` : `for ${value.replace(/-/g, ' ')}`
    case 'referenceCardId':
      return zh ? `我指的是 Card ${value}` : `I mean Card ${value}`
    case 'mode':
      if (lower === 'outfit') return zh ? '幫我配整套' : 'the whole outfit'
      if (lower === 'single') return zh ? '只要單品' : 'just one piece'
      return value
    default: {
      const leaf = slot.split('.').pop() ?? slot
      return `${leaf.replace(/[-_]/g, ' ')} ${value}`
    }
  }
}

/** `q` plus every clarification answer, joined the way the locale joins clauses. */
export function buildUtterance(
  q: string,
  clarify: readonly ClarificationAnswer[],
  locale: UserLocale,
): string {
  const base = q.trim().slice(0, MAX_UTTERANCE)
  if (clarify.length === 0) return base
  const phrases = clarify.map((answer) => clarificationPhrase(answer, locale))
  const joined =
    locale === 'zh-TW' ? `${base}，${phrases.join('，')}` : `${base}, ${phrases.join(', ')}`
  return joined.slice(0, MAX_UTTERANCE)
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/** Preserve a renderable error without obsolete stub-specific behavior. */
export function describeEngineError(error: unknown, capability: string): EngineFailure {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, capability, message: message.slice(0, 300) }
}

function isIntent(value: unknown): value is Intent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { utterance?: unknown }).utterance === 'string' &&
    typeof (value as { mode?: unknown }).mode === 'string'
  )
}

function toJson<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function llmModel(): string | null {
  return getLlm().textModel
}

// ---------------------------------------------------------------------------
// Stage 1 — understand
// ---------------------------------------------------------------------------

async function loadPreviousIntent(
  sessionId: string,
): Promise<{ intent: Intent | null; error: string | null }> {
  try {
    const [row] = await getDb()
      .db.select({ intent: intentSessions.intent })
      .from(intentSessions)
      .where(eq(intentSessions.id, sessionId))
      .limit(1)
    if (!row) return { intent: null, error: 'The previous turn could not be found.' }
    if (!isIntent(row.intent)) return { intent: null, error: 'The previous turn is unreadable.' }
    return { intent: row.intent, error: null }
  } catch (error) {
    console.warn('[intent] previous session lookup failed', error)
    return { intent: null, error: 'The previous turn could not be loaded.' }
  }
}

function intentContext(
  user: User | null,
  locale: UserLocale,
  previousIntent: Intent | null,
): IntentContext {
  const ctx: IntentContext = { locale, previousIntent }
  if (user) {
    ctx.userId = user.id
    ctx.user = {
      department: user.department,
      budgetHint: user.budgetHint,
      displayName: user.displayName,
      preferenceVector: user.preferenceVector,
    }
  }
  return ctx
}

/** Previous-turn lookup → `parseIntent` → `intent_sessions` insert. Never throws. */
export async function understand(input: RunIntentInput): Promise<Understanding> {
  const q = input.q.trim().slice(0, MAX_UTTERANCE)
  const clarify = parseClarifications(input.clarify)
  const locale = detectLocale(q)
  const utterance = buildUtterance(q, clarify, locale)
  const sessionId = nanoid()
  const previousSessionId = input.previousSessionId?.trim() || null

  const previous = previousSessionId
    ? await loadPreviousIntent(previousSessionId)
    : { intent: null, error: null }

  let parse: ParseOk | EngineFailure
  let refine: (() => Promise<IntentResultExt>) | null = null
  try {
    const result = await parseIntent(utterance, {
      ...intentContext(input.user, locale, previous.intent),
      offline: input.offline,
      signal: input.signal,
      // The decision stage is fast enough to answer in band; the generative escalation is not,
      // so it runs after the response and rewrites the session row.
      deferRefinement: true,
    })
    refine = result.refine ?? null
    parse = {
      ok: true,
      intent: result.intent,
      vector: result.vector,
      provider: result.provider,
      latencyMs: result.latencyMs,
      model: result.model ?? (result.provider === 'offline' ? null : llmModel()),
      refining: refine !== null,
    }
  } catch (error) {
    parse = describeEngineError(error, 'parseIntent')
  }

  let persisted = false
  if (parse.ok) {
    try {
      await getDb()
        .db.insert(intentSessions)
        .values({
          id: sessionId,
          userId: input.user?.id ?? null,
          utterance,
          locale: parse.intent.locale,
          intent: toJson(parse.intent),
          intentVector: parse.vector.length === 64 ? parse.vector : null,
          provider: parse.provider,
          latencyMs: Math.round(parse.latencyMs),
        })
      persisted = true
    } catch (error) {
      console.warn('[intent] could not persist intent session', error)
    }
  }

  if (parse.ok && persisted && refine) {
    const run = refine
    after(async () => {
      try {
        const refined = await run()
        await getDb()
          .db.update(intentSessions)
          .set({
            intent: toJson(refined.intent),
            intentVector: refined.vector.length === 64 ? refined.vector : null,
            provider: refined.provider,
            latencyMs: Math.round(refined.latencyMs),
          })
          .where(eq(intentSessions.id, sessionId))
      } catch (error) {
        console.warn('[intent] refinement failed; the decision stands', error)
      }
    })
  }

  return {
    sessionId,
    q,
    utterance,
    clarify,
    locale,
    previousSessionId,
    previousIntent: previous.intent,
    previousError: previous.error,
    persisted,
    parse,
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — recommend
// ---------------------------------------------------------------------------

/** `recommend` → results update → impression feedback for the top items. Never throws. */
export async function recommendFor(
  understanding: Understanding,
  userId: string | null,
  logImpressions = true,
): Promise<Recommendation> {
  const { parse, sessionId } = understanding
  if (!parse.ok) {
    return {
      result: {
        ok: false,
        capability: 'recommend',
        message: 'Nothing to rank: the sentence was not understood.',
      },
      impressions: 0,
    }
  }

  let result: RecommendOk | EngineFailure
  try {
    const response = await recommend(getDb().db, {
      intent: parse.intent,
      userId: userId ?? undefined,
      limit: INTENT_LIMIT,
      outfits: parse.intent.mode !== 'single',
      outfitCount: OUTFIT_COUNT,
      intentSessionId: sessionId,
    })
    result = {
      ok: true,
      items: response.items,
      outfits: response.outfits,
      candidates: response.candidates,
      weights: response.weights,
      timings: response.timings,
      arm: response.arm,
    }
  } catch (error) {
    result = describeEngineError(error, 'recommend')
  }

  if (!result.ok) return { result, impressions: 0 }

  after(async () => {
    if (understanding.persisted) {
      try {
        await getDb()
          .db.update(intentSessions)
          .set({
            results: {
              items: result.items.map((item, index) => ({
                id: item.product.id,
                score: item.score,
                position: index + 1,
              })),
              outfits: result.outfits.map((outfit) => ({
                id: outfit.id,
                articleIds: outfit.items.map((item) => item.product.id),
                total: outfit.total,
                compatibility: outfit.compatibility,
              })),
              candidates: result.candidates,
              weights: result.weights,
              timings: result.timings,
            },
          })
          .where(eq(intentSessions.id, sessionId))
      } catch (error) {
        console.warn('[intent] could not store results', error)
      }
    }

    if (userId && logImpressions) {
      await Promise.all(
        result.items.slice(0, IMPRESSION_COUNT).map((item, index) =>
          recordFeedbackFor(userId, {
            kind: 'impression',
            articleId: item.product.id,
            intentSessionId: sessionId,
            position: index + 1,
            forOthers: parse.intent.recipient.kind === 'other',
            // Without both of these the slate's reward cannot be attributed to the arm (§4.4).
            ...(result.arm
              ? { context: { armId: result.arm.name, contextVector: result.arm.contextVector } }
              : {}),
          }),
        ),
      )
    }
  })

  return { result, impressions: 0 }
}

/** Both stages in sequence — for the JSON endpoint and anything that needs the full result. */
export async function runIntent(input: RunIntentInput): Promise<IntentRun> {
  const understanding = await understand(input)
  const recommendation = await recommendFor(understanding, input.user?.id ?? null)
  return { understanding, recommendation }
}

/** Load a user row by id for the API endpoint (`userId` in the body). Null when unknown. */
export async function loadUserForIntent(userId: string): Promise<User | null> {
  try {
    const [row] = await getDb().db.select().from(users).where(eq(users.id, userId)).limit(1)
    return row ?? null
  } catch (error) {
    console.warn('[intent] user lookup failed', error)
    return null
  }
}
