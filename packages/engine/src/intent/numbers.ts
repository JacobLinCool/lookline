/**
 * Number extraction (ENGINE_SPEC §1.4.1): Arabic and CJK numerals, k/千/萬 multipliers, and the
 * quantity / age / size / dimension classification helpers.
 */
export interface NumberToken {
  value: number
  start: number
  end: number
  text: string
  kind: 'arabic' | 'cjk'
  /** A bare `一` / `兩` run: only a number when followed by a quantity word. */
  bare: boolean
}

const DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  兩: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}
const UNITS: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000, 萬: 10000, 万: 10000 }

/** Standard CJK numeral parser: 五千=5000, 三千五=3500, 一萬二=12000, 十五=15, 一百零五=105. */
export function cjkToNumber(s: string): number | null {
  if (s.length === 0) return null
  let total = 0
  let section = 0
  let num = 0
  let hasNum = false
  let lastUnit = 1
  let sawZero = false
  for (const ch of s) {
    const d = DIGITS[ch]
    const u = UNITS[ch]
    if (d !== undefined) {
      if (d === 0) {
        sawZero = true
        num = 0
        continue
      }
      num = d
      hasNum = true
      continue
    }
    if (u !== undefined) {
      if (u === 10000) {
        section += num
        if (section === 0) section = 1
        total += section * u
        section = 0
        num = 0
        lastUnit = u
        sawZero = false
        continue
      }
      if (num === 0 && !sawZero) num = 1
      section += num * u
      num = 0
      lastUnit = u
      sawZero = false
      continue
    }
    return null
  }
  if (num > 0) {
    if (!sawZero && lastUnit >= 100) section += num * (lastUnit / 10)
    else section += num
  }
  const value = total + section
  return hasNum || value > 0 ? value : null
}

const CJK_RUN = /[零〇一二兩两三四五六七八九十百千萬万]+/g
const ARABIC = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?: ?(k(?![a-z])|千|萬|万))?/gi

/** Numbers in reading order; `text` should have consumed spans masked with spaces. */
export function findNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = []
  for (const m of text.matchAll(ARABIC)) {
    const start = m.index ?? 0
    const digits = (m[1] ?? '').replace(/,/g, '')
    let value = Number(digits)
    const suffix = (m[2] ?? '').toLowerCase()
    if (suffix === 'k' || suffix === '千') value *= 1000
    else if (suffix === '萬' || suffix === '万') value *= 10000
    if (!Number.isFinite(value)) continue
    out.push({ value, start, end: start + m[0].length, text: m[0], kind: 'arabic', bare: false })
  }
  const arabicSpans = out.map((n) => [n.start, n.end] as const)
  for (const m of text.matchAll(CJK_RUN)) {
    const start = m.index ?? 0
    const run = m[0]
    // unit-only runs (萬 after "1.5") are multipliers, not numbers; lone 十 is 10
    if (!/[零〇一二兩两三四五六七八九]/.test(run) && run !== '十') continue
    if (arabicSpans.some(([s, e]) => start < e + 1 && start + run.length > s)) continue
    const value = cjkToNumber(run)
    if (value === null) continue
    const bare = /^[一兩两]$/.test(run)
    out.push({ value, start, end: start + run.length, text: run, kind: 'cjk', bare })
  }
  return out.toSorted((a, b) => a.start - b.start)
}

/** Text immediately after `end`, skipping at most one space. */
export function after(text: string, end: number, length = 12): string {
  let i = end
  if (text[i] === ' ') i++
  return text.slice(i, i + length)
}

/** Text immediately before `start`, skipping at most one space. */
export function before(text: string, start: number, length = 12): string {
  let i = start
  if (text[i - 1] === ' ') i--
  return text.slice(Math.max(0, i - length), i)
}

const QUANTITY_SUFFIX = /^(件|個|雙|套|頂|條|pcs\b|pieces?\b|items?\b|pairs?\b)/
const AGE_SUFFIX = /^(歲|years?\s*old\b|yo\b|y\/o\b)/
const AGE_PREFIX = /(age|aged|年紀|年齡)\s*$/
const SIZE_SUFFIX = /^(號|碼)/
const SIZE_PREFIX = /(size|eu|尺寸|尺碼|waist|腰圍|腰)\s*$/
const DIMENSION_SUFFIX = /^(cm|公分|mm|inch|inches|kg|公斤|lbs?)(?![a-z])/
const DATE_SUFFIX = /^(月|日|天|週|周|星期|hours?|days?|weeks?|months?|am|pm|點|小時)/
const WAIST_PREFIX = /(waist|腰圍|腰)\s*$/
const WAIST_SUFFIX = /^(腰|waist)/

