import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import type { CategoryGroup } from '../types'
import {
  CARE_LINES,
  LINE_WORDS,
  OUTFIT_PAIR,
  PAIRINGS,
  ROMAN,
  S1_TEMPLATES,
  S2_TEMPLATES,
  S3_TEMPLATES,
  buildDescription,
  buildDescriptionFromDraws,
  buildDescriptionSlots,
  buildName,
  buildSlug,
  descriptorFor,
  drawName,
  fillTemplate,
  kebab,
  lineWordFor,
  type BrandVoice,
  type DescriptionContext,
} from './copy'

const GROUPS: CategoryGroup[] = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'footwear',
  'bags',
  'accessories',
  'jewelry',
  'activewear',
  'swimwear',
  'loungewear',
  'tailoring',
]
const VOICES: BrandVoice[] = ['crisp', 'warm', 'technical', 'playful', 'editorial']

describe('LINE_WORDS', () => {
  it('has 256 unique words and injective line names up to 1024', () => {
    expect(LINE_WORDS).toHaveLength(256)
    expect(new Set(LINE_WORDS).size).toBe(256)
    for (const w of LINE_WORDS) expect(w).toMatch(/^[A-Z][a-z]+$/)
    expect(ROMAN).toEqual(['', 'II', 'III', 'IV'])
    expect(lineWordFor(0)).toBe('Aster')
    expect(lineWordFor(255)).toBe('Corin')
    expect(lineWordFor(256)).toBe('Aster II')
    expect(lineWordFor(600)).toBe(`${LINE_WORDS[600 % 256]} III`)
    const names = new Set<string>()
    for (let j = 0; j < 1024; j++) names.add(lineWordFor(j))
    expect(names.size).toBe(1024)
  })
})

describe('buildName', () => {
  const parts = {
    brandName: 'Arlo Basics',
    ordinal: 3,
    noun: 'Tee',
    descriptor: 'Oversized',
    materialAdj: 'Cotton',
    colorName: 'Optic White',
  }

  it('is deterministic and applies the thresholds', () => {
    const all = buildName(parts, { descriptorU: 0.1, materialU: 0.1, colourU: 0.1 })
    expect(all).toBe('Arlo Basics Atlas Oversized Cotton Tee in Optic White')
    expect(buildName(parts, { descriptorU: 0.1, materialU: 0.1, colourU: 0.1 })).toBe(all)
    expect(buildName(parts, { descriptorU: 0.9, materialU: 0.9, colourU: 0.9 })).toBe(
      'Arlo Basics Atlas Tee',
    )
    expect(buildName(parts, { descriptorU: 0.74, materialU: 0.45, colourU: 0.35 })).toBe(
      'Arlo Basics Atlas Oversized Tee',
    )
    expect(
      buildName({ ...parts, descriptor: '' }, { descriptorU: 0, materialU: 1, colourU: 1 }),
    ).toBe('Arlo Basics Atlas Tee')
  })

  it('omits a material adjective already in the noun and never doubles spaces', () => {
    const linen = buildName(
      { brandName: 'Cove & Salt', ordinal: 0, noun: 'Linen Shirt', materialAdj: 'Linen' },
      { descriptorU: 0, materialU: 0, colourU: 1 },
    )
    expect(linen).toBe('Cove & Salt Aster Linen Shirt')
    const rng = createRng(5)
    for (let i = 0; i < 500; i++) {
      const name = drawName(
        {
          brandName: 'Brand',
          ordinal: rng.int(0, 700),
          noun: rng.pick(['Tee', 'Wide-Leg Trousers', 'Denim Jacket']),
          descriptor: rng.pick(['', 'Relaxed', 'High-Rise Straight', null]),
          materialAdj: rng.pick(['Denim', 'Linen', '', null]),
          colorName: rng.pick(['Jet Black', '', null]),
        },
        rng,
      )
      expect(name).not.toMatch(/\s{2}/)
      expect(name.startsWith('Brand ')).toBe(true)
      expect(name.trim()).toBe(name)
    }
    const a = drawName(parts, createRng(9))
    const b = drawName(parts, createRng(9))
    expect(a).toBe(b)
  })

  it('builds kebab slugs', () => {
    expect(buildSlug({ brandSlug: 'arlo-basics', ordinal: 0, subcategory: 'tee' })).toBe(
      'arlo-basics-aster-tee',
    )
    expect(buildSlug({ brandSlug: 'arlo-basics', ordinal: 256, subcategory: 'tee' })).toBe(
      'arlo-basics-aster-ii-tee',
    )
    expect(kebab('Étoile Enfant')).toBe('etoile-enfant')
    expect(kebab('Fern & Co.')).toBe('fern-and-co')
  })
})

