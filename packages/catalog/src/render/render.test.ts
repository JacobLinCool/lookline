import { describe, expect, it } from 'vitest'
import { AESTHETIC_BG, PATTERNS, SILHOUETTE_IDS, SUBCATEGORIES } from '../taxonomy'
import type { ProductRenderInput } from '../types'
import {
  AESTHETIC_BACKGROUNDS,
  GENERIC_SILHOUETTE,
  RENDERABLE_PATTERNS,
  SILHOUETTES,
  SILHOUETTE_ALIAS_KEYS,
  SILHOUETTE_BASE_KEYS,
  SUBCATEGORY_SILHOUETTE,
  darken,
  escapeXml,
  lighten,
  lightness,
  renderOutfitSvg,
  renderProductSvg,
  renderSwatchSvg,
  silhouetteFor,
} from './index'

const base = (over: Partial<ProductRenderInput> & { department?: string } = {}) => ({
  silhouetteId: 'tee',
  colorHex: '#1F3A5F',
  secondaryColorHex: null,
  pattern: 'solid',
  aesthetics: ['minimalist'],
  imageSeed: 12345,
  categoryGroup: 'tops',
  ...over,
})

const TAG_RE = /<(\/?)([A-Za-z][\w:-]*)(?:\s[^<>]*?)?(\/?)>/g

/** Simple balanced-tag check: every opening tag is closed in order; self-closing tags are ignored. */
function assertBalanced(svg: string): void {
  const stack: string[] = []
  let m: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(svg)) !== null) {
    const closing = m[1] === '/'
    const name = m[2]!
    const selfClosing = m[3] === '/'
    if (closing) {
      const open = stack.pop()
      if (open !== name) throw new Error(`unbalanced: </${name}> closes <${open ?? 'nothing'}>`)
    } else if (!selfClosing) {
      stack.push(name)
    }
  }
  if (stack.length > 0) throw new Error(`unclosed tags: ${stack.join(', ')}`)
  // no stray angle brackets outside tags
  const stripped = svg.replace(TAG_RE, '')
  if (/[<>]/.test(stripped)) throw new Error('stray < or > outside of tags')
}

function assertWellFormed(svg: string, primary?: string): void {
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(svg.endsWith('</svg>')).toBe(true)
  expect(svg).toContain('viewBox="0 0 600 800" width="600" height="800"')
  expect(svg).not.toMatch(/undefined|NaN|\{|\}/)
  if (primary) expect(svg).toContain(primary.toUpperCase())
  assertBalanced(svg)
  expect(svg.length).toBeGreaterThan(800)
  expect(svg.length).toBeLessThan(12000)
}

const BODY_RE = /^M[\d\s.,MLCQZ-]+Z$/

