/**
 * Test fixtures: hand-built product rows (the catalog generator was a stub when these tests were
 * written). Not exported from the package barrel.
 */
import { toStyleVector, type CategoryGroup, type ColorFamily } from '@lookline/catalog'
import type { Product } from '@lookline/db'

export interface FixtureSpec {
  id: number
  name: string
  categoryGroup: CategoryGroup
  subcategory: string
  silhouetteId: string
  colorName: string
  colorHex: string
  colorFamily: ColorFamily
  aesthetics: string[]
  material?: string
  pattern?: string
  price?: number
  department?: Product['department']
  sizeSystem?: Product['sizeSystem']
  sizes?: string[]
  popularity?: number
  secondaryColorHex?: string | null
  formality?: number
}

export function makeProduct(spec: FixtureSpec): Product {
  const aesthetics: Record<string, number> = {}
  spec.aesthetics.forEach((slug, i) => {
    aesthetics[slug] = i === 0 ? 1 : 0.5
  })
  const styleVector = toStyleVector({
    aesthetics,
    colorFamily: spec.colorFamily,
    axes: {
      formality: spec.formality ?? 0.5,
      warmth: 0.5,
      boldness: 0.3,
      structure: 0.5,
      'price-tier': 0.4,
      coverage: 0.6,
      texture: 0.4,
      trendiness: 0.5,
    },
    categoryGroup: spec.categoryGroup,
  })
  return {
    id: spec.id,
    slug: `p-${spec.id}`,
    brandId: 1,
    name: spec.name,
    description: `${spec.name} description`,
    department: spec.department ?? 'women',
    categoryGroup: spec.categoryGroup,
    category: spec.categoryGroup,
    subcategory: spec.subcategory,
    silhouetteId: spec.silhouetteId,
    colorName: spec.colorName,
    colorHex: spec.colorHex,
    colorFamily: spec.colorFamily,
    secondaryColorHex: spec.secondaryColorHex ?? null,
    pattern: spec.pattern ?? 'solid',
    material: spec.material ?? 'cotton',
    fit: null,
    silhouette: null,
    length: null,
    neckline: null,
    sleeve: null,
    closure: null,
    occasions: ['everyday'],
    seasons: ['all-season'],
    aesthetics: spec.aesthetics,
    attributes: {},
    styleVector,
    price: spec.price ?? 1500,
    tier: 'mid',
    sizeSystem: spec.sizeSystem ?? 'alpha',
    sizes: spec.sizes ?? ['S', 'M', 'L'],
    stock: 10,
    rating: 4.2,
    reviewCount: 12,
    popularity: spec.popularity ?? 0.5,
    trendScore: 0,
    heroImageUrl: null,
    imageSeed: spec.id * 7,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

/** A four-piece quiet-luxury Look: knit, trousers, loafers, tote. */
export function fixtureLook(): Product[] {
  return [
    makeProduct({
      id: 1,
      name: 'Ridge Cashmere Crewneck',
      categoryGroup: 'tops',
      subcategory: 'crewneck-sweater',
      silhouetteId: 'sweater',
      colorName: 'Oatmeal',
      colorHex: '#D9CDB8',
      colorFamily: 'neutral',
      aesthetics: ['quiet-luxury', 'minimalist'],
      material: 'cashmere',
      price: 4200,
    }),
    makeProduct({
      id: 2,
      name: 'Harbor Wide-Leg Trousers',
      categoryGroup: 'bottoms',
      subcategory: 'wide-leg-trousers',
      silhouetteId: 'pants-wide',
      colorName: 'Charcoal',
      colorHex: '#4A4B50',
      colorFamily: 'grey',
      aesthetics: ['quiet-luxury', 'scandi'],
      material: 'wool',
      pattern: 'pinstripe',
      price: 3200,
      sizeSystem: 'numeric-waist',
      sizes: ['26', '28', '30'],
    }),
    makeProduct({
      id: 3,
      name: 'Lane Penny Loafer',
      categoryGroup: 'footwear',
      subcategory: 'loafer',
      silhouetteId: 'loafer',
      colorName: 'Chocolate',
      colorHex: '#4E342E',
      colorFamily: 'brown',
      aesthetics: ['preppy', 'quiet-luxury'],
      material: 'leather',
      price: 3900,
      sizeSystem: 'eu-shoe',
      sizes: ['37', '38', '39'],
      secondaryColorHex: '#C9A43A',
    }),
    makeProduct({
      id: 4,
      name: 'Atlas Structured Tote',
      categoryGroup: 'bags',
      subcategory: 'tote',
      silhouetteId: 'tote',
      colorName: 'Jet Black',
      colorHex: '#111114',
      colorFamily: 'black',
      aesthetics: ['minimalist', 'corporate-chic'],
      material: 'leather',
      price: 5600,
      sizeSystem: 'one-size',
      sizes: [],
    }),
  ]
}
