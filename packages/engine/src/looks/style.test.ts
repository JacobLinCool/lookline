import { describe, expect, it } from 'vitest'
import { STYLE_DIMENSIONS, cosineSimilarity, zeroVector } from '@lookline/catalog'
import { luminance } from './color'
import { fixtureLook, makeProduct } from './fixtures'
import { deriveLookStyle } from './style'

describe('deriveLookStyle', () => {
  it('derives a luminance-ordered palette and a unit style vector, and no aesthetics', () => {
    const style = deriveLookStyle(fixtureLook())
    expect(style.aesthetics.length).toBeLessThanOrEqual(5)

    expect(style.palette).toEqual(['#111114', '#4E342E', '#4A4B50', '#D9CDB8'])
    for (let i = 1; i < style.palette.length; i++) {
      expect(luminance(style.palette[i]!)).toBeGreaterThanOrEqual(luminance(style.palette[i - 1]!))
    }

    expect(style.styleVector).toHaveLength(STYLE_DIMENSIONS)
    const norm = Math.sqrt(style.styleVector.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 6)
  })

  it('is order-independent and deduplicates palette hexes', () => {
    const articles = fixtureLook()
    const a = deriveLookStyle(articles)
    const b = deriveLookStyle(articles.toReversed())
    expect(cosineSimilarity(a.styleVector, b.styleVector)).toBeCloseTo(1, 9)
    expect(b.palette).toEqual(a.palette)

    const dup = deriveLookStyle([articles[0]!, { ...articles[0]!, colorHex: '#d9cdb8' }])
    expect(dup.palette).toEqual(['#D9CDB8'])
  })

  it('handles empty input and zero vectors', () => {
    expect(deriveLookStyle([])).toEqual({ aesthetics: [], palette: [], styleVector: zeroVector() })
    const flat = makeProduct({
      id: 9,
      name: 'Flat',
      categoryGroup: 'tops',
      outfitRole: 'top',
      subcategory: 'tee',
      colorName: 'Sky',
      colorHex: '#9FCAE9',
      colorFamily: 'blue',
      aesthetics: ['coastal', 'resort'],
    })
    // Nothing tags the catalogue, so a zero vector yields no aesthetics rather than a tag vote.
    const style = deriveLookStyle([{ ...flat, styleVector: zeroVector() }])
    expect(style.aesthetics).toEqual([])
    expect(style.palette).toEqual(['#9FCAE9'])
  })
})