describe('silhouette library', () => {
  it('has 65 base ids and 31 aliases (the §9.2 alias list says 30 but names 31)', () => {
    expect(SILHOUETTE_BASE_KEYS).toHaveLength(65)
    expect(SILHOUETTE_ALIAS_KEYS).toHaveLength(31)
    expect(Object.keys(SILHOUETTES)).toHaveLength(96)
  })

  it('matches the taxonomy SILHOUETTE_IDS when present', () => {
    if (SILHOUETTE_IDS.length === 0) return
    const mine = new Set(Object.keys(SILHOUETTES))
    for (const id of SILHOUETTE_IDS) expect(mine.has(id), `missing silhouette ${id}`).toBe(true)
    expect(SILHOUETTE_IDS.length).toBe(mine.size)
  })

  it('every body / trim / accent is a closed absolute path, every detail uses absolute commands', () => {
    for (const [id, s] of Object.entries(SILHOUETTES)) {
      expect(s.body, id).toMatch(BODY_RE)
      if (s.trim) expect(s.trim, `${id} trim`).toMatch(BODY_RE)
      if (s.accent) expect(s.accent, `${id} accent`).toMatch(BODY_RE)
      expect(s.detail, `${id} detail`).toMatch(/^M[\d\s.,MLCQZ-]*$/)
      if (s.straps) expect(s.straps, `${id} straps`).toMatch(/^M[\d\s.,MLCQZ-]*$/)
      expect(s.shadowY).toBeGreaterThan(0)
      expect(s.shadowRx).toBeGreaterThan(0)
      expect([1, 0.8, 0.6]).toContain(s.patternScale)
      // at most 40 nodes per subpath of the body
      for (const sub of s.body.split('M').filter(Boolean)) {
        const nodes = (sub.match(/[LCQ]/g) ?? []).length
        expect(nodes, `${id} body nodes`).toBeLessThanOrEqual(40)
      }
    }
    expect(GENERIC_SILHOUETTE.body).toMatch(BODY_RE)
  })

  it('keeps the §9.2 reference paths verbatim', () => {
    expect(SILHOUETTES['tee']?.body).toBe(
      'M180 150 L120 200 L150 300 L200 285 L200 690 L400 690 L400 285 L450 300 L480 200 L420 150 Q360 200 300 200 Q240 200 180 150 Z',
    )
    expect(SILHOUETTES['sneaker']?.trim).toBe(
      'M100 540 L500 540 Q510 580 480 590 L120 590 Q90 580 100 540 Z',
    )
    expect(SILHOUETTES['tote']?.detail).toBe(
      'M220 300 C220 220 260 200 300 200 C340 200 380 220 380 300 M150 340 L450 340',
    )
  })

  it('every subcategory silhouetteId resolves (skipped when the taxonomy is empty)', () => {
    if (SUBCATEGORIES.length === 0) return
    for (const sub of SUBCATEGORIES) {
      expect(SILHOUETTES[sub.silhouetteId], `${sub.slug} → ${sub.silhouetteId}`).toBeDefined()
      expect(SUBCATEGORY_SILHOUETTE[sub.slug], `map entry for ${sub.slug}`).toBe(sub.silhouetteId)
    }
    expect(Object.keys(SUBCATEGORY_SILHOUETTE)).toHaveLength(SUBCATEGORIES.length)
  })

  it('silhouetteFor applies the attribute-dependent variants', () => {
    expect(silhouetteFor('tee')).toBe('tee')
    expect(silhouetteFor('tee', {}, { sleeve: 'long' })).toBe('tee-long')
    expect(silhouetteFor('jeans', {}, { fit: 'wide' })).toBe('pants-wide')
    expect(silhouetteFor('jeans', {}, { fit: 'slim' })).toBe('pants')
    expect(silhouetteFor('pleated-skirt', {}, { length: 'mini' })).toBe('skirt-mini')
    expect(silhouetteFor('pleated-skirt', {}, { length: 'midi' })).toBe('skirt-midi-pleated')
    expect(silhouetteFor('sneaker', { height: 'high' })).toBe('sneaker-high')
    expect(silhouetteFor('sneaker', { height: 'low' })).toBe('sneaker')
    expect(silhouetteFor('tuxedo')).toBe('blazer-satin')
    expect(silhouetteFor('no-such-thing')).toBe('generic')
    for (const id of Object.values(SUBCATEGORY_SILHOUETTE)) expect(SILHOUETTES[id]).toBeDefined()
  })
})

