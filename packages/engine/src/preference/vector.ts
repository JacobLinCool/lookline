/**
 * Block-weighted style-vector helpers used by Engine 03 (ENGINE_SPEC §0.8).
 *
 * The spec places these in `src/vector.ts`; that file belongs to another module owner, so the
 * preference module keeps a private copy (see packages/engine/REQUESTS.md). Layout of the 64-d
 * style vector: A = aesthetics 0–31, C = colour families 32–43, X = axes 44–51, G = groups 52–63.
 */
import { STYLE_DIMENSIONS } from '@lookline/catalog'

export const BLOCK = { A: [0, 32], C: [32, 44], X: [44, 52], G: [52, 64] } as const

export interface BlockWeights {
  A: number
  C: number
  X: number
  G: number
}

/** Cosine weights used for preference ↔ product similarity (§0.8). */
export const PREFERENCE_BLOCK_WEIGHTS: BlockWeights = { A: 1, C: 0.7, X: 0.5, G: 0 }
/** Cosine weights used for intent ↔ product style similarity (§0.8). */
export const SIMILARITY_BLOCK_WEIGHTS: BlockWeights = { A: 1, C: 0.7, X: 0, G: 0 }

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Per-dimension weight vector for a block-weight spec. */
export function blockWeightsPerDim(w: BlockWeights): Float64Array {
  const out = new Float64Array(STYLE_DIMENSIONS)
  out.fill(w.A, BLOCK.A[0], BLOCK.A[1])
  out.fill(w.C, BLOCK.C[0], BLOCK.C[1])
  out.fill(w.X, BLOCK.X[0], BLOCK.X[1])
  out.fill(w.G, BLOCK.G[0], BLOCK.G[1])
  return out
}

/** Scale each block of `v` by its weight; missing dims count as 0. */
export function blockScale(v: ArrayLike<number>, w: BlockWeights): number[] {
  const per = blockWeightsPerDim(w)
  const out = Array.from({ length: STYLE_DIMENSIONS }, () => 0)
  for (let i = 0; i < STYLE_DIMENSIONS; i++) out[i] = (v[i] ?? 0) * (per[i] ?? 0)
  return out
}

/** Cosine over `[from, to)`; 0 when either sub-norm is 0. */
export function cosineRange(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  from: number,
  to: number,
): number {
  let dot = 0
  let na = 0
  let nb = 0
  const end = Math.min(to, a.length, b.length)
  for (let i = from; i < end; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

/** Cosine of `blockScale(a, w)` vs `blockScale(b, w)`; 0 when either scaled norm is 0. */
export function blockCosine(a: ArrayLike<number>, b: ArrayLike<number>, w: BlockWeights): number {
  const per = blockWeightsPerDim(w)
  let dot = 0
  let na = 0
  let nb = 0
  const end = Math.min(STYLE_DIMENSIONS, a.length, b.length)
  for (let i = 0; i < end; i++) {
    const ww = per[i] ?? 0
    if (ww === 0) continue
    const x = (a[i] ?? 0) * ww
    const y = (b[i] ?? 0) * ww
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

/** `"[0.1,...]"` with 6 decimals, the pgvector text form. */
export function toPgVector(v: ArrayLike<number>): string {
  const parts: string[] = []
  for (let i = 0; i < v.length; i++) parts.push(Number(v[i] ?? 0).toFixed(6))
  return `[${parts.join(',')}]`
}

/** Copy `v` into a fresh 64-d number[] (padding/truncating); `null` stays `null`. */
export function asVector(v: ArrayLike<number> | null | undefined): number[] | null {
  if (!v) return null
  const out = Array.from({ length: STYLE_DIMENSIONS }, () => 0)
  for (let i = 0; i < STYLE_DIMENSIONS; i++) {
    const x = v[i]
    out[i] = typeof x === 'number' && Number.isFinite(x) ? x : 0
  }
  return out
}

/** Zero-filled 64-d vector. */
export function zero64(): number[] {
  return Array.from({ length: STYLE_DIMENSIONS }, () => 0)
}

/** Round to `digits` decimals (used to keep serialised results tidy and byte-stable). */
export function round(x: number, digits = 6): number {
  const f = 10 ** digits
  return Math.round(x * f) / f
}
