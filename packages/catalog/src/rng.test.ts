import { describe, expect, it } from 'vitest'
import { createRng, hashSeed, logUniformInt, streamFor } from './rng'

describe('hashSeed', () => {
  it('is stable and 32-bit', () => {
    const a = hashSeed(20260918, 'attrs', 1)
    expect(a).toBe(hashSeed(20260918, 'attrs', 1))
    expect(Number.isInteger(a)).toBe(true)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(0xffffffff)
  })
  it('differs across parts', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(hashSeed(1, 'x', i))
    expect(seen.size).toBe(1000)
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
  })
})

describe('createRng', () => {
  it('same seed ⇒ same 1,000 draws; different seeds differ', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)
    const da = Array.from({ length: 1000 }, () => a.next())
    const db = Array.from({ length: 1000 }, () => b.next())
    const dc = Array.from({ length: 1000 }, () => c.next())
    expect(da).toEqual(db)
    expect(da).not.toEqual(dc)
    for (const x of da) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('uniform draws have mean ≈ .5 ± .02 and cover both halves', () => {
    const rng = createRng(hashSeed('dist'))
    let sum = 0
    let low = 0
    const n = 10_000
    for (let i = 0; i < n; i++) {
      const x = rng.next()
      sum += x
      if (x < 0.5) low++
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.02)
    expect(Math.abs(low / n - 0.5)).toBeLessThan(0.03)
  })

  it('int/float/chance/pick stay in range', () => {
    const rng = createRng(7)
    for (let i = 0; i < 2000; i++) {
      const k = rng.int(3, 9)
      expect(k).toBeGreaterThanOrEqual(3)
      expect(k).toBeLessThanOrEqual(9)
      const f = rng.float(-1, 1)
      expect(f).toBeGreaterThanOrEqual(-1)
      expect(f).toBeLessThan(1)
      expect(typeof rng.chance(0.3)).toBe('boolean')
      expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']))
    }
    expect(createRng(1).chance(0)).toBe(false)
    expect(createRng(1).chance(1)).toBe(true)
  })

  it('weighted follows the weights, skips ≤ 0 and throws on zero total', () => {
    const rng = createRng(99)
    const counts = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 6000; i++) {
      counts[
        rng.weighted([
          ['a', 1],
          ['b', 2],
          ['c', 0],
        ] as const)
      ]++
    }
    expect(counts.c).toBe(0)
    expect(counts.b / counts.a).toBeGreaterThan(1.7)
    expect(counts.b / counts.a).toBeLessThan(2.3)
    expect(() => rng.weighted([['a', 0]])).toThrow()
  })

  it('shuffle is a permutation on a copy, deterministic per seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const s1 = createRng(5).shuffle(items)
    const s2 = createRng(5).shuffle(items)
    expect(s1).toEqual(s2)
    expect(s1.toSorted((a, b) => a - b)).toEqual(items)
    expect(items).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(s1).not.toEqual(items)
  })

  it('normal has the requested mean/sd and consumes exactly two draws', () => {
    const rng = createRng(2024)
    const n = 20_000
    let sum = 0
    let sq = 0
    for (let i = 0; i < n; i++) {
      const x = rng.normal(10, 2)
      sum += x
      sq += x * x
    }
    const mean = sum / n
    const sd = Math.sqrt(sq / n - mean * mean)
    expect(Math.abs(mean - 10)).toBeLessThan(0.05)
    expect(Math.abs(sd - 2)).toBeLessThan(0.05)

    const a = createRng(3)
    const b = createRng(3)
    a.normal(0, 1)
    b.next()
    b.next()
    expect(a.next()).toBe(b.next())
  })

  it('draw-count contract: int/float/chance/pick/weighted use one draw each', () => {
    const ref = createRng(11)
    const rng = createRng(11)
    rng.int(0, 9)
    rng.float(0, 1)
    rng.chance(0.5)
    rng.pick([1, 2, 3])
    rng.weighted([
      ['x', 1],
      ['y', 1],
    ])
    for (let i = 0; i < 5; i++) ref.next()
    expect(rng.next()).toBe(ref.next())
  })

  it('logUniformInt and streamFor', () => {
    const rng = createRng(1)
    for (let i = 0; i < 500; i++) {
      const v = logUniformInt(rng, 10, 1000)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThanOrEqual(1000)
    }
    expect(streamFor(1, 'attrs', 5).next()).toBe(createRng(hashSeed(1, 'attrs', 5)).next())
  })
})
