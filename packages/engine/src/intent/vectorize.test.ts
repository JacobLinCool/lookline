import { describe, expect, it } from 'vitest'
import {
  STYLE_BLOCKS,
  STYLE_DIMENSIONS,
  axisIndex,
  categoryGroupIndex,
  colorFamilyIndex,
  zeroVector,
} from '@lookline/catalog'
import { intentToVector, referenceLookVector } from './vectorize'
import { parseIntentOffline } from './lexicon-parser'
import { FIXTURE_CTX, withUser } from './fixtures'

describe('intentToVector (§1.9)', () => {
  it('F4: black and tops dims are set, axes default to 0.5', () => {
    const v = intentToVector(
      parseIntentOffline('幫我找一件黑色的oversize帽T，三千以內', FIXTURE_CTX),
    )
    expect(v).toHaveLength(STYLE_DIMENSIONS)
    expect(v[colorFamilyIndex('black')]).toBe(1)
    expect(v[categoryGroupIndex('tops')]).toBe(1)
    expect(v[axisIndex('formality')]).toBe(0.5)
    // per-item max 3000 → ln scale
    expect(v[axisIndex('price-tier')]).toBeCloseTo(
      (Math.log(3000) - Math.log(300)) / (Math.log(30000) - Math.log(300)),
      6,
    )
  })

  it('F1: formality dim .575, outfit base has G all zero, prior colours, avoided colour is 0', () => {
    const intent = parseIntentOffline('下週要去朋友婚禮，預算五千，不想太正式', FIXTURE_CTX)
    const v = intentToVector(intent)
    expect(v[axisIndex('formality')]).toBeCloseTo(0.575, 6)
    for (let i = STYLE_BLOCKS.groups[0]; i < STYLE_BLOCKS.groups[1]; i++) expect(v[i]).toBe(0)
    expect(v[colorFamilyIndex('neutral')]).toBeCloseTo(0.35, 6)
    expect(v[colorFamilyIndex('white')]).toBe(0)
    // outfit total budget 5000 → per item 2250
    expect(v[axisIndex('price-tier')]).toBeCloseTo(
      (Math.log(2250) - Math.log(300)) / (Math.log(30000) - Math.log(300)),
      6,
    )
  })

  it('aesthetic colour prior fills the colour block when nothing was said', () => {
    const v = intentToVector(parseIntentOffline('goth outfit', withUser('women')))
    expect(v[colorFamilyIndex('black')]).toBeGreaterThan(0.5)
  })

  it('preference blend never touches G and uses β from the event count', () => {
    const intent = parseIntentOffline('黑色帽T', FIXTURE_CTX)
    const base = zeroVector().map(() => 1)
    const plain = intentToVector(intent)
    const blended = intentToVector(intent, base, { eventCount: 10 })
    for (let i = STYLE_BLOCKS.groups[0]; i < STYLE_BLOCKS.groups[1]; i++)
      expect(blended[i]).toBe(plain[i])
    const beta = 0.1 + 0.02 * 10
    expect(blended[axisIndex('warmth')]).toBeCloseTo((1 - beta) * 0.5 + beta, 6)
    const def = intentToVector(intent, base)
    expect(def[axisIndex('warmth')]).toBeCloseTo(0.75 * 0.5 + 0.25, 6)
  })

  // Trending aesthetics no longer reach the vector — there is no block for them — but a browse
  // intent still produces a usable one from its colour prior and axes.
  it('browse produces a vector from the colour prior and axes', () => {
    const intent = parseIntentOffline('我不知道，隨便看看', FIXTURE_CTX)
    const v = intentToVector(intent, null, { trendingAesthetics: ['y2k', 'gorpcore'] })
    expect(v).toHaveLength(STYLE_DIMENSIONS)
    expect(v.some((x) => x > 0)).toBe(true)
  })

  it('style-source reference blends 40/60 on the colour block', () => {
    const intent = parseIntentOffline("something like Alice's look, in blue", FIXTURE_CTX)
    const ref = zeroVector()
    ref[colorFamilyIndex('green')] = 1
    const v = intentToVector(intent, null, { referenceVector: ref })
    expect(v[colorFamilyIndex('green')]).toBeCloseTo(0.6, 6)
    expect(v[colorFamilyIndex('blue')]).toBeCloseTo(0.4, 6)
  })

  it('is deterministic and referenceLookVector averages articles with G zeroed', () => {
    const intent = parseIntentOffline('office outfit for summer', FIXTURE_CTX)
    expect(intentToVector(intent)).toEqual(intentToVector(intent))
    const a = zeroVector().map((_, i) => (i === 0 || i === 52 ? 1 : 0))
    const b = zeroVector().map((_, i) => (i === 1 || i === 53 ? 1 : 0))
    const ref = referenceLookVector({ articles: [{ styleVector: a }, { styleVector: b }] })!
    expect(ref[0]).toBeCloseTo(0.5, 6)
    expect(ref[20]).toBe(0)
    expect(referenceLookVector({ styleVector: a })).toEqual(a)
    expect(referenceLookVector({})).toBeNull()
  })
})
