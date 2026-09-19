/**
 * Writes 12 sample product SVGs (one or two per category group) to `data/samples/products/`
 * (git-ignored) so a human can eyeball the silhouettes, and checks each is well-formed.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { RenderInput } from './index'
import { renderOutfitSvg, renderProductSvg } from './index'

export const SAMPLE_DIR = fileURLToPath(
  new URL('../../../../data/samples/products/', import.meta.url),
)

export const SAMPLES: ReadonlyArray<RenderInput & { file: string }> = [
  {
    file: '01-tops-shirt-gingham.svg',
    silhouetteId: 'shirt',
    colorHex: '#3E6FB0',
    secondaryColorHex: '#FFFFFF',
    pattern: 'gingham',
    aesthetics: ['preppy'],
    imageSeed: 101,
    categoryGroup: 'tops',
    name: 'Halden Row Oxford Shirt',
    brandName: 'Halden Row',
  },
  {
    file: '02-tops-hoodie-kids.svg',
    silhouetteId: 'hoodie',
    colorHex: '#F07E26',
    secondaryColorHex: null,
    pattern: 'solid',
    aesthetics: ['kidcore'],
    imageSeed: 102,
    categoryGroup: 'tops',
    name: 'Pip & Co Cloud Hoodie',
    brandName: 'Pip & Co',
    department: 'kids',
  },
  {
    file: '03-bottoms-jeans-wide.svg',
    silhouetteId: 'pants-wide',
    colorHex: '#2F4A6E',
    secondaryColorHex: null,
    pattern: 'solid',
    aesthetics: ['normcore'],
    imageSeed: 103,
    categoryGroup: 'bottoms',
    name: 'Meridian Denim Wide-Leg Trousers',
    brandName: 'Meridian Denim',
  },
  {
    file: '04-dresses-midi-floral.svg',
    silhouetteId: 'dress-midi-wrap',
    colorHex: '#8C2F39',
    secondaryColorHex: '#F3D9A4',
    pattern: 'ditsy-floral',
    aesthetics: ['cottagecore'],
    imageSeed: 104,
    categoryGroup: 'dresses',
    name: 'Fern & Field Meadow Wrap Dress',
    brandName: 'Fern & Field',
  },
  {
    file: '05-outerwear-trench-plaid.svg',
    silhouetteId: 'trench',
    colorHex: '#C8B08A',
    secondaryColorHex: '#6B4E2E',
    pattern: 'plaid',
    aesthetics: ['dark-academia'],
    imageSeed: 105,
    categoryGroup: 'outerwear',
    name: 'Ashworth Heritage Trench',
    brandName: 'Ashworth',
  },
  {
    file: '06-footwear-sneaker-high.svg',
    silhouetteId: 'sneaker-high',
    colorHex: '#111114',
    secondaryColorHex: '#FFFFFF',
    pattern: 'solid',
    aesthetics: ['streetwear'],
    imageSeed: 106,
    categoryGroup: 'footwear',
    name: 'Volt Court High Sneaker',
    brandName: 'Volt Court',
  },
  {
    file: '07-footwear-pump-leopard.svg',
    silhouetteId: 'pump',
    colorHex: '#C9A063',
    secondaryColorHex: null,
    pattern: 'leopard',
    aesthetics: ['mob-wife'],
    imageSeed: 107,
    categoryGroup: 'footwear',
    name: 'Lucia Notte Stiletto Pump',
    brandName: 'Lucia Notte',
  },
  {
    file: '08-bags-shoulder-monogram.svg',
    silhouetteId: 'shoulder-bag',
    colorHex: '#5A3A22',
    secondaryColorHex: '#C9A43A',
    pattern: 'monogram',
    aesthetics: ['quiet-luxury'],
    imageSeed: 108,
    categoryGroup: 'bags',
    name: 'Maison Ostra Signature Shoulder Bag',
    brandName: 'Maison Ostra',
  },
  {
    file: '09-accessories-cap-colourblock.svg',
    silhouetteId: 'cap',
    colorHex: '#2551C2',
    secondaryColorHex: '#F3E2A0',
    pattern: 'colour-block',
    aesthetics: ['k-street'],
    imageSeed: 109,
    categoryGroup: 'accessories',
    name: 'Seoul Static Two-Tone Cap',
    brandName: 'Seoul Static',
  },
  {
    file: '10-jewelry-necklace-gold.svg',
    silhouetteId: 'necklace',
    colorHex: '#C9A43A',
    secondaryColorHex: null,
    pattern: 'solid',
    aesthetics: ['clean-girl'],
    imageSeed: 110,
    categoryGroup: 'jewelry',
    name: 'Aurelie Drop Pendant Necklace',
    brandName: 'Aurelie',
  },
  {
    file: '11-swimwear-onepiece-tiedye.svg',
    silhouetteId: 'one-piece',
    colorHex: '#128A5F',
    secondaryColorHex: '#F3E7A9',
    pattern: 'tie-dye',
    aesthetics: ['resort'],
    imageSeed: 111,
    categoryGroup: 'swimwear',
    name: 'Isla Verde Sunset Swimsuit',
    brandName: 'Isla Verde',
  },
  {
    file: '12-tailoring-tuxedo-multicolour.svg',
    silhouetteId: 'blazer-satin',
    colorHex: '#6C5CE7',
    secondaryColorHex: '#111114',
    pattern: 'solid',
    aesthetics: ['glam'],
    imageSeed: 112,
    categoryGroup: 'tailoring',
    name: 'Vell & Vance Prism Tuxedo',
    brandName: 'Vell & Vance',
  },
]

describe('sample svgs', () => {
  it('writes 12 samples to data/samples/products', () => {
    mkdirSync(SAMPLE_DIR, { recursive: true })
    for (const { file, ...input } of SAMPLES) {
      const svg = renderProductSvg(input)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
      writeFileSync(SAMPLE_DIR + file, svg)
    }
    writeFileSync(
      SAMPLE_DIR + '13-outfit-strip.svg',
      renderOutfitSvg(SAMPLES.slice(0, 5).map(({ file: _file, ...input }) => input)),
    )
    expect(SAMPLES).toHaveLength(12)
    expect(new Set(SAMPLES.map((s) => s.categoryGroup)).size).toBeGreaterThanOrEqual(9)
  })
})
