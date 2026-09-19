import { describe, expect, it } from 'vitest'
import { fixtureLook } from './fixtures'
import { findStylePreset } from './presets'
import { buildLookImagePrompt, PROMPT_NEGATIVE_GUIDANCE } from './prompt'

const FORBIDDEN = [
  /undefined/,
  /\bnull\b/,
  /NaN/,
  /\[object/,
  /buy now/i,
  /discount/i,
  /sale\b/i,
  /price tag(?!s)/,
]

describe('buildLookImagePrompt', () => {
  const preset = findStylePreset('tokyo-midnight')!
  const products = fixtureLook()

  it('mentions every garment with colour, material and subcategory, plus the art direction', () => {
    const prompt = buildLookImagePrompt({
      preset,
      products,
      ownerName: 'Mia',
      occasion: 'date-night',
      hasReferencePhoto: false,
    })
    for (const p of products) {
      expect(prompt).toContain(p.name)
      expect(prompt.toLowerCase()).toContain(p.colorName.toLowerCase())
    }
    expect(prompt).toContain('cashmere')
    expect(prompt).toContain('wide-leg trousers')
    expect(prompt).toContain('pinstripe')
    expect(prompt).toContain(preset.prompt)
    expect(prompt).toContain('date night')
    expect(prompt).toContain('one adult model')
    expect(prompt).toContain(PROMPT_NEGATIVE_GUIDANCE)
    expect(prompt).toMatch(/no .*logos/i)
    expect(prompt).toMatch(/watermark/i)
    expect(prompt).toMatch(/tasteful/i)
    expect(prompt).toMatch(/editorial/i)
    for (const re of FORBIDDEN) expect(prompt).not.toMatch(re)
  })

  it('keeps the reference person when a photo is attached and tolerates missing occasion', () => {
    const prompt = buildLookImagePrompt({
      preset,
      products: products.slice(0, 1),
      ownerName: 'Mia',
      occasion: null,
      hasReferencePhoto: true,
    })
    expect(prompt).toContain('the person in the reference photo')
    expect(prompt).toMatch(/keep(ing)? their identity/)
    expect(prompt).not.toContain('one adult model')
    expect(prompt).not.toContain('suit ')
    for (const re of FORBIDDEN) expect(prompt).not.toMatch(re)
  })
})
