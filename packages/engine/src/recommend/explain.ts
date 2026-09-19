/**
 * Explanation rendering (ENGINE_SPEC §2.5): the factor list, the bilingual deterministic summary
 * and the optional LLM polish guarded by `assertGrounded` (never required).
 */
import { z } from 'zod'
import type { Explanation, ExplanationFactor, FactorName, RankedItem } from '../types'
import type { Locale } from './intent-view'
import type { FactorResult } from './factors'

export interface DetailedFactor extends ExplanationFactor {
  applicable: boolean
  details?: Record<string, unknown>
}

export const SUMMARY_MAX_EN = 140
export const SUMMARY_MAX_ZH = 60

const RELAX_CAVEAT: Readonly<Record<string, { en: string; zh: string }>> = {
  subcategories: { en: 'subcategory filter relaxed', zh: '放寬了品項條件' },
  price: { en: 'price ceiling relaxed', zh: '放寬了價格上限' },
  unisex: { en: 'unisex items included', zh: '納入了中性款' },
  color: { en: 'colour exclusions relaxed', zh: '放寬了顏色排除' },
  groups: { en: 'category filter relaxed', zh: '放寬了分類條件' },
}

export function toExplanationFactor(r: FactorResult, weight: number): DetailedFactor {
  const w = r.applicable ? weight : 0
  const factor: DetailedFactor = {
    factor: r.factor,
    weight: w,
    value: r.value,
    contribution: w * r.value,
    evidence: r.evidence,
    applicable: r.applicable,
  }
  if (r.details) factor.details = r.details
  return factor
}

