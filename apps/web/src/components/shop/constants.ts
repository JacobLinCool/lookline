import type { ColorFamily } from '@lookline/catalog'

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

export type PricePresetKey = 'under1000' | 'band1to3' | 'band3to8' | 'from8000'

export interface PricePreset {
  /** Key into `shop.filters.pricePresets`; the band itself is not language-dependent. */
  key: PricePresetKey
  priceMin?: number
  priceMax?: number
}

/** Integer TWD bands for the rail. */
export const PRICE_PRESETS: readonly PricePreset[] = [
  { key: 'under1000', priceMax: 999 },
  { key: 'band1to3', priceMin: 1000, priceMax: 3000 },
  { key: 'band3to8', priceMin: 3000, priceMax: 8000 },
  { key: 'from8000', priceMin: 8000 },
]
