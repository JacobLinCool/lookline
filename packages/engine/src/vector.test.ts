import { describe, expect, it } from 'vitest'
import { zeroVector } from '@lookline/catalog'
import {
  BLOCK,
  RETRIEVAL_BLOCK_WEIGHTS,
  blockCosine,
  blockScale,
  cosineRange,
  hexToHsl,
  toPgVector,
} from './vector'

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0)

const unit = (i: number, value = 1): number[] => {
  const v = zeroVector()
  v[i] = value
  return v
}

describe('vector helpers', () => {
  it('cosine: identical 1, orthogonal 0, zero-norm 0', () => {
    const a = unit(3)
    expect(cosineRange(a, a, 0, 64)).toBeCloseTo(1, 9)
    expect(cosineRange(unit(3), unit(4), 0, 64)).toBe(0)
    expect(cosineRange(zeroVector(), a, 0, 64)).toBe(0)
  })

  it('blockScale ranking equals weighted-dot ranking', () => {
    const q = zeroVector()
    q[0] = 1
    q[33] = 0.8
    q[45] = 0.5
    q[52] = 1
    const items = [unit(0, 0.9), unit(33, 1), unit(45, 1), unit(52, 0.7), unit(1, 1)]
    const scaled = blockScale(q, RETRIEVAL_BLOCK_WEIGHTS)
    const byScaled = items
      .map((item, i) => [i, dot(scaled, item)] as const)
      .toSorted((x, y) => y[1] - x[1])
      .map((x) => x[0])
    const weighted = (v: number[]) =>
      RETRIEVAL_BLOCK_WEIGHTS.A * dot(q.slice(0, 32), v.slice(0, 32)) +
      RETRIEVAL_BLOCK_WEIGHTS.C * dot(q.slice(32, 44), v.slice(32, 44)) +
      RETRIEVAL_BLOCK_WEIGHTS.X * dot(q.slice(44, 52), v.slice(44, 52)) +
      RETRIEVAL_BLOCK_WEIGHTS.G * dot(q.slice(52), v.slice(52))
    const byWeighted = items
      .map((item, i) => [i, weighted(item)] as const)
      .toSorted((x, y) => y[1] - x[1])
      .map((x) => x[0])
    expect(byScaled).toEqual(byWeighted)
    expect(scaled.slice(BLOCK.X[0], BLOCK.X[1]).every((x) => x === 0)).toBe(true)
  })

  it('blockCosine ignores zero-weight blocks', () => {
    const a = unit(0)
    const b = unit(0)
    b[45] = 1
    expect(blockCosine(a, b, RETRIEVAL_BLOCK_WEIGHTS)).toBeCloseTo(1, 9)
  })

  it('hexToHsl', () => {
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 })
    const red = hexToHsl('#ff0000')!
    expect(red.h).toBe(0)
    expect(red.s).toBe(1)
    expect(red.l).toBe(0.5)
    expect(hexToHsl('#fff')?.l).toBe(1)
    expect(hexToHsl('nope')).toBeNull()
  })

  it('toPgVector has 6 decimals and 64 entries', () => {
    const s = toPgVector(unit(2, 0.5))
    expect(s.startsWith('[0.000000,0.000000,0.500000,')).toBe(true)
    expect(s.split(',').length).toBe(64)
  })
})
