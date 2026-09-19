import { describe, expect, it } from 'vitest'
import { aestheticIndex, cosineSimilarity, zeroVector } from '@lookline/catalog'
import { luminance } from './color'
import { fixtureLook, makeProduct } from './fixtures'
import { deriveLookStyle } from './style'

describe('deriveLookStyle', () => {
  it('derives top aesthetics, a luminance-ordered palette and a unit style vector', () => {
    const style = deriveLookStyle(fixtureLook())
    expect(style.aesthetics[0]).toBe('quiet-luxury')
    expect(style.aesthetics).toContain('minimalist')
    expect(style.aesthetics.length).toBeLessThanOrEqual(5)

    expect(style.palette).toEqual(['#111114', '#4E342E', '#4A4B50', '#D9CDB8'])
    for (let i = 1; i < style.palette.length; i++) {
      expect(luminance(style.palette[i]!)).toBeGreaterThanOrEqual(luminance(style.palette[i - 1]!))
    }

    expect(style.styleVector).toHaveLength(64)
    const norm = Math.sqrt(style.styleVector.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 6)
    expect(style.styleVector[aestheticIndex('quiet-luxury')]).toBeGreaterThan(
      style.styleVector[aestheticIndex('preppy')]!,
    )
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

  it('handles empty input and zero vectors by voting on tags', () => {
    expect(deriveLookStyle([])).toEqual({ aesthetics: [], palette: [], styleVector: zeroVector() })
    const flat = makeProduct({
      id: 9,
      name: 'Flat',
      categoryGroup: 'tops',
      subcategory: 'tee',
      silhouetteId: 'tee',
      colorName: 'Sky',
      colorHex: '#9FCAE9',
      colorFamily: 'blue',
      aesthetics: ['coastal', 'resort'],
    })
    const style = deriveLookStyle([{ ...flat, styleVector: zeroVector() }])
    expect(style.aesthetics).toEqual(['coastal', 'resort'])
    expect(style.palette).toEqual(['#9FCAE9'])
  })
})
