/**
 * Small dense linear algebra for the LinUCB bandit (ENGINE_SPEC §4.4): row-major `n×n` matrices
 * stored as flat `number[]`, Gauss–Jordan inverse with partial pivoting.
 */

export type Matrix = number[]

export function identity(n: number): Matrix {
  const out = Array.from({ length: n * n }, () => 0)
  for (let i = 0; i < n; i++) out[i * n + i] = 1
  return out
}

/** `A · x` for a row-major `n×n` matrix. */
export function matVec(A: readonly number[], x: readonly number[], n: number): number[] {
  const out = Array.from({ length: n }, () => 0)
  for (let i = 0; i < n; i++) {
    let s = 0
    const row = i * n
    for (let j = 0; j < n; j++) s += (A[row + j] ?? 0) * (x[j] ?? 0)
    out[i] = s
  }
  return out
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0)
  return s
}

/** In place `A += scale · x xᵀ`. */
export function outerAdd(A: number[], x: readonly number[], n: number, scale = 1): void {
  for (let i = 0; i < n; i++) {
    const xi = (x[i] ?? 0) * scale
    if (xi === 0) continue
    const row = i * n
    for (let j = 0; j < n; j++) A[row + j] = (A[row + j] ?? 0) + xi * (x[j] ?? 0)
  }
}

/** In place `v += scale · x`. */
export function axpy(v: number[], x: readonly number[], scale: number): void {
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) + scale * (x[i] ?? 0)
}

/**
 * Inverse of a row-major `n×n` matrix by Gauss–Jordan elimination with partial pivoting.
 * Throws on a singular matrix (never the case for `I + Σ x xᵀ`).
 */
export function invert(A: readonly number[], n: number): Matrix {
  const M = Array.from({ length: n * 2 * n }, () => 0)
  const w = 2 * n
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i * w + j] = A[i * n + j] ?? 0
    M[i * w + n + i] = 1
  }
  for (let col = 0; col < n; col++) {
    let pivot = col
    let best = Math.abs(M[col * w + col] ?? 0)
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r * w + col] ?? 0)
      if (v > best) {
        best = v
        pivot = r
      }
    }
    if (best < 1e-12) throw new Error('@lookline/engine: singular matrix in invert()')
    if (pivot !== col) {
      for (let j = 0; j < w; j++) {
        const tmp = M[col * w + j] ?? 0
        M[col * w + j] = M[pivot * w + j] ?? 0
        M[pivot * w + j] = tmp
      }
    }
    const inv = 1 / (M[col * w + col] ?? 1)
    for (let j = 0; j < w; j++) M[col * w + j] = (M[col * w + j] ?? 0) * inv
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r * w + col] ?? 0
      if (f === 0) continue
      for (let j = 0; j < w; j++) M[r * w + j] = (M[r * w + j] ?? 0) - f * (M[col * w + j] ?? 0)
    }
  }
  const out = Array.from({ length: n * n }, () => 0)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = M[i * w + n + j] ?? 0
  return out
}

/** Gauss–Jordan inverse specialised to the bandit's 8×8 design matrices. */
export function invert8x8(A: readonly number[]): Matrix {
  return invert(A, 8)
}