describe('renderProductSvg', () => {
  it('renders a well-formed 600×800 svg', () => {
    const svg = renderProductSvg(base())
    assertWellFormed(svg, '#1F3A5F')
    expect(svg).toContain('fill="#F3F1EC"') // minimalist background
    expect(svg).toContain('<clipPath id="c">')
    expect(svg).toContain('<linearGradient id="sh"')
  })

  it('renders every silhouette id and alias', () => {
    for (const id of Object.keys(SILHOUETTES)) {
      const svg = renderProductSvg(base({ silhouetteId: id, categoryGroup: 'tops' }))
      assertWellFormed(svg, '#1F3A5F')
      expect(svg).toContain(SILHOUETTES[id]!.body)
    }
  })

  it('renders every pattern on a dark and a light base', () => {
    const slugs = new Set([...RENDERABLE_PATTERNS, ...PATTERNS.map((p) => p.slug)])
    for (const p of PATTERNS) expect(RENDERABLE_PATTERNS, `pattern ${p.slug}`).toContain(p.slug)
    for (const slug of slugs) {
      for (const hex of ['#111114', '#F8F8F6']) {
        const svg = renderProductSvg(
          base({
            pattern: slug,
            colorHex: hex,
            secondaryColorHex: '#C0392B',
            brandName: 'Nord Atelier',
          }),
        )
        assertWellFormed(svg, hex)
        if (slug === 'solid') {
          expect(svg).not.toContain('url(#p)')
        } else if (slug === 'colour-block') {
          expect(svg).toContain('<rect y="400" width="600" height="400" fill="#C0392B"/>')
        } else if (slug === 'tie-dye') {
          expect(svg).toContain('<radialGradient id="p"')
          expect(svg).toContain(`fill="url(#p)"`)
        } else {
          expect(svg).toContain('<pattern id="p"')
          expect(svg).toContain(
            '<g clip-path="url(#c)"><rect width="600" height="800" fill="url(#p)"/></g>',
          )
        }
      }
    }
    const mono = renderProductSvg(base({ pattern: 'monogram', brandName: 'Nord Atelier' }))
    expect(mono).toContain('>NA</text>')
    const light = renderProductSvg(base({ colorHex: '#F8F8F6' }))
    expect(light).toContain('stroke="#B8B4AC"')
  })

  it('colour-blocks bags and footwear vertically', () => {
    const svg = renderProductSvg(
      base({
        silhouetteId: 'tote',
        categoryGroup: 'bags',
        pattern: 'colour-block',
        secondaryColorHex: '#222222',
      }),
    )
    expect(svg).toContain('<rect x="400" width="200" height="800" fill="#222222"/>')
  })

  it('is deterministic and varies with the seed', () => {
    const a = renderProductSvg(base({ imageSeed: 7, name: 'Nord Atelier Rib Tee' }))
    const b = renderProductSvg(base({ imageSeed: 7, name: 'Nord Atelier Rib Tee' }))
    const c = renderProductSvg(base({ imageSeed: 8, name: 'Nord Atelier Rib Tee' }))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/<g transform="rotate\(-?\d(\.\d)? 300 400\) translate\(-?\d -?\d\)">/)
  })

  it('never throws on unknown ids, patterns, colours or aesthetics', () => {
    const svg = renderProductSvg(
      base({
        silhouetteId: 'hoverboard',
        pattern: 'paisley',
        colorHex: 'not-a-colour',
        secondaryColorHex: 'javascript:alert(1)',
        aesthetics: ['nope'],
        categoryGroup: 'gadgets',
        imageSeed: Number.NaN,
      }),
    )
    assertWellFormed(svg)
    expect(svg).toContain(GENERIC_SILHOUETTE.body)
    expect(svg).toContain('fill="#EFEEEA"')
    expect(svg).not.toContain('javascript')
    expect(svg).not.toContain('url(#p)')
  })

  it('draws kids smaller with confetti', () => {
    const svg = renderProductSvg(base({ department: 'kids', aesthetics: ['kidcore'] }))
    assertWellFormed(svg, '#1F3A5F')
    expect(svg).toContain('translate(60 100) scale(.8)')
    expect(svg).toContain('<circle cx="90" cy="120" r="9" fill="#F07E26"/>')
    expect(svg).toContain('fill="#FBF1DC"')
    expect(renderProductSvg(base({ department: 'women' }))).not.toContain('scale(.8)')
  })

  it('draws no corner label or swatch dot: the garment stands alone', () => {
    const svg = renderProductSvg(
      base({
        name: 'Nord Atelier <Rib> "Tee"',
        brandName: 'Nord & Atelier',
        secondaryColorHex: '#C0392B',
      }),
    )
    assertWellFormed(svg)
    expect(svg).not.toContain('<text')
    expect(svg).not.toContain('<circle cx="560" cy="764"')
    expect(svg).not.toContain('<ellipse cx="300" cy="360"')
  })

  it('uses the multicolour gradient and metal hardware', () => {
    const multi = renderProductSvg(base({ colorHex: '#6C5CE7' }))
    expect(multi).toContain('<linearGradient id="mc"')
    expect(multi).toContain('fill="url(#mc)"')
    const gold = renderProductSvg(
      base({ silhouetteId: 'shoulder-bag', categoryGroup: 'bags', secondaryColorHex: '#C9A43A' }),
    )
    expect(gold).toContain('r="15" fill="#C9A43A"')
    const gun = renderProductSvg(base({ silhouetteId: 'shoulder-bag', categoryGroup: 'bags' }))
    expect(gun).toContain('r="15" fill="#5C6672"')
    const ring = renderProductSvg(base({ silhouetteId: 'necklace', categoryGroup: 'jewelry' }))
    expect(ring).toContain('fill="#C9A43A"')
  })

  it('fills the trim with a solid secondary on footwear', () => {
    const svg = renderProductSvg(
      base({ silhouetteId: 'sneaker', categoryGroup: 'footwear', secondaryColorHex: '#FFFFFF' }),
    )
    expect(svg).toContain(`d="${SILHOUETTES['sneaker']!.trim}" fill="#FFFFFF"`)
  })

  it('renders 1,000 articles in under 1 ms each on average', () => {
    const ids = Object.keys(SILHOUETTES)
    const inputs = Array.from({ length: 1000 }, (_, i) =>
      base({
        silhouetteId: ids[i % ids.length]!,
        pattern: RENDERABLE_PATTERNS[i % RENDERABLE_PATTERNS.length]!,
        imageSeed: i,
        name: 'Nord Atelier Rib Tee',
        brandName: 'Nord Atelier',
        secondaryColorHex: i % 3 === 0 ? '#C0392B' : null,
      }),
    )
    for (const input of inputs.slice(0, 100)) renderProductSvg(input) // warm-up
    const t0 = performance.now()
    let bytes = 0
    for (const input of inputs) bytes += renderProductSvg(input).length
    const ms = performance.now() - t0
    expect(bytes).toBeGreaterThan(0)
    expect(ms / 1000).toBeLessThan(1)
  })
})

