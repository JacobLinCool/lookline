import type { ColorFamily, Department } from '@lookline/catalog'

/** Representative swatch per colour family (the catalog stores per-product hexes; these are for the rail). */
export const COLOR_FAMILY_HEX: Record<ColorFamily, string> = {
  black: '#141311',
  white: '#f4f2ec',
  grey: '#8d8a80',
  neutral: '#d9cdb8',
  brown: '#6b4a2f',
  red: '#a8322c',
  pink: '#e2a0b0',
  'yellow-orange': '#e0a03a',
  green: '#4f6b45',
  blue: '#3b5a8a',
  purple: '#6d4c8a',
  'multi-metallic': 'conic-gradient(from 45deg, #c9a24a, #b8b8b8, #7a1f2b, #3b5a8a, #c9a24a)',
}

export const COLOR_FAMILY_LABELS: Record<ColorFamily, string> = {
  black: 'Black',
  white: 'White',
  grey: 'Grey',
  neutral: 'Neutral',
  brown: 'Brown',
  red: 'Red',
  pink: 'Pink',
  'yellow-orange': 'Yellow & orange',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  'multi-metallic': 'Multi & metallic',
}

export const DEPARTMENT_LABELS: Record<Department, string> = {
  women: 'Women',
  men: 'Men',
  unisex: 'Unisex',
  kids: 'Kids',
}

export interface PricePreset {
  label: string
  priceMin?: number
  priceMax?: number
}

/** Integer TWD bands for the rail. */
export const PRICE_PRESETS: readonly PricePreset[] = [
  { label: 'Under NT$1,000', priceMax: 999 },
  { label: 'NT$1,000 – 3,000', priceMin: 1000, priceMax: 3000 },
  { label: 'NT$3,000 – 8,000', priceMin: 3000, priceMax: 8000 },
  { label: 'NT$8,000 and up', priceMin: 8000 },
]

/** Outfit slot roles from the engine, in display order. */
export const OUTFIT_ROLE_LABELS: Record<string, string> = {
  outer: 'Outer',
  tailoring: 'Tailoring',
  top: 'Top',
  dress: 'Dress',
  bottom: 'Bottom',
  shoes: 'Shoes',
  bag: 'Bag',
  accessory: 'Accessory',
  jewelry: 'Jewelry',
  activewear: 'Activewear',
  swimwear: 'Swimwear',
}
