/**
 * Budget extraction (ENGINE_SPEC §1.4.2, §0.7): qualifiers around a money number, currency
 * detection within 2 characters, bare-`$` locale rule, fixed-rate conversion to TWD.
 */
import { currencyForToken, currencyRate, toTwd } from '../constants'
import type { Hit } from './lexicon'
import type { Locale } from './normalize'
import type { NumberToken } from './numbers'
import type { IntentAssumptionExt, IntentBudget } from './schema'

export interface BudgetExtraction {
  budget: IntentBudget
  assumptions: IntentAssumptionExt[]
  /** Consumed spans in the text. */
  spans: Array<[number, number]>
  numbers: NumberToken[]
  /** Below .75 ⇒ non-blocking `budget.currency` clarification. */
  currencyConfidence: number
  qualifier: 'max' | 'min' | 'around' | 'range' | 'soft' | 'bare'
}

interface CurrencyPick {
  code: string
  confidence: number
  span?: [number, number]
  bare: boolean
}

const strip = (s: string): string => s.replace(/[\s$€£¥₩,:：]/g, '')

const nearby = (hits: readonly Hit[], section: Hit['section'], text: string, n: NumberToken) =>
  hits.filter((h) => h.section === section && !h.negated && isAdjacent(text, h, n, hits))

/** Adjacent = only whitespace, punctuation or currency tokens between the hit and the number. */
function isAdjacent(text: string, h: Hit, n: NumberToken, hits: readonly Hit[]): boolean {
  const currencies = hits.filter((c) => c.section === 'currency')
  const between = h.end <= n.start ? [h.end, n.start] : [n.end, h.start]
  const [from, to] = between as [number, number]
  if (from > to) return false
  let gap = text.slice(from, to)
  for (const c of currencies) {
    if (c.start >= from && c.end <= to) gap = gap.replace(c.term, ' ')
  }
  return strip(gap).length === 0
}

function pickCurrency(
  text: string,
  n: NumberToken,
  hits: readonly Hit[],
  locale: Locale,
  hasQualifier: boolean,
): CurrencyPick | null {
  const tokens = hits.filter((h) => h.section === 'currency')
  for (const t of tokens) {
    const gap = t.end <= n.start ? text.slice(t.end, n.start) : text.slice(n.end, t.start)
    if (t.end > n.start && t.start < n.end) continue
    if (strip(gap).length > 0 || gap.length > 2) continue
    if (t.term === '$') {
      if (locale === 'en') {
        return n.value < 1000
          ? { code: 'USD', confidence: 0.7, span: [t.start, t.end], bare: true }
          : { code: 'TWD', confidence: 0.6, span: [t.start, t.end], bare: true }
      }
      return { code: 'TWD', confidence: 0.85, span: [t.start, t.end], bare: true }
    }
    const code = currencyForToken(t.term)
    if (code) return { code, confidence: 1, span: [t.start, t.end], bare: false }
  }
  if (hasQualifier) return { code: 'TWD', confidence: locale === 'en' ? 0.75 : 0.9, bare: false }
  return null
}

const t = (locale: Locale, zh: string, en: string): string => (locale === 'en' ? en : zh)

