import { describe, expect, it } from 'vitest'
import { fixtureLook } from './fixtures'
import { findStylePreset } from './presets'
import {
  buildCompositePrompt,
  buildLookImagePrompt,
  compositeReferenceLabels,
  PROMPT_NEGATIVE_GUIDANCE,
} from './prompt'

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

describe('buildCompositePrompt', () => {
  const preset = findStylePreset('paris-editorial')!

  it('names every attached image so the model knows which is which', () => {
    const prompt = buildCompositePrompt({
      preset,
      garmentCount: 3,
      personCount: 2,
      occasion: 'wedding-guest',
      notes: 'Shot from a low angle.',
    })
    expect(prompt).toContain('Garment 1, Garment 2, Garment 3')
    expect(prompt).toContain('Person reference 1, Person reference 2')
    expect(prompt).toContain(preset.prompt)
    expect(prompt).toContain('wedding guest')
    expect(prompt).toContain('Shot from a low angle.')
    expect(prompt).toContain(PROMPT_NEGATIVE_GUIDANCE)
    expect(prompt).toMatch(/identity, face, skin tone/)
    expect(prompt).toMatch(/ignore whatever they are wearing/)
    for (const re of FORBIDDEN) expect(prompt).not.toMatch(re)
  })

  it('labels the images in the order the provider receives them', () => {
    expect(compositeReferenceLabels(2, 1)).toEqual(['Garment 1', 'Garment 2', 'Person reference 1'])
    expect(compositeReferenceLabels(0, 0)).toEqual([])
    for (const label of compositeReferenceLabels(2, 2)) {
      expect(buildCompositePrompt({ preset, garmentCount: 2, personCount: 2 })).toContain(label)
    }
  })

  it('falls back to a model and a plain outfit when a side has no images', () => {
    const noPerson = buildCompositePrompt({ preset, garmentCount: 1, personCount: 0 })
    expect(noPerson).toContain('one adult model')
    expect(noPerson).not.toContain('Person reference')
    const noGarment = buildCompositePrompt({ preset, garmentCount: 0, personCount: 1 })
    expect(noGarment).toContain('simple, well-cut outfit')
    expect(noGarment).not.toContain('Garment 1')
    for (const re of FORBIDDEN) {
      expect(noPerson).not.toMatch(re)
      expect(noGarment).not.toMatch(re)
    }
  })
})
