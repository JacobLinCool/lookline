import { describe, expect, it } from 'vitest'
import { STYLE_DIMENSIONS, zeroVector } from '@lookline/catalog'
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
    expect(cosineRange(a, a, 0, STYLE_DIMENSIONS)).toBeCloseTo(1, 9)
    expect(cosineRange(unit(3), unit(4), 0, STYLE_DIMENSIONS)).toBe(0)
    expect(cosineRange(zeroVector(), a, 0, STYLE_DIMENSIONS)).toBe(0)
  })

  it('blockScale ranking equals weighted-dot ranking', () => {
    const colour = BLOCK.C[0] + 1
    const axis = BLOCK.X[0] + 1
    const group = BLOCK.G[0]
    const q = zeroVector()
    q[colour] = 0.8
    q[axis] = 0.5
    q[group] = 1
    const items = [unit(colour, 1), unit(axis, 1), unit(group, 0.7), unit(BLOCK.C[0] + 2, 1)]
    const scaled = blockScale(q, RETRIEVAL_BLOCK_WEIGHTS)
    const byScaled = items
      .map((item, i) => [i, dot(scaled, item)] as const)
      .toSorted((x, y) => y[1] - x[1])
      .map((x) => x[0])
    const block = (v: number[], key: keyof typeof BLOCK) =>
      dot(q.slice(...BLOCK[key]), v.slice(...BLOCK[key]))
    const weighted = (v: number[]) =>
      RETRIEVAL_BLOCK_WEIGHTS.A * block(v, 'A') +
      RETRIEVAL_BLOCK_WEIGHTS.C * block(v, 'C') +
      RETRIEVAL_BLOCK_WEIGHTS.X * block(v, 'X') +
      RETRIEVAL_BLOCK_WEIGHTS.G * block(v, 'G')
    const byWeighted = items
      .map((item, i) => [i, weighted(item)] as const)
      .toSorted((x, y) => y[1] - x[1])
      .map((x) => x[0])
    expect(byScaled).toEqual(byWeighted)
    expect(scaled.slice(BLOCK.X[0], BLOCK.X[1]).every((x) => x === 0)).toBe(true)
  })

  it('blockCosine ignores zero-weight blocks', () => {
    // The axis block carries weight 0 in retrieval, so differing there costs nothing.
    const a = unit(0)
    const b = unit(0)
    b[BLOCK.X[0] + 1] = 1
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
    expect(s.split(',').length).toBe(STYLE_DIMENSIONS)
  })
})
