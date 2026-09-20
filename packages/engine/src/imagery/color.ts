/** Small colour helpers shared by generated imagery and deterministic posters. */

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_RE = /^#?([0-9a-f]{6})$/i
const SHORT_HEX_RE = /^#?([0-9a-f]{3})$/i

/** Parse `#rrggbb` / `#rgb`; `null` for anything else. */
export function parseHex(hex: string): Rgb | null {
  const long = HEX_RE.exec(hex.trim())
  if (long) {
    const n = Number.parseInt(long[1]!, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const short = SHORT_HEX_RE.exec(hex.trim())
  if (short) {
    const s = short[1]!
    return {
      r: Number.parseInt(s[0]! + s[0]!, 16),
      g: Number.parseInt(s[1]! + s[1]!, 16),
      b: Number.parseInt(s[2]! + s[2]!, 16),
    }
  }
  return null
}

/** Canonical `#RRGGBB` (upper-case) or `null` when the string is not a hex colour. */
export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex)
  return rgb ? toHex(rgb) : null
}

const part = (x: number): string =>
  Math.max(0, Math.min(255, Math.round(x)))
    .toString(16)
    .padStart(2, '0')

export function toHex({ r, g, b }: Rgb): string {
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase()
}

/** Relative luminance-ish `(0.299R + 0.587G + 0.114B) / 255` in [0, 1]; 0.5 for invalid input. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0.5
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
}

/** Mix each channel toward black by fraction `k` in [0, 1]. */
export function darken(hex: string, k: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  return toHex({ r: rgb.r * (1 - k), g: rgb.g * (1 - k), b: rgb.b * (1 - k) })
}

/** Mix each channel toward white by fraction `k` in [0, 1]. */
export function lighten(hex: string, k: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  return toHex({
    r: rgb.r + (255 - rgb.r) * k,
    g: rgb.g + (255 - rgb.g) * k,
    b: rgb.b + (255 - rgb.b) * k,
  })
}

/** Linear mix `a·(1−t) + b·t`. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return a
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  })
}