export type NumberRole = 'quantity' | 'age' | 'size' | 'dimension' | 'date' | 'money' | 'plain'

/** Role of a number from its immediate context (`money` is decided by `money.ts`). */
export function classifyNumber(text: string, n: NumberToken): NumberRole {
  const a = after(text, n.end)
  const b = before(text, n.start)
  if (QUANTITY_SUFFIX.test(a)) return 'quantity'
  if (AGE_SUFFIX.test(a) || AGE_PREFIX.test(b)) return 'age'
  if (DIMENSION_SUFFIX.test(a)) return 'dimension'
  if (DATE_SUFFIX.test(a)) return 'date'
  if (SIZE_SUFFIX.test(a) || SIZE_PREFIX.test(b)) return 'size'
  return 'plain'
}

/** Span of the quantity/age/size suffix after a number (so it is consumed with it). */
export function suffixSpan(text: string, n: NumberToken): number {
  const a = after(text, n.end)
  const m =
    QUANTITY_SUFFIX.exec(a) ?? AGE_SUFFIX.exec(a) ?? SIZE_SUFFIX.exec(a) ?? DIMENSION_SUFFIX.exec(a)
  if (!m) return n.end
  const gap = text[n.end] === ' ' ? 1 : 0
  return n.end + gap + m[0].length
}

export interface SizeContext {
  footwear: boolean
  bottoms: boolean
  /** Alpha sizes allowed (apparel present, outfit mode, or no one-size-only category). */
  alpha: boolean
}

export interface SizeMatch {
  system: 'alpha' | 'numeric-waist' | 'eu-shoe'
  value: string
  start: number
  end: number
}

const ALPHA_WORDS: Readonly<Record<string, string>> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
  xxl: 'XXL',
  small: 'S',
  medium: 'M',
  large: 'L',
  特小: 'XS',
  小號: 'S',
  中號: 'M',
  大號: 'L',
  特大: 'XL',
  'extra small': 'XS',
  'extra large': 'XL',
}

/** §1.4.1 / §1.4.3 sizes. `numbers` are the still-unclaimed numbers. */
export function extractSizes(
  text: string,
  numbers: readonly NumberToken[],
  ctx: SizeContext,
): SizeMatch[] {
  const out: SizeMatch[] = []
  for (const n of numbers) {
    if (n.kind !== 'arabic' || !Number.isInteger(n.value)) continue
    const b = before(text, n.start)
    const a = after(text, n.end)
    if (n.value >= 26 && n.value <= 40 && (WAIST_PREFIX.test(b) || WAIST_SUFFIX.test(a))) {
      out.push({
        system: 'numeric-waist',
        value: String(n.value),
        start: n.start,
        end: suffixSpan(text, n),
      })
      continue
    }
    if (n.value >= 35 && n.value <= 46 && ctx.footwear) {
      const keyword = SIZE_PREFIX.test(b) || SIZE_SUFFIX.test(a)
      const plain = classifyNumber(text, n) === 'plain'
      if (keyword || plain) {
        out.push({
          system: 'eu-shoe',
          value: String(n.value),
          start: n.start,
          end: suffixSpan(text, n),
        })
        continue
      }
    }
    if (n.value >= 26 && n.value <= 40 && ctx.bottoms && !ctx.footwear) {
      if (SIZE_PREFIX.test(b) || SIZE_SUFFIX.test(a)) {
        out.push({
          system: 'numeric-waist',
          value: String(n.value),
          start: n.start,
          end: suffixSpan(text, n),
        })
      }
    }
  }
  if (ctx.alpha && !out.some((s) => s.system === 'alpha')) {
    const re =
      /(?<![a-z'])(extra small|extra large|xs|s|m|l|xl|xxl|small|medium|large)(?![a-z])|(特小|小號|中號|大號|特大)/g
    for (const m of text.matchAll(re)) {
      const word = (m[1] ?? m[2] ?? '').toLowerCase()
      const value = ALPHA_WORDS[word]
      if (!value) continue
      const start = m.index ?? 0
      const end = start + m[0].length
      // single letters need a size cue: "size m", "m 號", "他 L 號", "medium" is always fine
      if (word.length === 1 || word === 'xs' || word === 'xl' || word === 'xxl') {
        const b = before(text, start, 6)
        const a = after(text, end, 3)
        const cue = /(size|尺寸|尺碼|穿)\s*$/.test(b) || /^(號|碼|size)/.test(a)
        if (!cue) continue
      }
      out.push({
        system: 'alpha',
        value,
        start,
        end: /^\s?(號|碼)/.test(text.slice(end, end + 2)) ? end + (text[end] === ' ' ? 2 : 1) : end,
      })
      break
    }
  }
  return out
}
