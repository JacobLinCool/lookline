/**
 * Colour constants of ENGINE_SPEC §0.4 and the colour-group / extra-colour words of §1.4.5.
 */
import type { ColorFamily } from '@lookline/catalog'

export const NEUTRAL_FAMILIES: readonly ColorFamily[] = [
  'black',
  'white',
  'grey',
  'neutral',
  'brown',
]

/** Fallback hue/lightness/saturation per family when `colorHex` is unusable. */
export const COLOR_GEOMETRY: Readonly<Record<ColorFamily, { h: number; l: number; s: number }>> = {
  black: { h: 0, l: 0.05, s: 0 },
  white: { h: 0, l: 0.97, s: 0 },
  grey: { h: 0, l: 0.55, s: 0 },
  neutral: { h: 40, l: 0.82, s: 0.15 },
  brown: { h: 25, l: 0.35, s: 0.45 },
  red: { h: 0, l: 0.45, s: 0.75 },
  pink: { h: 340, l: 0.75, s: 0.6 },
  'yellow-orange': { h: 40, l: 0.6, s: 0.8 },
  green: { h: 120, l: 0.4, s: 0.5 },
  blue: { h: 220, l: 0.45, s: 0.6 },
  purple: { h: 280, l: 0.45, s: 0.5 },
  'multi-metallic': { h: 45, l: 0.6, s: 0.7 },
}

export interface ColorGroupWord {
  value: string
  terms: readonly string[]
  /** Added to `colorWeights` (never to `colorFamilies`) unless `explicit`. */
  weights: Readonly<Partial<Record<ColorFamily, number>>>
  /** Extra boldness hint delta. */
  boldness?: number
  /** `全黑 / all black`: sets `colorFamilies` instead of weights. */
  explicit?: boolean
}

export const COLOR_GROUP_WORDS: readonly ColorGroupWord[] = [
  {
    value: 'pastel',
    terms: [
      '淡色',
      '淺色',
      '淡色系',
      '淺色系',
      'pastel',
      'pastels',
      'light colours',
      'light colors',
    ],
    weights: { white: 0.6, neutral: 0.6, pink: 0.5 },
  },
  {
    value: 'earth',
    terms: ['大地色', '大地色系', 'earth tones', 'earth tone', 'earthy', 'earthy tones'],
    weights: { brown: 0.8, neutral: 0.8, green: 0.5 },
  },
  {
    value: 'dark',
    terms: ['深色', '深色系', 'dark tones', 'dark colours', 'dark colors', 'darker colours'],
    weights: { black: 0.8, grey: 0.5, blue: 0.4 },
  },
  {
    value: 'neutrals',
    terms: ['中性色', '中性色系', 'neutrals', 'neutral colours', 'neutral colors', 'neutral tones'],
    weights: { black: 0.6, white: 0.6, grey: 0.6, neutral: 0.6, brown: 0.6 },
  },
  {
    value: 'bright',
    terms: [
      '亮色',
      '亮一點',
      '亮色系',
      '鮮豔',
      'bright',
      'colourful',
      'colorful',
      'bright colours',
    ],
    weights: { 'yellow-orange': 0.5, pink: 0.5, blue: 0.5, green: 0.5 },
    boldness: 0.4,
  },
  {
    value: 'monochrome',
    terms: ['黑白', 'monochrome', 'black and white'],
    weights: { black: 0.8, white: 0.8, grey: 0.5 },
  },
  {
    value: 'all-black',
    terms: ['全黑', 'all black', 'all-black', 'head to toe black'],
    weights: { black: 1 },
    explicit: true,
  },
]

/** Extra colour names → family (§1.4.5); only names the catalog `COLORS` table does not carry. */
export const EXTRA_COLOR_NAMES: Readonly<Record<string, ColorFamily>> = {
  caramel: 'brown',
  焦糖色: 'brown',
  駝色: 'brown',
  oat: 'neutral',
  奶油白: 'white',
  cream: 'white',
  海軍藍: 'blue',
  丹寧藍: 'blue',
  maroon: 'red',
  玫瑰: 'pink',
  芥末: 'yellow-orange',
  薰衣草: 'purple',
  炭灰: 'grey',
  metallic: 'multi-metallic',
  金色: 'multi-metallic',
  銀色: 'multi-metallic',
}

/** Floral/print words: patterns when positive, `pattern:*` + `color:multi-metallic` avoids when negated. */
export const FLORAL_WORDS: readonly string[] = [
  '花的',
  '花色',
  '印花',
  '花紋',
  '有圖案',
  'print',
  'prints',
  'printed',
  'patterned',
]
export const FLORAL_PATTERNS: readonly string[] = ['ditsy-floral', 'bold-floral']