/** Extract the budget from money-eligible numbers and the qualifier/currency/scope hits. */
export function extractBudget(input: {
  text: string
  raw: string
  numbers: readonly NumberToken[]
  hits: readonly Hit[]
  locale: Locale
  mode: 'single' | 'outfit' | 'browse'
}): BudgetExtraction | null {
  const { text, raw, numbers, hits, locale } = input
  const candidates = numbers.filter((n) => !n.bare)
  if (candidates.length === 0) return null

  // range: N 到 M / N~M / N-M / N to M / between N and M
  for (let i = 0; i + 1 < candidates.length; i++) {
    const a = candidates[i]!
    const b = candidates[i + 1]!
    const gap = text.slice(a.end, b.start).trim()
    const connector =
      /^(到|至|~|〜|-|–|—|to|and)$/.test(strip(gap).replace(/^(nt\$|us\$|\$)/, '')) ||
      /^[$€£¥₩\s]*(到|至|~|〜|-|–|—|to|and)[\s$€£¥₩]*(nt\$|us\$)?$/.test(gap)
    if (!connector) continue
    if (
      gap.trim().endsWith('and') &&
      !/between|介於/.test(text.slice(Math.max(0, a.start - 10), a.start))
    )
      continue
    const currency =
      pickCurrency(text, b, hits, locale, true) ?? pickCurrency(text, a, hits, locale, true)
    if (!currency) continue
    const min = toTwd(a.value, currency.code)
    const max = toTwd(b.value, currency.code)
    const spanStart = Math.min(
      a.start,
      ...hits
        .filter(
          (h) => h.section === 'qualifier' && h.value === 'between' && isAdjacent(text, h, a, hits),
        )
        .map((h) => h.start),
    )
    const spanEnd = Math.max(b.end, currency.span?.[1] ?? 0)
    return finish(
      { min, max, strictness: 'hard' },
      'range',
      [spanStart, spanEnd],
      [a, b],
      currency,
      a.value,
      b.value,
    )
  }

  for (const n of candidates) {
    const qualifiers = nearby(hits, 'qualifier', text, n).filter((q) => {
      const side = (q.meta as { side: 'before' | 'after' | 'both' }).side
      const isBefore = q.end <= n.start
      return side === 'both' || (side === 'before' && isBefore) || (side === 'after' && !isBefore)
    })
    const kinds = new Set(qualifiers.map((q) => q.value))
    const hasQualifier = qualifiers.length > 0 || nearby(hits, 'scope', text, n).length > 0
    const currency = pickCurrency(text, n, hits, locale, hasQualifier)
    if (!currency) continue
    const amount = toTwd(n.value, currency.code)
    const spanStart = Math.min(
      n.start,
      currency.span?.[0] ?? n.start,
      ...qualifiers.map((q) => q.start),
    )
    const spanEnd = Math.max(n.end, currency.span?.[1] ?? n.end, ...qualifiers.map((q) => q.end))
    const span: [number, number] = [spanStart, spanEnd]
    if (kinds.has('max'))
      return finish({ max: amount, strictness: 'hard' }, 'max', span, [n], currency, n.value)
    if (kinds.has('min'))
      return finish({ min: amount, strictness: 'hard' }, 'min', span, [n], currency, n.value)
    if (kinds.has('around')) {
      return finish(
        { min: Math.round(amount * 0.75), max: Math.round(amount * 1.25), strictness: 'soft' },
        'around',
        span,
        [n],
        currency,
        n.value,
      )
    }
    if (kinds.has('soft'))
      return finish({ max: amount, strictness: 'soft' }, 'soft', span, [n], currency, n.value)
    if (!currency.bare || hasQualifier) {
      return finish({ max: amount, strictness: 'soft' }, 'bare', span, [n], currency, n.value)
    }
    return finish({ max: amount, strictness: 'soft' }, 'bare', span, [n], currency, n.value)
  }
  return null

  function finish(
    core: { min?: number; max?: number; strictness: 'hard' | 'soft' | 'flexible' },
    qualifier: BudgetExtraction['qualifier'],
    span: [number, number],
    used: NumberToken[],
    currency: CurrencyPick,
    originalAmount: number,
    originalAmount2?: number,
  ): BudgetExtraction {
    const assumptions: IntentAssumptionExt[] = []
    const scopeHit = hits.find((h) => h.section === 'scope' && Math.abs(h.start - span[1]) <= 3)
    const original = raw.slice(span[0], span[1]).trim()
    const budget: IntentBudget = {
      ...core,
      currency: 'TWD',
      original,
      originalAmount,
      originalCurrency: currency.code,
    }
    if (scopeHit) {
      budget.scope = 'per_item'
      span[1] = Math.max(span[1], scopeHit.end)
    }
    if (currency.code !== 'TWD') {
      const value = budget.max ?? budget.min ?? 0
      const amountText =
        originalAmount2 === undefined ? `${originalAmount}` : `${originalAmount}–${originalAmount2}`
      assumptions.push({
        slot: 'budget.currency',
        value: currency.code,
        confidence: currency.confidence,
        reason: `${amountText} ${currency.code} → NT$${value.toLocaleString('en-US')} at fixed demo rate ${currencyRate(currency.code) ?? 1}`,
        source: 'utterance',
      })
    } else if (currency.confidence < 1) {
      assumptions.push({
        slot: 'budget.currency',
        value: 'TWD',
        confidence: currency.confidence,
        reason: currency.bare
          ? t(locale, '「$」讀作台幣', 'Bare "$" read as TWD')
          : t(locale, '未標示幣別，視為台幣', 'No currency given; read as TWD'),
        source: 'default',
      })
    }
    if (qualifier === 'soft' || qualifier === 'bare') {
      assumptions.push({
        slot: 'budget.strictness',
        value: 'soft',
        confidence: 0.8,
        reason: t(locale, '預算視為上限', 'Budget read as an upper bound'),
        source: 'utterance',
      })
    }
    return {
      budget,
      assumptions,
      spans: [span],
      numbers: used,
      currencyConfidence: currency.confidence,
      qualifier,
    }
  }
}

/** Defaults for `cheap` / `luxury` words with no number (§1.4.2). */
export function wordBudget(
  kind: 'cheap' | 'luxury',
  mode: 'single' | 'outfit' | 'browse',
): { budget: IntentBudget; priceTier: number } {
  if (kind === 'cheap') {
    return {
      budget: { currency: 'TWD', max: mode === 'outfit' ? 4000 : 1500, strictness: 'soft' },
      priceTier: 0.2,
    }
  }
  return {
    budget: { currency: 'TWD', min: mode === 'outfit' ? 25000 : 8000, strictness: 'soft' },
    priceTier: 0.85,
  }
}