export function sortFactors<T extends ExplanationFactor>(factors: T[]): T[] {
  return factors.toSorted(
    (a, b) =>
      Math.abs(b.contribution) - Math.abs(a.contribution) || a.factor.localeCompare(b.factor),
  )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export interface SummaryOptions {
  relaxed?: readonly string[]
  /** Extra caveats already localised (e.g. outfit over-budget). */
  caveats?: readonly string[]
}

/**
 * Top ≤ 3 factors with contribution ≥ 0.04 and value ≥ 0.5 joined by `; ` / `；`, length-capped,
 * followed by a parenthesised caveat when budget_fit < 0.7 or a relaxation happened.
 */
export function renderSummary(
  factors: readonly ExplanationFactor[],
  locale: Locale,
  opts: SummaryOptions = {},
): string {
  const sorted = sortFactors([...factors])
  const fragments = sorted
    .filter((f) => f.contribution >= 0.04 && f.value >= 0.5 && f.evidence.length > 0)
    .filter((f) => !(f.factor === 'budget_fit' && f.value < 0.7))
    .slice(0, 3)
    .map((f) => f.evidence)
  const sep = locale === 'zh' ? '；' : '; '
  const max = locale === 'zh' ? SUMMARY_MAX_ZH : SUMMARY_MAX_EN
  let body = ''
  for (const frag of fragments) {
    const next = body ? `${body}${sep}${frag}` : frag
    if (next.length > max) break
    body = next
  }
  if (!body && fragments.length > 0) body = truncate(fragments[0]!, max)
  if (!body) body = locale === 'zh' ? '與你的需求整體最相符' : 'best overall fit for your request'

  const caveats: string[] = []
  const budget = factors.find((f) => f.factor === 'budget_fit')
  if (budget && budget.weight > 0 && budget.value < 0.7) {
    const over = /(\d+)% over budget|超出預算 (\d+)%/.exec(budget.evidence)
    const pct = over?.[1] ?? over?.[2]
    if (pct) caveats.push(locale === 'zh' ? `超出預算 ${pct}%` : `${pct}% over budget`)
    else caveats.push(locale === 'zh' ? '預算不太合' : 'outside the budget')
  }
  for (const step of opts.relaxed ?? []) {
    const c = RELAX_CAVEAT[step]
    if (c) caveats.push(locale === 'zh' ? c.zh : c.en)
  }
  caveats.push(...(opts.caveats ?? []))
  if (caveats.length === 0) return body
  const uniq = [...new Set(caveats)]
  return locale === 'zh' ? `${body}（${uniq.join('；')}）` : `${body} (${uniq.join('; ')})`
}

export function buildExplanation(
  factors: DetailedFactor[],
  locale: Locale,
  opts: SummaryOptions = {},
): Explanation {
  const sorted = sortFactors(factors)
  return { summary: renderSummary(sorted, locale, opts), factors: sorted }
}

/** Σ contribution of the listed factors. */
export function sumContributions(factors: readonly ExplanationFactor[]): number {
  let s = 0
  for (const f of factors) s += f.contribution
  return s
}

export function factorByName(
  factors: readonly ExplanationFactor[],
  name: FactorName,
): ExplanationFactor | undefined {
  return factors.find((f) => f.factor === name)
}

// ---------------------------------------------------------------------------
// LLM polish (optional): grounded rewrite of the deterministic summary
// ---------------------------------------------------------------------------

/**
 * Every digit sequence and every capitalised / brand / person token of `text` must appear in the
 * evidence; otherwise the polished sentence is rejected.
 */
export function assertGrounded(text: string, evidence: readonly string[]): boolean {
  const hay = evidence.join('\n')
  const hayLower = hay.toLowerCase()
  for (const num of text.match(/\d[\d,.]*/g) ?? []) {
    const clean = num.replace(/[.,]+$/, '')
    if (!clean) continue
    if (!hay.includes(clean) && !hay.includes(clean.replace(/,/g, ''))) return false
  }
  for (const tok of text.match(/\b[A-Z][A-Za-z0-9'-]+\b/g) ?? []) {
    if (tok.length < 2) continue
    if (!hayLower.includes(tok.toLowerCase())) return false
  }
  return true
}

const PolishSchema = z.object({
  sentences: z.array(z.object({ articleId: z.number(), text: z.string() })),
})

export interface PolishOptions {
  timeoutMs?: number
  /** Injected for tests; defaults to `getLlm()` from `../llm`. */
  generateJson?: <T>(req: {
    schema: z.ZodType<T>
    system: string
    prompt: string
    purpose?: string
  }) => Promise<T | null>
}

const prosePolishCache = new Map<string, string>()
const PROSE_CACHE_MAX = 500

function cacheKey(articleId: number, summary: string): string {
  return `${articleId}:${summary}`
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Adds `explanation.prose` to items whose LLM rewrite passes `assertGrounded`. Never throws and
 * never required: with no provider (or any failure) the items are returned unchanged.
 */
export async function polishWithLlm(
  items: RankedItem[],
  locale: Locale,
  opts: PolishOptions = {},
): Promise<RankedItem[]> {
  if (items.length === 0) return items
  const pending = items.filter(
    (it) => !prosePolishCache.has(cacheKey(it.product.id, it.explanation.summary)),
  )
  let generate = opts.generateJson
  if (!generate && pending.length > 0) {
    try {
      const mod = await import('../llm')
      const llm = mod.getLlm()
      if (llm.provider === 'offline') generate = undefined
      else generate = (req) => llm.generateJson(req)
    } catch {
      generate = undefined
    }
  }
  if (generate && pending.length > 0) {
    const localeName = locale === 'zh' ? 'Traditional Chinese (zh-TW)' : 'English'
    const prompt = [
      `Rewrite each template sentence into one natural ${localeName} sentence ≤ 25 words / 40 CJK chars using only the facts given. No marketing adjectives.`,
      ...pending.map(
        (it) =>
          `- articleId ${it.product.id} (${it.brandName} ${it.product.name}): ${it.explanation.summary}`,
      ),
    ].join('\n')
    try {
      const result = await withTimeout(
        generate({
          schema: PolishSchema,
          system: 'You rewrite product recommendation explanations. Output JSON only.',
          prompt,
          purpose: 'explain-polish',
        }),
        opts.timeoutMs ?? 4000,
      )
      if (result) {
        for (const s of result.sentences) {
          const item = pending.find((it) => it.product.id === s.articleId)
          if (!item) continue
          const evidence = [
            item.explanation.summary,
            ...item.explanation.factors.map((f) => f.evidence),
            item.brandName,
            item.product.name,
          ]
          if (!assertGrounded(s.text, evidence)) continue
          if (prosePolishCache.size >= PROSE_CACHE_MAX) {
            const first = prosePolishCache.keys().next().value
            if (first !== undefined) prosePolishCache.delete(first)
          }
          prosePolishCache.set(cacheKey(item.product.id, item.explanation.summary), s.text)
        }
      }
    } catch {
      // provider failure: fall through with the deterministic summaries
    }
  }
  return items.map((it) => {
    const prose = prosePolishCache.get(cacheKey(it.product.id, it.explanation.summary))
    return prose ? { ...it, explanation: { ...it.explanation, prose } } : it
  })
}
