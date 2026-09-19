/**
 * Text normalisation, locale detection and clause splitting (ENGINE_SPEC §1.4 steps 1–3).
 */
export type Locale = 'zh-TW' | 'en' | 'mixed'

export interface NormalisedText {
  /** NFKC, whitespace collapsed, emoji stripped, original letter case (for names and `vibe`). */
  raw: string
  /** `raw` with ASCII letters lower-cased; same length and offsets as `raw`. */
  text: string
  locale: Locale
  /** Clause boundaries: clause `k` spans `[bounds[k], bounds[k+1])`. */
  bounds: number[]
}

const CJK = /[㐀-䶿一-鿿豈-﫿]/
const EMOJI = /[\p{Extended_Pictographic}️‍]/gu

export function isCjk(ch: string): boolean {
  return CJK.test(ch)
}

/** True for a Latin letter or digit (ASCII after NFKC). */
export function isLatinAlnum(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9]/i.test(ch)
}

/**
 * `raw` keeps the user's characters (whitespace collapsed, emoji stripped); `text` applies NFKC
 * per code point only where it preserves the UTF-16 length, so offsets line up 1:1 with `raw`.
 */
export function normalizeText(utterance: string): { raw: string; text: string } {
  const raw = utterance.replace(EMOJI, ' ').replace(/\s+/g, ' ').trim()
  const text = Array.from(raw, (ch) => {
    const n = ch.normalize('NFKC').replace(/[’]/g, "'")
    const out = n.length === ch.length ? n : ch
    return out.replace(/[A-Z]/g, (c) => c.toLowerCase())
  }).join('')
  return { raw, text }
}

/** CJK present + a Latin run of ≥ 2 letters → mixed; CJK only → zh-TW; otherwise en. */
export function detectLocale(text: string, fallback?: 'zh-TW' | 'en'): Locale {
  const cjk = (text.match(new RegExp(CJK.source, 'g')) ?? []).length
  const latinRuns = (text.match(/[a-z]{2,}/gi) ?? []).length
  if (cjk === 0) return latinRuns === 0 && fallback ? fallback : 'en'
  return latinRuns > 0 ? 'mixed' : 'zh-TW'
}

const CLAUSE_WORDS = [' and ', ' but ', '但是', '但', '不過', '然後', '而且', '還有']

/** Clause start offsets (§1.4 step 3). A `.` between digits is not a boundary. */
export function clauseBounds(text: string): number[] {
  const bounds = [0]
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ''
    if ('，,。;；、！!？?'.includes(ch)) {
      bounds.push(i + 1)
      continue
    }
    if (ch === '.') {
      const prev = text[i - 1]
      const next = text[i + 1]
      if (!(isLatinAlnum(prev) && isLatinAlnum(next))) bounds.push(i + 1)
      continue
    }
    for (const w of CLAUSE_WORDS) {
      if (text.startsWith(w, i)) {
        bounds.push(i + w.length)
        i += w.length - 1
        break
      }
    }
  }
  return bounds
}

export function clauseOf(bounds: readonly number[], pos: number): number {
  let k = 0
  for (let i = 1; i < bounds.length; i++) if ((bounds[i] ?? Infinity) <= pos) k = i
  return k
}

export function clauseEnd(bounds: readonly number[], length: number, clause: number): number {
  return bounds[clause + 1] ?? length
}

export function normalise(utterance: string, fallbackLocale?: 'zh-TW' | 'en'): NormalisedText {
  const { raw, text } = normalizeText(utterance)
  return { raw, text, locale: detectLocale(text, fallbackLocale), bounds: clauseBounds(text) }
}
