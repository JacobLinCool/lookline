import { describe, expect, it } from 'vitest'
import { AXES, CATEGORY_GROUPS, COLOR_FAMILIES } from './taxonomy'
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

const [COLOR_FROM, COLOR_TO] = STYLE_BLOCKS.colors
const [GROUP_FROM, GROUP_TO] = STYLE_BLOCKS.groups
const [AXIS_FROM, AXIS_TO] = STYLE_BLOCKS.axes

const sample = () =>
  toStyleVector({
    aesthetics: { minimalist: 0.9, 'quiet-luxury': 0.5, 'not-a-real-slug': 1 },
    colorFamily: 'neutral',
    secondaryColorFamily: 'black',
    axes: { formality: 0.6, warmth: 0.4, boldness: 0.1, trendiness: 1.2, structure: -0.5 },
    categoryGroup: 'tops',
  })

describe('index helpers', () => {
  it('map to the contract layout', () => {
    expect(aestheticIndex('minimalist')).toBe(0)
    expect(aestheticIndex('not-a-real-slug')).toBe(-1)
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
    // aesthetic block: weights as given, a slug outside the taxonomy dropped
    expect(v[aestheticIndex('minimalist')]).toBe(0.9)
    expect(v[aestheticIndex('quiet-luxury')]).toBe(0.5)
    expect(v.slice(0, 32).filter((x) => x > 0)).toHaveLength(2)
    // colour block: primary 1.0, secondary 0.4
    const colour = v.slice(COLOR_FROM, COLOR_TO)
    expect(colour.reduce((a, b) => a + b, 0)).toBeCloseTo(1.4, 9)
    expect(v[colorFamilyIndex('neutral')]).toBe(1)
    expect(v[colorFamilyIndex('black')]).toBe(0.4)
    // axes clamped, missing = 0
    expect(v[axisIndex('trendiness')]).toBe(1)
    expect(v[axisIndex('structure')]).toBe(0)
    expect(v[axisIndex('coverage')]).toBe(0)
    expect(v[axisIndex('formality')]).toBe(0.6)
    // group one-hot
    const groups = v.slice(GROUP_FROM, GROUP_TO)
    expect(groups.reduce((a, b) => a + b, 0)).toBe(1)
    expect(v[categoryGroupIndex('tops')]).toBe(1)
  })

  it('keeps the colour block at 1.0 without a secondary and ignores a secondary equal to the primary', () => {
    const v = toStyleVector({ colorFamily: 'blue', axes: {} })
    expect(v.slice(COLOR_FROM, COLOR_TO).reduce((a, b) => a + b, 0)).toBe(1)
    expect(v.slice(GROUP_FROM, GROUP_TO).reduce((a, b) => a + b, 0)).toBe(0)
    const w = toStyleVector({
      colorFamily: 'blue',
      secondaryColorFamily: 'blue',
      axes: {},
    })
    expect(w.slice(COLOR_FROM, COLOR_TO).reduce((a, b) => a + b, 0)).toBe(1)
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
    const other = toStyleVector({ colorFamily: 'red', axes: {} })
    expect(cosineSimilarity(v, other)).toBeLessThan(0.3)

    const blend = blendVectors([v, other])
    expect(blend[colorFamilyIndex('neutral')]).toBeCloseTo(0.5, 9)
    expect(blend[colorFamilyIndex('red')]).toBeCloseTo(0.5, 9)
    const weighted = blendVectors([v, other], [3, 1])
    expect(weighted[colorFamilyIndex('red')]).toBeCloseTo(0.25, 9)
    expect(blendVectors([])).toEqual(zeroVector())
    for (const dim of blendVectors([v.map((x) => x * 3)])) expect(dim).toBeLessThanOrEqual(1)
  })

  it('describeVector reads back the aesthetics, colour block, axes and groups', () => {
    const d = describeVector(sample())
    expect(d.aesthetics).toEqual([
      { slug: 'minimalist', weight: 0.9 },
      { slug: 'quiet-luxury', weight: 0.5 },
    ])
    expect(d.colorFamilies).toEqual([
      { family: 'neutral', weight: 1 },
      { family: 'black', weight: 0.4 },
    ])
    expect(Object.keys(d.axes)).toEqual([...AXES])
    expect(d.axes.formality).toBe(0.6)
    expect(d.categoryGroups).toEqual([{ group: 'tops', weight: 1 }])
    expect(describeVector(zeroVector()).colorFamilies).toEqual([])
  })

  it('weightStyleVector scales blocks and productStyleInput round-trips', () => {
    const v = sample()
    const w = weightStyleVector(v, { axes: 0, colors: 0.5 })
    expect(w.slice(AXIS_FROM, AXIS_TO).every((x) => x === 0)).toBe(true)
    expect(w[colorFamilyIndex('neutral')]).toBe(0.5)
    expect(w.slice(COLOR_FROM, COLOR_TO)).toEqual(v.slice(COLOR_FROM, COLOR_TO).map((x) => x * 0.5))
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
        colorFamily: 'black',
        axes: { formality: 0.6 },
      }),
      colorFamily: 'black',
    }
    const b = {
      styleVector: toStyleVector({
        colorFamily: 'white',
        axes: { formality: 0.6 },
      }),
      colorFamily: 'white',
    }
    const c = {
      styleVector: toStyleVector({
        colorFamily: 'red',
        axes: { formality: 0.1 },
      }),
      colorFamily: 'red',
    }
    // colour 0.9 · same formality · vectors share only the formality axis (0.36 / 1.36)
    expect(pairScore(a, b)).toBeCloseTo(0.5 * 0.9 + 0.3 + 0.2 * (0.36 / 1.36), 6)
    // colour 0.85 · formality 0.5 apart · vectors share nothing but a little formality mass
    expect(pairScore(a, c)).toBeGreaterThan(0.5 * 0.85)
    expect(pairScore(a, c)).toBeLessThan(pairScore(a, b))
    expect(pairScore(a, b)).toBe(pairScore(b, a))
  })
})
