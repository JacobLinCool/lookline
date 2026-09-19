import type { Rng } from './types'

/**
 * Deterministic randomness (CATALOG_SPEC §10.1). Draw counts matter: every method consumes a
 * fixed number of `next()` calls so that adding a draw to one stream never shifts another.
 */

const encoder = new TextEncoder()

/** Stable 32-bit hash: FNV-1a over the UTF-8 bytes of the parts joined with '', then murmur3 fmix. */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5 >>> 0
  for (const byte of encoder.encode(parts.map(String).join(''))) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0

/** xoshiro128** seeded through splitmix32; identical seed ⇒ identical sequence. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0
  const sm = (): number => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
    return (z ^ (z >>> 15)) >>> 0
  }
  let a = sm()
  let b = sm()
  let c = sm()
  let d = sm()
  const u32 = (): number => {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0
    const t = b << 9
    c ^= a
    d ^= b
    b ^= c
    a ^= d
    c ^= t
    d = rotl(d, 11)
    return r
  }
  const next = (): number => u32() / 4294967296

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick: empty list')
      return items[Math.floor(next() * items.length)]!
    },
    weighted: (items) => {
      let total = 0
      for (const [, w] of items) if (w > 0) total += w
      if (!(total > 0)) throw new Error('rng.weighted: total weight is 0')
      let r = next() * total
      let last: (typeof items)[number] | undefined
      for (const item of items) {
        const w = item[1]
        if (w <= 0) continue
        last = item
        r -= w
        if (r < 0) return item[0]
      }
      return last![0]
    },
    shuffle: (items) => {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const tmp = out[i]!
        out[i] = out[j]!
        out[j] = tmp
      }
      return out
    },
    normal: (mean, sd) => {
      // Box–Muller: exactly two draws, second value never cached.
      const u1 = next()
      const u2 = next()
      const z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2)
      return mean + sd * z
    },
  }
  return rng
}

/** Log-uniform integer in [lo, hi] (helper, not on the `Rng` interface). */
export function logUniformInt(rng: Rng, lo: number, hi: number): number {
  return Math.round(Math.exp(rng.float(Math.log(lo), Math.log(hi))))
}

/**
 * Per-concern stream (CATALOG_SPEC §10.2): `streamFor(seed, 'attrs', i)` ≡
 * `createRng(hashSeed(seed, 'attrs', i))`. One stream per label keeps draw orders independent.
 */
export function streamFor(seed: number, label: string, ...parts: Array<string | number>): Rng {
  return createRng(hashSeed(seed, label, ...parts))
}
