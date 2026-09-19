/**
 * Test fixtures: hand-built product rows (the catalog generator was a stub when these tests were
 * written). Not exported from the package barrel.
 */
import { toStyleVector, type CategoryGroup, type ColorFamily } from '@lookline/catalog'
import type { Article } from '@lookline/db'

export interface FixtureSpec {
  id: number
  name: string
  categoryGroup: CategoryGroup
  outfitRole: Article['outfitRole']
  subcategory: string
  colorName: string
  colorHex: string
  colorFamily: ColorFamily
  /** Drives the style vector only; the catalogue carries no aesthetic column. */
  aesthetics: string[]
  material?: string
  pattern?: string
  price?: number
  department?: Article['department']
  popularity?: number
  formality?: number
}

export function makeProduct(spec: FixtureSpec): Article {
  const aesthetics: Record<string, number> = {}
  spec.aesthetics.forEach((slug, i) => {
    aesthetics[slug] = i === 0 ? 1 : 0.5
  })
  const styleVector = toStyleVector({
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
    id: String(spec.id).padStart(10, '0'),
    slug: `p-${spec.id}`,
    brandId: 1,
    name: spec.name,
    description: `${spec.name} description`,
    department: spec.department ?? 'women',
    categoryGroup: spec.categoryGroup,
    outfitRole: spec.outfitRole,
    category: spec.categoryGroup,
    subcategory: spec.subcategory,
    productGroup: 'Garment Upper body',
    section: 'Womens Everyday Collection',
    indexName: 'Ladieswear',
    indexGroupName: 'Ladieswear',
    productCode: String(spec.id).padStart(7, '0'),
    colorName: spec.colorName,
    colorHex: spec.colorHex,
    // Never came through the H&M import, so there is no perceived master behind the family.
    colorMaster: '',
    colorFamily: spec.colorFamily,
    colorValue: 'Dark',
    pattern: spec.pattern ?? 'Solid',
    material: spec.material ?? 'cotton',
    fit: '',
    length: '',
    neckline: '',
    sleeve: '',
    closure: '',
    occasions: ['everyday'],
    seasons: ['all-season'],
    attributes: {},
    styleVector,
    price: spec.price ?? 1500,
    tier: 'mid',
    salesCount: 100,
    firstSoldAt: new Date('2019-01-01T00:00:00Z'),
    lastSoldAt: new Date('2020-09-01T00:00:00Z'),
    onlineRatio: 0.5,
    popularity: spec.popularity ?? 0.5,
    trendScore: 0,
    imagePath: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

/** A four-piece quiet-luxury Look: knit, trousers, loafers, tote. */
export function fixtureLook(): Article[] {
  return [
    makeProduct({
      id: 1,
      name: 'Ridge Cashmere Crewneck',
      categoryGroup: 'tops',
      outfitRole: 'top',
      subcategory: 'crewneck-sweater',
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
      outfitRole: 'bottom',
      subcategory: 'wide-leg-trousers',
      colorName: 'Charcoal',
      colorHex: '#4A4B50',
      colorFamily: 'grey',
      aesthetics: ['quiet-luxury', 'scandi'],
      material: 'wool',
      pattern: 'pinstripe',
      price: 3200,
    }),
    makeProduct({
      id: 3,
      name: 'Lane Penny Loafer',
      categoryGroup: 'footwear',
      outfitRole: 'shoes',
      subcategory: 'loafer',
      colorName: 'Chocolate',
      colorHex: '#4E342E',
      colorFamily: 'brown',
      aesthetics: ['preppy', 'quiet-luxury'],
      material: 'leather',
      price: 3900,
    }),
    makeProduct({
      id: 4,
      name: 'Atlas Structured Tote',
      categoryGroup: 'bags',
      outfitRole: 'bag',
      subcategory: 'tote',
      colorName: 'Jet Black',
      colorHex: '#111114',
      colorFamily: 'black',
      aesthetics: ['minimalist', 'corporate-chic'],
      material: 'leather',
      price: 5600,
    }),
  ]
}