describe('descriptorFor', () => {
  it('follows the display-form rules', () => {
    expect(descriptorFor({ schema: 'tee', noun: 'Tee', fit: 'oversized' })).toBe('Oversized')
    expect(descriptorFor({ schema: 'tee', noun: 'Tee', fit: 'regular' })).toBe('')
    expect(
      descriptorFor({
        schema: 'pant',
        noun: 'Jeans',
        fit: 'straight',
        attributes: { rise: 'high' },
      }),
    ).toBe('High-Rise Straight')
    expect(
      descriptorFor({
        schema: 'pant',
        noun: 'Jeans',
        fit: 'regular',
        attributes: { rise: 'high' },
      }),
    ).toBe('High-Rise')
    expect(
      descriptorFor({ schema: 'pant', noun: 'Jeans', fit: 'wide', attributes: { rise: 'mid' } }),
    ).toBe('Mid-Rise Wide-Leg')
    expect(
      descriptorFor({ schema: 'dress', noun: 'Wrap Dress', silhouette: 'wrap', length: 'midi' }),
    ).toBe('Midi')
    expect(
      descriptorFor({ schema: 'dress', noun: 'Midi Dress', silhouette: 'a-line', length: 'midi' }),
    ).toBe('A-Line')
    expect(
      descriptorFor({ schema: 'dress', noun: 'Gown', silhouette: 'column', length: 'floor' }),
    ).toBe('Column')
    expect(
      descriptorFor({
        schema: 'skirt',
        noun: 'Pleated Skirt',
        silhouette: 'pleated',
        length: 'maxi',
      }),
    ).toBe('Maxi')
    expect(
      descriptorFor({ schema: 'sneaker', noun: 'Sneaker', attributes: { height: 'low' } }),
    ).toBe('')
    expect(
      descriptorFor({ schema: 'sneaker', noun: 'Sneaker', attributes: { height: 'high' } }),
    ).toBe('High-Top')
    expect(
      descriptorFor({
        schema: 'boot',
        noun: 'Combat Boot',
        attributes: { shaft: 'mid-calf', heel: 'lug' },
      }),
    ).toBe('Mid-Calf')
    expect(
      descriptorFor({
        schema: 'shoe',
        noun: 'Pump',
        attributes: { heel: 'stiletto', toe: 'pointed' },
      }),
    ).toBe('Stiletto')
    expect(descriptorFor({ schema: 'bag', noun: 'Tote', attributes: { size: 'large' } })).toBe(
      'Large',
    )
    expect(descriptorFor({ schema: 'bag', noun: 'Tote', attributes: { size: 'medium' } })).toBe('')
    expect(
      descriptorFor({
        schema: 'knit',
        noun: 'Sweater',
        fit: 'regular',
        attributes: { gauge: 'chunky' },
      }),
    ).toBe('Chunky')
    expect(
      descriptorFor({
        schema: 'jewel',
        noun: 'Necklace',
        attributes: { scale: 'dainty', type: 'chain' },
      }),
    ).toBe('Dainty')
    expect(
      descriptorFor({
        schema: 'jewel',
        noun: 'Ring',
        attributes: { scale: 'regular', type: 'band' },
      }),
    ).toBe('')
    expect(
      descriptorFor({
        schema: 'jewel',
        noun: 'Earrings',
        attributes: { scale: 'regular', type: 'hoop' },
      }),
    ).toBe('Hoop')
    expect(
      descriptorFor({
        schema: 'coat',
        noun: 'Coat',
        fit: 'regular',
        attributes: { buttons: 'double-6' },
      }),
    ).toBe('Double-Breasted')
    expect(
      descriptorFor({
        schema: 'puffer',
        noun: 'Puffer',
        fit: 'regular',
        attributes: { hood: 'fixed', insulation: 'heavy' },
      }),
    ).toBe('Hooded')
    expect(
      descriptorFor({ schema: 'sunglasses', noun: 'Sunglasses', attributes: { frame: 'cat-eye' } }),
    ).toBe('Cat-Eye')
    expect(
      descriptorFor({
        schema: 'shirt',
        noun: 'Shirt',
        fit: 'regular',
        attributes: { collar: 'camp' },
      }),
    ).toBe('Camp-Collar')
    expect(
      descriptorFor({
        schema: 'shirt',
        noun: 'Shirt',
        fit: 'regular',
        attributes: { collar: 'point' },
      }),
    ).toBe('')
    expect(
      descriptorFor({
        schema: 'active-top',
        noun: 'Sports Bra',
        fit: 'regular',
        attributes: { support: 'high' },
      }),
    ).toBe('High-Support')
  })
})

