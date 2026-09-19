import { describe, expect, it } from 'vitest'
import { AESTHETICS, AXES, CATEGORY_GROUPS, COLOR_FAMILIES } from './taxonomy'
import {
  COLOR_HARMONY,
  FORMALITY_TOLERANCE,
  SLOT_SETS,
  STYLE_BLOCKS,
  STYLE_DIMENSIONS,
  aestheticIndex,
  axisIndex,
  blendVectors,
  categoryGroupIndex,
  colorFamilyIndex,
  colorHarmony,
  cosineSimilarity,
  describeVector,
  normalizeVector,
  pairScore,
  productStyleInput,
  slotRoleOf,
  toStyleVector,
  weightStyleVector,
  zeroVector,
} from './vectors'

const sample = () =>
  toStyleVector({
    aesthetics: { minimalist: 0.9, scandi: 0.55, normcore: 0.3, 'clean-girl': 0.2, bogus: 1 },
    colorFamily: 'neutral',
    secondaryColorFamily: 'black',
    axes: { formality: 0.6, warmth: 0.4, boldness: 0.1, trendiness: 1.2, structure: -0.5 },
    categoryGroup: 'tops',
  })

describe('index helpers', () => {
  it('map to the contract layout', () => {
    expect(aestheticIndex('minimalist')).toBe(0)
    expect(aestheticIndex('k-street')).toBe(31)
    expect(aestheticIndex('nope')).toBe(-1)
    expect(colorFamilyIndex('black')).toBe(32)
    expect(colorFamilyIndex('multi-metallic')).toBe(43)
    expect(axisIndex('formality')).toBe(44)
    expect(axisIndex('trendiness')).toBe(51)
    expect(categoryGroupIndex('tops')).toBe(52)
    expect(categoryGroupIndex('tailoring')).toBe(63)
    expect(STYLE_BLOCKS).toEqual({
      aesthetics: [0, 32],
      colors: [32, 44],
      axes: [44, 52],
      groups: [52, 64],
    })
  })
})

