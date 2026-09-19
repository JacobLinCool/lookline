import { describe, expect, it } from 'vitest'
import { colourHarmony, compat, formalityCompat, seasonCompat } from './compat'
import { product } from '../testing/fixtures'

const c = (colorHex: string, colorFamily: string, secondaryColorHex: string | null = null) => ({
  colorHex,
  colorFamily,
  secondaryColorHex,
})

describe('colourHarmony (§3.2 table)', () => {
  it('reproduces the harmony rows', () => {
    expect(colourHarmony(c('#111114', 'black'), c('#B98B55', 'brown')).score).toBeCloseTo(0.9, 9) // black + camel
    expect(colourHarmony(c('#F8F8F6', 'white'), c('#111114', 'black')).score).toBeCloseTo(0.9, 9) // white + black
    expect(colourHarmony(c('#111114', 'black'), c('#17181C', 'black')).score).toBeCloseTo(0.7, 9) // black + black
    expect(colourHarmony(c('#1C2A4A', 'blue'), c('#5E7EA8', 'blue')).score).toBeCloseTo(0.8, 9) // navy + navy Δl ≥ .1
    expect(colourHarmony(c('#1C2A4A', 'blue'), c('#1E2C4C', 'blue')).score).toBeCloseTo(0.7, 9) // same family Δl < .1
    expect(colourHarmony(c('#a04050', 'red'), c('#40a050', 'green')).score).toBeCloseTo(0.65, 9) // Δh ≈ 140 triadic
    expect(colourHarmony(c('#c08040', 'yellow-orange'), c('#4080c0', 'blue')).score).toBeCloseTo(
      0.75,
      9,
    ) // Δh 180 complementary
    expect(colourHarmony(c('#c0c040', 'yellow-orange'), c('#40c080', 'green')).score).toBeCloseTo(
      0.45,
      9,
    ) // Δh 90 clash
    expect(colourHarmony(c('#ff0000', 'red'), c('#ff8000', 'yellow-orange')).score).toBeCloseTo(
      0.7,
      9,
    ) // analogous −.10 loud
    expect(
      colourHarmony(c('#C9A43A', 'multi-metallic'), c('#BFC3CA', 'multi-metallic')).score,
    ).toBeCloseTo(0.3, 9)
    expect(colourHarmony(c('#C9A43A', 'multi-metallic'), c('#111114', 'black')).score).toBeCloseTo(
      0.8,
      9,
    )
    expect(colourHarmony(c('#C9A43A', 'multi-metallic'), c('#2551C2', 'blue')).score).toBeCloseTo(
      0.5,
      9,
    )
  })
  it('is symmetric and blends secondary colours', () => {
    const pairs = [
      [c('#111114', 'black'), c('#B98B55', 'brown')],
      [c('#a04050', 'red'), c('#40a050', 'green')],
      [c('#F8F8F6', 'white', '#E3308A'), c('#2551C2', 'blue')],
    ] as const
    for (const [a, b] of pairs)
      expect(colourHarmony(a, b).score).toBeCloseTo(colourHarmony(b, a).score, 9)
    const plain = colourHarmony(c('#F8F8F6', 'white'), c('#2551C2', 'blue')).score
    const withSecondary = colourHarmony(
      c('#F8F8F6', 'white', '#E3308A'),
      c('#2551C2', 'blue'),
    ).score
    expect(withSecondary).toBeCloseTo(
      0.7 * plain + 0.3 * Math.max(colourHarmony(c('#E3308A', 'pink'), c('#2551C2', 'blue')).score),
      9,
    )
  })
  it('is monotone: a neutral partner never scores below a clashing chromatic pair', () => {
    const clash = colourHarmony(c('#c0c040', 'yellow-orange'), c('#40c080', 'green')).score
    for (const neutral of [
      c('#111114', 'black'),
      c('#F8F8F6', 'white'),
      c('#A9A9AE', 'grey'),
      c('#D9CDB8', 'neutral'),
      c('#B98B55', 'brown'),
    ]) {
      expect(colourHarmony(neutral, c('#c0c040', 'yellow-orange')).score).toBeGreaterThan(clash)
    }
    expect(
      colourHarmony(c('#111114', 'black'), c('#B98B55', 'brown')).score,
    ).toBeGreaterThanOrEqual(colourHarmony(c('#111114', 'black'), c('#17181C', 'black')).score)
  })
})

describe('formality, season and the composite', () => {
  it('applies the statement-piece rule and season adjacency', () => {
    const calm = product({ id: 1, seasons: ['spring'] })
    const loud = product({ id: 2, seasons: ['summer'] })
    calm.styleVector[12] = 0.6
    loud.styleVector[12] = 0.6
    calm.styleVector[14] = 0.9
    loud.styleVector[14] = 0.9
    expect(formalityCompat(calm, loud)).toBeCloseTo(0.8, 9)
    loud.styleVector[14] = 0.2
    expect(formalityCompat(calm, loud)).toBeCloseTo(1, 9)
    expect(seasonCompat(calm, loud)).toBeCloseTo(0.5, 9) // spring / summer adjacent
    const winter = product({ id: 3, seasons: ['winter'] })
    expect(seasonCompat(calm, winter)).toBeCloseTo(0.5, 9) // winter/spring adjacent
    const summerOnly = product({ id: 4, seasons: ['summer'] })
    expect(seasonCompat(winter, summerOnly)).toBeCloseTo(0.3, 9)
    expect(seasonCompat(calm, loud, 'summer')).toBeCloseTo(0.5 * 0.85, 9)
    const all = product({ id: 5, seasons: ['all-season'] })
    expect(seasonCompat(all, winter, 'winter')).toBeCloseTo(1, 9)
  })
  it('composite is in [0, 1] and symmetric', () => {
    const a = product({
      id: 10,
      colorFamily: 'black',
      colorHex: '#111114',
      aesthetics: ['minimalist'],
    })
    const b = product({
      id: 11,
      colorFamily: 'neutral',
      colorHex: '#D6C3A5',
      aesthetics: ['minimalist', 'scandi'],
    })
    const ab = compat(a, b, 'autumn')
    expect(ab.score).toBeGreaterThan(0)
    expect(ab.score).toBeLessThanOrEqual(1)
    expect(ab.score).toBeCloseTo(compat(b, a, 'autumn').score, 9)
    expect(ab.score).toBeCloseTo(
      0.35 * ab.colour.score + 0.3 * ab.aesthetic + 0.2 * ab.formality + 0.15 * ab.season,
      9,
    )
  })
})
