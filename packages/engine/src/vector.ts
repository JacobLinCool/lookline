/**
 * Style-vector helpers of ENGINE_SPEC §0.8: block ranges, block scaling for query-side weighting,
 * block-weighted cosine, hex → HSL and the pgvector literal.
 */
import { STYLE_DIMENSIONS, cosineRange as catalogCosineRange } from '@lookline/catalog'

/** Half-open `[start, end)` block ranges: aesthetics, colours, axes, groups. */
export const BLOCK = { A: [0, 32], C: [32, 44], X: [44, 52], G: [52, 64] } as const

export type BlockKey = keyof typeof BLOCK

export interface BlockWeights {
  A: number
  C: number
  X: number
  G: number
}

/** Query-side weights for pgvector retrieval (axes zeroed; scored in `attribute_match`). */
export const RETRIEVAL_BLOCK_WEIGHTS: BlockWeights = { A: 1.0, C: 0.7, X: 0, G: 1.0 }
/** Weights for product ↔ product similarity scoring. */
export const SIMILARITY_BLOCK_WEIGHTS: BlockWeights = { A: 1.0, C: 0.7, X: 0, G: 0 }
/** Weights for user-preference cosine. */
export const PREFERENCE_BLOCK_WEIGHTS: BlockWeights = { A: 1.0, C: 0.7, X: 0.5, G: 0 }

/** Cosine over `[from, to)`; 0 when either sub-norm is 0. */
export function cosineRange(
  a: readonly number[],
  b: readonly number[],
  from: number,
  to: number,
): number {
  return catalogCosineRange(a, b, from, to)
}

/** Scale each block of `v` by its weight; the result always has 64 dims. */
export function blockScale(v: readonly number[], w: BlockWeights): number[] {
  const out: number[] = Array.from({ length: STYLE_DIMENSIONS }, (_, i) => v[i] ?? 0)
  for (const key of Object.keys(BLOCK) as BlockKey[]) {
    const weight = w[key]
    if (weight === 1) continue
    const [from, to] = BLOCK[key]
    for (let i = from; i < to; i++) out[i] = (out[i] ?? 0) * weight
  }
  return out
}

/** Cosine of `blockScale(a, w)` vs `blockScale(b, w)`. */
export function blockCosine(a: readonly number[], b: readonly number[], w: BlockWeights): number {
  return cosineRange(blockScale(a, w), blockScale(b, w), 0, STYLE_DIMENSIONS)
}

/** `#rgb` / `#rrggbb` → HSL with `h` in degrees [0, 360) and `s`, `l` in [0, 1]; null when unparsable. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let raw = m[1] ?? ''
  if (raw.length === 3)
    raw = raw
      .split('')
      .map((c) => c + c)
      .join('')
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
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

/** `"[0.1,0.2,...]"` with 6 decimals, always 64 entries. */
export function toPgVector(v: readonly number[]): string {
  const parts: string[] = []
  for (let i = 0; i < STYLE_DIMENSIONS; i++) parts.push((v[i] ?? 0).toFixed(6))
  return `[${parts.join(',')}]`
}
