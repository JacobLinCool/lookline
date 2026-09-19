/**
 * Fixed demo currency rates (ENGINE_SPEC §0.7), TWD per unit, and the §0 rounding rule.
 */
export interface CurrencyDef {
  code: string
  rate: number
  /** Lower-case tokens; matched case-insensitively within 2 characters of the amount. */
  tokens: readonly string[]
}

export const CURRENCY_RATES: readonly CurrencyDef[] = [
  { code: 'TWD', rate: 1, tokens: ['nt$', 'ntd', 'twd', '元', '塊', '台幣', '新台幣', 'nt'] },
  { code: 'USD', rate: 32, tokens: ['us$', 'usd', '美金', '美元', 'dollars', 'bucks'] },
  { code: 'JPY', rate: 0.21, tokens: ['jpy', '¥', '円', '日圓', '日幣', 'yen'] },
  { code: 'EUR', rate: 35, tokens: ['eur', '€', '歐元', 'euro', 'euros'] },
  { code: 'GBP', rate: 41, tokens: ['gbp', '£', '英鎊', 'pound', 'pounds'] },
  { code: 'KRW', rate: 0.024, tokens: ['krw', '₩', '韓元', 'won'] },
  { code: 'CNY', rate: 4.4, tokens: ['cny', 'rmb', '人民幣', 'yuan'] },
  { code: 'HKD', rate: 4.1, tokens: ['hkd', 'hk$', '港幣'] },
  { code: 'SGD', rate: 24, tokens: ['sgd', 's$', '新幣'] },
  { code: 'AUD', rate: 21, tokens: ['aud', 'a$', '澳幣'] },
]

const BY_CODE = new Map(CURRENCY_RATES.map((c) => [c.code, c]))

export function currencyRate(code: string): number | undefined {
  return BY_CODE.get(code.toUpperCase())?.rate
}

/**
 * Converted-budget rounding: nearest 100 when ≥ 10 000, nearest 50 when ≥ 1 000, else nearest 10
 * (never below 10). Keeps the spec examples (€50 → 1 750, ¥30 000 → 6 300, $100 → 3 200).
 */
export function roundTwd(x: number): number {
  const r =
    x >= 10000
      ? Math.round(x / 100) * 100
      : x >= 1000
        ? Math.round(x / 50) * 50
        : Math.round(x / 10) * 10
  return Math.max(10, r)
}

/** `round(amount × rate)` then `roundTwd` (TWD amounts are returned rounded to the integer only). */
export function toTwd(amount: number, code: string): number {
  const c = code.toUpperCase()
  if (c === 'TWD') return Math.round(amount)
  const rate = currencyRate(c) ?? 1
  return roundTwd(Math.round(amount * rate))
}

/** Currency code for a token (`$` excluded — bare `$` follows the locale rule), or undefined. */
export function currencyForToken(token: string): string | undefined {
  const t = token.toLowerCase()
  for (const c of CURRENCY_RATES) if (c.tokens.includes(t)) return c.code
  return undefined
}
