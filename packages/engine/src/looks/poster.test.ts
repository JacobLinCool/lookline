import { describe, expect, it } from 'vitest'
import type { LookPosterInput } from '../types'
import { fixtureLook } from './fixtures'
import { escapeXml, renderLookPosterSvg } from './poster'
import { shapeFamilyFor } from './shapes'
import { deriveLookStyle } from './style'

function input(overrides: Partial<LookPosterInput> = {}): LookPosterInput {
  const articles = fixtureLook()
  const style = deriveLookStyle(articles)
  return {
    title: 'Quiet Monday <Edition> & "Friends"',
    ownerName: "Mia O'Neil",
    stylePreset: 'paris-editorial',
    articles,
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
    // three composition paths per product (shadow, body, outline)
    const paths = svg.match(/<path /g) ?? []
    expect(paths.length).toBeGreaterThanOrEqual(input().articles.length * 3)
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
      input({ stylePreset: 'editorial', articles: [], palette: [], aesthetics: [], title: '' }),
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

describe('renderLookPosterSvg with groups', () => {
  const tee = {
    name: 'Tee',
    colorHex: '#223344',
    subcategory: 'tee',
    pattern: 'solid',
    categoryGroup: 'tops' as const,
  }
  const skirt = { ...tee, name: 'Skirt', subcategory: 'skirt', categoryGroup: 'bottoms' as const }
  const base = {
    title: '家族出遊',
    ownerName: 'Alice',
    stylePreset: 'studio',
    palette: ['#223344'],
    aesthetics: [],
    seed: 7,
  }

  it('captions a band per subject and keeps each subject in their own band', () => {
    // The whole point of a group card: whose clothes are whose. A flat union would draw the same
    // shapes with nothing saying who wore them.
    const svg = renderLookPosterSvg({
      ...base,
      articles: [tee, skirt],
      groups: [
        { name: '媽媽', articles: [tee] },
        { name: '爸爸', articles: [skirt] },
      ],
    })
    expect(svg).toContain('媽媽')
    expect(svg).toContain('爸爸')
    const y = (name: string) =>
      Number(new RegExp(`<text [^>]*y="([\\d.]+)"[^>]*>${name}</text>`).exec(svg)![1])
    expect(y('媽媽')).toBeLessThan(y('爸爸'))
    // Two shapes, each drawn once — bands partition the pieces rather than repeating them.
    expect(svg.split('<g transform="translate(').length - 1).toBe(2)
  })

  it('leaves a single-subject card as one flat lay', () => {
    const svg = renderLookPosterSvg({ ...base, articles: [tee, skirt] })
    expect(svg).not.toContain('媽媽')
  })
})

describe('renderLookPosterSvg chrome', () => {
  it('leaves every word out of the artwork-only variant, and keeps the picture', () => {
    // The share export lays its own text out, with a font that has Chinese in it; the rasteriser
    // behind it does not, so anything the poster writes here would come out as tofu.
    const input: LookPosterInput = {
      title: '媽媽',
      ownerName: 'Alice',
      stylePreset: 'studio',
      articles: [
        {
          name: 'Tee',
          colorHex: '#223344',
          subcategory: 'tee',
          pattern: 'solid',
          categoryGroup: 'tops' as const,
        },
      ],
      palette: ['#223344'],
      aesthetics: [],
      seed: 3,
    }
    const artwork = renderLookPosterSvg({ ...input, chrome: 'artwork' })
    expect(artwork).not.toContain('<text')
    expect(artwork).toContain('<g transform="translate(')
    expect(artwork).toContain('#223344')
    expect(renderLookPosterSvg(input)).toContain('媽媽')
  })
})
