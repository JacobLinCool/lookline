/**
 * Colour helpers and the aesthetic background palette used by the SVG renderer
 * (docs/specs/CATALOG_SPEC.md §9.1). Pure functions, integer math, memoised.
 *
 * The background tints are a private transcription of the `bg` column of §3.1 so this module
 * does not depend on `taxonomy/aesthetics.ts` at load time (a test cross-checks the two).
 */

export const FALLBACK_BG = '#EFEEEA'
export const MULTICOLOUR_HEX = '#6C5CE7'
export const GOLD_HEX = '#C9A43A'
export const SILVER_HEX = '#BFC3CA'
export const GUNMETAL_HEX = '#5C6672'
/** Outline colour for very light primaries (lightness > .90). */
export const LIGHT_OUTLINE = '#B8B4AC'

/** §3.1 `bg` column, keyed by aesthetic slug (dim order). */
export const AESTHETIC_BACKGROUNDS: Readonly<Record<string, string>> = {
  minimalist: '#F3F1EC',
  'quiet-luxury': '#EFE8DC',
  streetwear: '#E9E9EA',
  y2k: '#F6E4F0',
  grunge: '#E4E2E0',
  gorpcore: '#E6EAE3',
  preppy: '#E8EEF6',
  cottagecore: '#F1F3E6',
  coastal: '#EAF2F5',
  'dark-academia': '#E9E3DA',
  balletcore: '#F8E9EE',
  techwear: '#DDDFE3',
  boho: '#F2EADF',
  athleisure: '#E7EBEF',
  romantic: '#F7EBEF',
  'retro-70s': '#F1E7D8',
  workwear: '#EBE6DC',
  'clean-girl': '#F2EEE8',
  'avant-garde': '#E3E1E3',
  coquette: '#FAE8EC',
  normcore: '#ECECEA',
  scandi: '#EEEDE9',
  'city-boy': '#E8EBEA',
  glam: '#EEE5EC',
  punk: '#E2E0E2',
  'mob-wife': '#EBE3DF',
  western: '#F0E9DE',
  resort: '#EAF4EE',
  goth: '#DED9DF',
  kidcore: '#FBF1DC',
  'corporate-chic': '#E8EAEF',
  'k-street': '#EEF0F2',
}

/** Background tint for the first aesthetic slug; `FALLBACK_BG` when unknown or missing. */
export function backgroundFor(aesthetics: readonly string[] | undefined): string {
  const first = aesthetics?.[0]
  return (first && AESTHETIC_BACKGROUNDS[first]) || FALLBACK_BG
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Parses `#rgb` / `#rrggbb` (case-insensitive). Anything else parses as mid grey. */
export function parseHex(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex.trim())
  if (!m) return [128, 128, 128]
  let h = m[1]!
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  const n = Number.parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const HEX_DIGITS = '0123456789ABCDEF'
const byteHex = (v: number): string => HEX_DIGITS[(v >> 4) & 15]! + HEX_DIGITS[v & 15]!

export function toHex(r: number, g: number, b: number): string {
  return '#' + byteHex(r) + byteHex(g) + byteHex(b)
}

/** Canonical upper-case `#RRGGBB` form (used for comparisons and output). */
export function normalizeHex(hex: string): string {
  const [r, g, b] = parseHex(hex)
  return toHex(r, g, b)
}

const darkenMemo = new Map<string, string>()
const lightenMemo = new Map<string, string>()

/** Mix each channel toward 0 by fraction `k` (integer math, memoised). */
export function darken(hex: string, k: number): string {
  const key = hex + '|' + k
  const hit = darkenMemo.get(key)
  if (hit !== undefined) return hit
  const [r, g, b] = parseHex(hex)
  const f = 1 - k
  const out = toHex(Math.round(r * f), Math.round(g * f), Math.round(b * f))
  darkenMemo.set(key, out)
  return out
}

/** Mix each channel toward 255 by fraction `k` (integer math, memoised). */
export function lighten(hex: string, k: number): string {
  const key = hex + '|' + k
  const hit = lightenMemo.get(key)
  if (hit !== undefined) return hit
  const [r, g, b] = parseHex(hex)
  const out = toHex(
    Math.round(r + (255 - r) * k),
    Math.round(g + (255 - g) * k),
    Math.round(b + (255 - b) * k),
  )
  lightenMemo.set(key, out)
  return out
}

/** Perceived lightness in [0, 1]: `(0.299R + 0.587G + 0.114B) / 255`. */
export function lightness(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** Metal colour for hardware: gold / silver when the secondary matches, else the fallback. */
export function hardwareColorFor(
  secondaryHex: string | null | undefined,
  fallback: string,
): string {
  if (!secondaryHex) return fallback
  const n = normalizeHex(secondaryHex)
  if (n === GOLD_HEX) return GOLD_HEX
  if (n === SILVER_HEX) return SILVER_HEX
  return fallback
}

/** XML-escapes text nodes and attribute values. */
export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** A valid-looking hex or the fallback; protects the output from injected attribute text. */
export function safeHex(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback
  return HEX_RE.test(hex.trim()) ? normalizeHex(hex) : fallback
}