describe('description templates', () => {
  it('has 5 S1 per group, 3 S2 per occasion, 4 S3 per voice, 7 care lines, 5 pairings per group', () => {
    for (const g of GROUPS) expect(S1_TEMPLATES[g]).toHaveLength(5)
    expect(Object.keys(S2_TEMPLATES)).toHaveLength(12)
    for (const list of Object.values(S2_TEMPLATES)) expect(list).toHaveLength(3)
    for (const v of VOICES) expect(S3_TEMPLATES[v]).toHaveLength(4)
    expect(Object.keys(CARE_LINES)).toHaveLength(7)
    for (const g of GROUPS) {
      expect(PAIRINGS[g]).toHaveLength(5)
      expect(OUTFIT_PAIR[g]).toEqual(PAIRINGS[g].map((p) => p.phrase))
      for (const p of PAIRINGS[g]) expect(p.subcategory).toMatch(/^[a-z-]+$/)
    }
  })

  it('fillTemplate capitalises {Slot} forms and leaves unknown slots', () => {
    expect(
      fillTemplate('{Material} {noun} for {Brand}', {
        material: 'linen',
        noun: 'shirt',
        Brand: 'Kōri',
      }),
    ).toBe('Linen shirt for Kōri')
    expect(fillTemplate('{missing}', {})).toBe('{missing}')
  })

  it('fills every template without leaving a slot, 2–3 sentences, deterministic', () => {
    const slots = buildDescriptionSlots({
      group: 'tops',
      schema: 'shirt',
      noun: 'Shirt',
      colorName: 'Optic White',
      materialName: 'Cotton Poplin',
      materialCare: 'wash',
      fit: 'relaxed',
      neckline: 'collar',
      sleeve: 'long',
      closure: 'button',
      attributes: { collar: 'band' },
      brandName: 'Halden Row',
      brandOrigin: 'Copenhagen',
      occasionName: 'Work',
      aestheticName: 'Minimalist',
      seasonName: 'Autumn 2026',
    })
    for (const g of GROUPS) {
      for (const occasion of Object.keys(S2_TEMPLATES)) {
        for (const voice of VOICES) {
          const ctx: DescriptionContext = { group: g, occasion, voice, slots }
          for (let k = 0; k < 5; k++) {
            const text = buildDescriptionFromDraws(ctx, {
              s1U: k / 5,
              s2U: (k % 3) / 3,
              s3U: (k % 4) / 4,
              s3Present: k < 3 ? 0 : 0.9,
              pairingU: k / 5,
              testU: k / 5,
            })
            expect(text).not.toContain('{')
            expect(text).not.toContain('}')
            expect(text[0]).toMatch(/[A-Z]/)
            expect(text.endsWith('.')).toBe(true)
            expect(text.length).toBeLessThanOrEqual(420)
          }
        }
      }
    }
    const ctx: DescriptionContext = {
      group: 'tops',
      occasion: 'everyday',
      voice: 'technical',
      slots,
    }
    expect(buildDescription(ctx, createRng(1))).toBe(buildDescription(ctx, createRng(1)))
    expect(buildDescription(ctx, createRng(1))).not.toBe(buildDescription(ctx, createRng(2)))
    // S3 present only when s3Present < .6; pairing and test draws fill their slots
    const two = buildDescriptionFromDraws(ctx, {
      s1U: 0,
      s2U: 0,
      s3U: 0,
      s3Present: 0.9,
      pairingU: 0.5,
    })
    expect(two).toBe(
      'A relaxed shirt cut from cotton poplin in optic white. Wear it with a midi skirt for the everyday.',
    )
    const three = buildDescriptionFromDraws(ctx, {
      s1U: 0,
      s2U: 0.4,
      s3U: 0,
      s3Present: 0,
      testU: 0.5,
    })
    expect(three).toBe(
      'A relaxed shirt cut from cotton poplin in optic white. An easy anchor for weekday rotation. Taped seams, bonded pockets, tested to 20k cycles.',
    )
    // an rng-driven description with the same draws matches the explicit one (draw order)
    const seq = [0, 0, 0, 0.9, 0.5]
    let k = 0
    const fake = { next: () => seq[k++] ?? 0 } as never
    expect(buildDescription(ctx, fake)).toBe(two)
  })

  it('derives detail, buttons, hood and stone slots', () => {
    const base = {
      group: 'tailoring' as const,
      schema: 'tailor-jacket',
      noun: 'Blazer',
      colorName: 'Navy',
      materialName: 'Wool',
      materialCare: 'dry-clean' as const,
      fit: 'slim',
      sleeve: 'long',
      closure: 'button',
      brandName: 'Vesper Atelier',
      occasionName: 'Work',
      aestheticName: 'Quiet Luxury',
      seasonName: 'Spring 2026',
    }
    const a = buildDescriptionSlots({ ...base, attributes: { lapel: 'peak', buttons: 'double-4' } })
    expect(a.buttons).toBe('double-breasted')
    expect(a.lapel).toBe('peak')
    expect(a.detail).toBe('long sleeve')
    expect(a.careLine).toBe('Dry clean only')
    expect(a.origin).toBe('our studio')
    const b = buildDescriptionSlots({ ...base, sleeve: null, closure: 'zip', attributes: {} })
    expect(b.buttons).toBe('zip closure')
    expect(b.lapel).toBe('clean')
    expect(b.detail).toBe('zip closure')
    expect(b.hood).toBe('no')
    const jewel = buildDescriptionSlots({
      group: 'jewelry',
      schema: 'jewel',
      noun: 'Necklace',
      colorName: 'Gold',
      materialName: 'Gold Vermeil',
      materialCare: 'metal',
      brandName: 'Cassia Fine',
      occasionName: 'Everyday',
      aestheticName: 'Clean Girl',
      seasonName: 'Spring 2026',
      attributes: { stone: 'pearl', scale: 'dainty', type: 'chain', hardware: 'none' },
    })
    expect(jewel.stone).toBe(' with pearl')
    expect(jewel.metal).toBe('gold vermeil')
    expect(jewel.detail).toBe('pearl stone')
    expect(jewel.fit).toBe('regular')
    const dress = buildDescriptionSlots({
      group: 'dresses',
      schema: 'dress',
      noun: 'Midi Dress',
      colorName: 'Sage',
      materialName: 'Linen',
      silhouette: 'a-line',
      length: 'midi',
      neckline: 'square',
      sleeve: 'puff',
      closure: 'zip',
      brandName: 'Juniper Lane',
      occasionName: 'Weekend Brunch',
      aestheticName: 'Cottagecore',
      seasonName: 'Summer 2026',
    })
    expect(dress.fit).toBe('a-line')
    expect(dress.detail).toBe('square neckline')
    expect(dress.careLine).toBe(CARE_LINES.wash)
  })
})