describe('toStyleVector', () => {
  it('produces 64 dims with each block in range', () => {
    const v = sample()
    expect(v).toHaveLength(STYLE_DIMENSIONS)
    expect(STYLE_DIMENSIONS).toBe(64)
    for (const x of v) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
    }
    // aesthetic block: sparse, primary ≥ .85, secondary ≥ .55, ≤ 5 non-zero, unknown ignored
    const aesthetic = v.slice(0, 32)
    expect(aesthetic.filter((x) => x > 0)).toHaveLength(4)
    expect(v[aestheticIndex('minimalist')]).toBe(0.9)
    expect(v[aestheticIndex('scandi')]).toBe(0.55)
    // colour block: primary 1.0, secondary 0.4
    const colour = v.slice(32, 44)
    expect(colour.reduce((a, b) => a + b, 0)).toBeCloseTo(1.4, 9)
    expect(v[colorFamilyIndex('neutral')]).toBe(1)
    expect(v[colorFamilyIndex('black')]).toBe(0.4)
    // axes clamped, missing = 0
    expect(v[axisIndex('trendiness')]).toBe(1)
    expect(v[axisIndex('structure')]).toBe(0)
    expect(v[axisIndex('coverage')]).toBe(0)
    expect(v[axisIndex('formality')]).toBe(0.6)
    // group one-hot
    const groups = v.slice(52, 64)
    expect(groups.reduce((a, b) => a + b, 0)).toBe(1)
    expect(v[categoryGroupIndex('tops')]).toBe(1)
  })

  it('keeps the colour block at 1.0 without a secondary and ignores a secondary equal to the primary', () => {
    const v = toStyleVector({ aesthetics: {}, colorFamily: 'blue', axes: {} })
    expect(v.slice(32, 44).reduce((a, b) => a + b, 0)).toBe(1)
    expect(v.slice(52, 64).reduce((a, b) => a + b, 0)).toBe(0)
    const w = toStyleVector({
      aesthetics: {},
      colorFamily: 'blue',
      secondaryColorFamily: 'blue',
      axes: {},
    })
    expect(w.slice(32, 44).reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe('vector helpers', () => {
  it('normalize, cosine, blend', () => {
    const v = sample()
    const n = normalizeVector(v)
    expect(Math.sqrt(n.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 9)
    expect(normalizeVector(zeroVector())).toEqual(zeroVector())
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 9)
    expect(cosineSimilarity(v, zeroVector())).toBe(0)
    const other = toStyleVector({ aesthetics: { punk: 1 }, colorFamily: 'red', axes: {} })
    expect(cosineSimilarity(v, other)).toBeLessThan(0.3)

    const blend = blendVectors([v, other])
    expect(blend[aestheticIndex('minimalist')]).toBeCloseTo(0.45, 9)
    expect(blend[aestheticIndex('punk')]).toBeCloseTo(0.5, 9)
    const weighted = blendVectors([v, other], [3, 1])
    expect(weighted[aestheticIndex('punk')]).toBeCloseTo(0.25, 9)
    expect(blendVectors([])).toEqual(zeroVector())
    for (const dim of blendVectors([v.map((x) => x * 3)])) expect(dim).toBeLessThanOrEqual(1)
  })

  it('describeVector round-trips the top aesthetic', () => {
    const d = describeVector(sample())
    expect(d.aesthetics[0]).toEqual({ slug: 'minimalist', name: 'Minimalist', weight: 0.9 })
    expect(d.aesthetics.map((a) => a.slug)).toEqual([
      'minimalist',
      'scandi',
      'normcore',
      'clean-girl',
    ])
    expect(d.colorFamilies).toEqual([
      { family: 'neutral', weight: 1 },
      { family: 'black', weight: 0.4 },
    ])
    expect(Object.keys(d.axes)).toEqual([...AXES])
    expect(d.axes.formality).toBe(0.6)
    expect(d.categoryGroups).toEqual([{ group: 'tops', weight: 1 }])
    expect(describeVector(zeroVector()).aesthetics).toEqual([])
    // at most 5 aesthetics
    const dense = describeVector(Array.from({ length: 64 }, (_, i) => (i < 32 ? 1 - i / 64 : 0)))
    expect(dense.aesthetics).toHaveLength(5)
    expect(dense.aesthetics[0]?.slug).toBe(AESTHETICS[0]?.slug)
  })

  it('weightStyleVector scales blocks and productStyleInput round-trips', () => {
    const v = sample()
    const w = weightStyleVector(v, { axes: 0, colors: 0.5 })
    expect(w.slice(44, 52).every((x) => x === 0)).toBe(true)
    expect(w[colorFamilyIndex('neutral')]).toBe(0.5)
    expect(w.slice(0, 32)).toEqual(v.slice(0, 32))
    const input = productStyleInput({
      styleVector: v,
      colorFamily: 'neutral',
      categoryGroup: 'tops',
    })
    expect(input.secondaryColorFamily).toBe('black')
    expect(toStyleVector(input)).toEqual(v)
  })
})

describe('compatibility tables', () => {
  it('COLOR_HARMONY is 12×12, symmetric, in [0, 1]', () => {
    expect(COLOR_HARMONY).toHaveLength(12)
    for (let i = 0; i < 12; i++) {
      expect(COLOR_HARMONY[i]).toHaveLength(12)
      for (let j = 0; j < 12; j++) {
        const x = COLOR_HARMONY[i]![j]!
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(1)
        expect(x).toBe(COLOR_HARMONY[j]![i])
      }
    }
    expect(colorHarmony('black', 'white')).toBe(0.9)
    expect(colorHarmony('red', 'red')).toBe(0.4)
    expect(colorHarmony('nope', 'red')).toBe(0.5)
    expect(FORMALITY_TOLERANCE).toBe(0.25)
    expect(COLOR_FAMILIES).toHaveLength(12)
    expect(CATEGORY_GROUPS).toHaveLength(12)
  })

  it('SLOT_SETS and slot roles', () => {
    expect(Object.keys(SLOT_SETS)).toEqual(['casual', 'dress', 'tailored', 'gym', 'beach'])
    for (const slots of Object.values(SLOT_SETS)) {
      expect(slots.some((s) => s.required)).toBe(true)
      for (const s of slots) expect(s.groups.length).toBeGreaterThan(0)
    }
    expect(slotRoleOf('tops')).toBe('top')
    expect(slotRoleOf('activewear', 'sports-bra')).toBe('top')
    expect(slotRoleOf('activewear', 'joggers')).toBe('bottom')
    expect(slotRoleOf('tailoring', 'blazer')).toBe('outer')
    expect(slotRoleOf('tailoring', 'pencil-skirt')).toBe('bottom')
    expect(slotRoleOf('dresses', 'jumpsuit')).toBe('one-piece')
    expect(slotRoleOf('loungewear', 'slipper')).toBe('shoes')
    expect(slotRoleOf('jewelry')).toBe('jewelry')
    expect(slotRoleOf('accessories', 'belt')).toBe('accessory')
  })

  it('pairScore rewards harmony, matching formality and aesthetic overlap', () => {
    const a = {
      styleVector: toStyleVector({
        aesthetics: { minimalist: 0.9 },
        colorFamily: 'black',
        axes: { formality: 0.6 },
      }),
      colorFamily: 'black',
    }
    const b = {
      styleVector: toStyleVector({
        aesthetics: { minimalist: 0.9 },
        colorFamily: 'white',
        axes: { formality: 0.6 },
      }),
      colorFamily: 'white',
    }
    const c = {
      styleVector: toStyleVector({
        aesthetics: { punk: 0.9 },
        colorFamily: 'red',
        axes: { formality: 0.1 },
      }),
      colorFamily: 'red',
    }
    expect(pairScore(a, b)).toBeCloseTo(0.5 * 0.9 + 0.3 + 0.2, 9)
    expect(pairScore(a, c)).toBeCloseTo(0.5 * 0.85, 9)
    expect(pairScore(a, b)).toBe(pairScore(b, a))
  })
})