describe('renderSwatchSvg / renderOutfitSvg', () => {
  it('draws a 24×24 disc, split with a secondary colour or tiled with a pattern', () => {
    const plain = renderSwatchSvg('#1F3A5F')
    expect(plain.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"')).toBe(
      true,
    )
    assertBalanced(plain)
    expect(plain).toContain('fill="#1F3A5F"')
    const split = renderSwatchSvg('#1F3A5F', '#C0392B')
    expect(split).toContain('<rect x="12" width="12" height="24" fill="#C0392B"/>')
    const tiled = renderSwatchSvg('#1F3A5F', 'polka-dot')
    expect(tiled).toContain('<pattern id="p"')
    const both = renderSwatchSvg('#1F3A5F', '#C0392B', 'breton-stripe')
    expect(both).toContain('fill="#C0392B"')
    expect(both).toContain('<pattern id="p"')
    assertBalanced(both)
    expect(renderSwatchSvg('#1F3A5F', 'tie-dye')).toContain('url(#p)')
  })

  it('lays up to 5 articles side by side on a 1500×400 canvas', () => {
    const items = ['tee', 'pants', 'sneaker', 'tote', 'cap', 'belt'].map((id, i) =>
      base({ silhouetteId: id, imageSeed: i }),
    )
    const svg = renderOutfitSvg(items)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 400"')).toBe(
      true,
    )
    assertBalanced(svg)
    for (let k = 0; k < 5; k++) {
      expect(svg).toContain(
        `<svg x="${k * 300}" y="0" width="300" height="400" viewBox="0 0 600 800">`,
      )
    }
    expect(svg).not.toContain('x="1500"')
    expect(svg).not.toContain(SILHOUETTES['belt']!.body)
    expect(renderOutfitSvg(items)).toBe(svg)
    assertBalanced(renderOutfitSvg([]))
  })
})

describe('palette', () => {
  it('darkens, lightens and measures lightness with integer channels', () => {
    expect(darken('#FFFFFF', 0.5)).toBe('#808080')
    expect(darken('#fff', 1)).toBe('#000000')
    expect(lighten('#000000', 0.5)).toBe('#808080')
    expect(lighten('#000', 0)).toBe('#000000')
    expect(lightness('#FFFFFF')).toBeCloseTo(1)
    expect(lightness('#000000')).toBe(0)
    expect(darken('#1F3A5F', 0.3)).toBe(darken('#1F3A5F', 0.3))
  })

  it('escapes xml', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    )
  })

  it('background tints agree with the taxonomy AESTHETIC_BG table', () => {
    expect(Object.keys(AESTHETIC_BACKGROUNDS)).toHaveLength(32)
    const entries = Object.entries(AESTHETIC_BG as Record<string, string>)
    if (entries.length === 0) return
    for (const [slug, bg] of entries) {
      expect(AESTHETIC_BACKGROUNDS[slug], slug).toBe(bg.toUpperCase())
    }
  })
})
