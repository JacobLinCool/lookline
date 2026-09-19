/**
 * Vector helpers used by retrieval, scoring and the outfit solver (ENGINE_SPEC §0.4, §0.8).
 * Private to `recommend/` until a shared `src/vector.ts` exists (see REQUESTS.md).
 */
import { COLOR_FAMILIES, cosineSimilarity, weightStyleVector } from '@lookline/catalog'
import type { ColorFamily } from '@lookline/catalog'

export const BLOCK = { C: [0, 12], X: [12, 20], G: [20, 32] } as const

export interface BlockWeights {
  C: number
  X: number
  G: number
}

/** Query-side scaling for the SQL cosine (axes zeroed: scored in `attribute_match`). */
export const RETRIEVAL_BLOCK_WEIGHTS: BlockWeights = { C: 0.7, X: 0, G: 1 }
/** `style_similarity` factor. */
export const SIMILARITY_BLOCK_WEIGHTS: BlockWeights = { C: 0.7, X: 0, G: 0 }
/** `user_preference` factor. */
export const PREFERENCE_BLOCK_WEIGHTS: BlockWeights = { C: 0.7, X: 0.5, G: 0 }

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

export function blockScale(v: readonly number[], w: BlockWeights): number[] {
  return weightStyleVector(v, { colors: w.C, axes: w.X, groups: w.G })
}

/** Cosine of the two block-scaled vectors; 0 when either scaled vector is zero. */
export function blockCosine(a: readonly number[], b: readonly number[], w: BlockWeights): number {
  return cosineSimilarity(blockScale(a, w), blockScale(b, w))
}

/** Vector literal `[x,y,…]` with 6 decimals (logging, snapshots, JSON columns). */
export function toPgVector(v: readonly number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0.000000')).join(',')}]`
}

export interface Hsl {
  /** Degrees in [0, 360). */
  h: number
  /** Saturation in [0, 1]. */
  s: number
  /** Lightness in [0, 1]. */
  l: number
}

/** `#rgb` / `#rrggbb` → HSL; `null` when the string is not a hex colour. */
export function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let raw = m[1]!
  if (raw.length === 3)
    raw = raw
      .split('')
      .map((c) => c + c)
      .join('')
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

/** §0.4 fallback geometry when `colorHex` is unusable. */
export const COLOR_GEOMETRY: Readonly<Record<ColorFamily, Hsl>> = {
  black: { h: 0, l: 0.05, s: 0 },
  white: { h: 0, l: 0.97, s: 0 },
  grey: { h: 0, l: 0.55, s: 0 },
  neutral: { h: 40, l: 0.82, s: 0.15 },
  brown: { h: 25, l: 0.35, s: 0.45 },
  red: { h: 0, l: 0.45, s: 0.75 },
  pink: { h: 340, l: 0.75, s: 0.6 },
  'yellow-orange': { h: 40, l: 0.6, s: 0.8 },
  green: { h: 120, l: 0.4, s: 0.5 },
  blue: { h: 220, l: 0.45, s: 0.6 },
  purple: { h: 280, l: 0.45, s: 0.5 },
  'multi-metallic': { h: 45, l: 0.6, s: 0.7 },
}

export const NEUTRAL_FAMILIES: ReadonlySet<string> = new Set([
  'black',
  'white',
  'grey',
  'neutral',
  'brown',
])

export function isColorFamily(x: string): x is ColorFamily {
  return (COLOR_FAMILIES as readonly string[]).includes(x)
}

/** HSL of a product colour: parsed hex, else the family geometry, else grey. */
export function colorHsl(hex: string | null | undefined, family: string): Hsl {
  const parsed = hex ? hexToHsl(hex) : null
  if (parsed) return parsed
  return isColorFamily(family) ? COLOR_GEOMETRY[family] : COLOR_GEOMETRY.grey
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(x * f) / f
}

/** Integer TWD with thousands separators, e.g. `NT$2,180`. */
export function formatTwd(x: number): string {
  return `NT$${Math.round(x).toLocaleString('en-US')}`
}

export function formatInt(x: number): string {
  return Math.round(x).toLocaleString('en-US')
}
