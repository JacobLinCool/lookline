import { describe, expect, it } from 'vitest'
import type { LookPosterInput } from '../types'
import { fixtureLook } from './fixtures'
import { escapeXml, renderLookPosterSvg } from './poster'
import { shapeFamilyFor } from './shapes'
import { deriveLookStyle } from './style'

function input(overrides: Partial<LookPosterInput> = {}): LookPosterInput {
  const products = fixtureLook()
  const style = deriveLookStyle(products)
  return {
    title: 'Quiet Monday <Edition> & "Friends"',
    ownerName: "Mia O'Neil",
    stylePreset: 'paris-editorial',
    products,
    palette: style.palette,
    aesthetics: style.aesthetics,
    seed: 4242,
    editionNumber: 3,
    ...overrides,
  }
}

describe('renderLookPosterSvg', () => {
  it('returns a complete, well-formed 900×1200 svg with the editorial elements', () => {
    const svg = renderLookPosterSvg(input())
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('viewBox="0 0 900 1200"')
    expect(svg).toContain('width="900" height="1200"')
    expect(svg).toContain('No. 003')
    expect(svg).toContain('by Mia O&apos;Neil')
    expect(svg).toContain('Quiet Monday &lt;Edition&gt; &amp; &quot;Friends&quot;')
    expect(svg).toContain('Paris Editorial')
    expect(svg).toContain('#f4efe6')
    for (const hex of input().palette) expect(svg).toContain(hex)
    expect(svg).toContain('Quiet Luxury')
    // three composition paths per product (shadow, body, outline)
    const paths = svg.match(/<path /g) ?? []
    expect(paths.length).toBeGreaterThanOrEqual(input().products.length * 3)
    // every ampersand is an entity; no raw angle brackets inside text nodes
    expect(svg).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/)
    expect(svg).not.toMatch(/>[^<]*<(?![a-zA-Z/])/)
    // tags are balanced
    const open = (
      svg.match(/<(g|text|defs|svg|pattern|clipPath|linearGradient|radialGradient)[\s>]/g) ?? []
    ).length
    const close = (
      svg.match(/<\/(g|text|defs|svg|pattern|clipPath|linearGradient|radialGradient)>/g) ?? []
    ).length
    expect(open).toBe(close)
  })

  it('is deterministic in the seed and changes with it', () => {
    const a = renderLookPosterSvg(input())
    const b = renderLookPosterSvg(input())
    const c = renderLookPosterSvg(input({ seed: 4243 }))
    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(c.length).toBeGreaterThan(2000)
  })

  it('falls back to a palette-derived theme for unknown presets and empty inputs', () => {
    const svg = renderLookPosterSvg(
      input({ stylePreset: 'editorial', products: [], palette: [], aesthetics: [], title: '' }),
    )
    expect(svg).toContain('Editorial')
    expect(svg).toContain('Untitled Look')
    expect(svg).toContain('0 pieces')
    const long = renderLookPosterSvg(
      input({ title: 'A very long title that needs wrapping into several lines of poster type' }),
    )
    expect((long.match(/font-size="52"/g) ?? []).length).toBe(1)
    expect(long).toContain('>A very long title that needs<')
    const overflow = renderLookPosterSvg(
      input({
        title:
          'An absurdly long title that keeps going and going well past three lines of poster type',
      }),
    )
    expect(overflow).toContain('…')
  })

  it('maps silhouettes to shape families', () => {
    expect(shapeFamilyFor('pants-wide', 'bottoms')).toBe('pants')
    expect(shapeFamilyFor('dress-midi-wrap', 'dresses')).toBe('dress')
    expect(shapeFamilyFor('boot-ankle-laces', 'footwear')).toBe('boot')
    expect(shapeFamilyFor('shoulder-bag-mini', 'bags')).toBe('bag')
    expect(shapeFamilyFor('tee-long', 'tops')).toBe('top')
    expect(shapeFamilyFor('bucket-hat', 'accessories')).toBe('hat')
    expect(shapeFamilyFor('unknown-thing', 'jewelry')).toBe('pendant')
    expect(shapeFamilyFor('', 'nonsense')).toBe('top')
  })

  it('escapes xml', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
    )
  })
})
