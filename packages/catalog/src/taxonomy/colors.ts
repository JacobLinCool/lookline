/**
 * Colours (§2.1, 48 = 4 per family), family lexicon, colour priors per group and department
 * multipliers (§2.2) of docs/specs/CATALOG_SPEC.md.
 */
import type { CategoryGroup, ColorDef, ColorFamily, Department } from '../types'
import { splitSynonyms } from './categories'

/** Contract order = style-vector dims 32–43 (docs/ARCHITECTURE.md). */
export const COLOR_FAMILIES: readonly ColorFamily[] = [
  'black',
  'white',
  'grey',
  'neutral',
  'brown',
  'red',
  'pink',
  'yellow-orange',
  'green',
  'blue',
  'purple',
  'multi-metallic',
]

export interface ColorFamilyDef {
  slug: ColorFamily
  name: string
  labelZh: string
  synonyms: readonly string[]
}

/** Family-level labels and synonyms (§2.1, last paragraph), in `COLOR_FAMILIES` order. */
export const COLOR_FAMILY_DEFS: readonly ColorFamilyDef[] = [
  { slug: 'black', name: 'Black', labelZh: '黑', synonyms: ['黑色', 'blacks'] },
  { slug: 'white', name: 'White', labelZh: '白', synonyms: ['白色', 'whites'] },
  { slug: 'grey', name: 'Grey', labelZh: '灰', synonyms: ['灰色', 'gray', 'greys'] },
  {
    slug: 'neutral',
    name: 'Neutral',
    labelZh: '中性色',
    synonyms: ['米色系', '大地色', 'neutrals', 'earth tone', 'earth tones'],
  },
  { slug: 'brown', name: 'Brown', labelZh: '棕', synonyms: ['咖啡色', 'browns'] },
  { slug: 'red', name: 'Red', labelZh: '紅', synonyms: ['紅色', 'reds'] },
  { slug: 'pink', name: 'Pink', labelZh: '粉', synonyms: ['粉色', 'pinks'] },
  {
    slug: 'yellow-orange',
    name: 'Yellow & Orange',
    labelZh: '黃橘',
    synonyms: ['黃色', '橘色', 'yellow', 'orange', 'yellows', 'oranges'],
  },
  { slug: 'green', name: 'Green', labelZh: '綠', synonyms: ['綠色', 'greens'] },
  { slug: 'blue', name: 'Blue', labelZh: '藍', synonyms: ['藍色', 'blues'] },
  { slug: 'purple', name: 'Purple', labelZh: '紫', synonyms: ['紫色', 'purples'] },
  {
    slug: 'multi-metallic',
    name: 'Multi & Metallic',
    labelZh: '金屬色',
    synonyms: ['多色', '金銀', 'metallic', 'metallics', 'multi'],
  },
]

export type Lightness = 'L' | 'M' | 'D'

/** `ColorDef` plus the generator fields of §2.1. */
export interface ColorRow extends ColorDef {
  slug: string
  /** Feeds the boldness axis, in [0, 1]. */
  boldness: number
  /** Lightness class used by the secondary-colour rules. */
  lightness: Lightness
  /** Formality adjustment. */
  formalityAdj: number
  /** Trend prior in [0, 1]. */
  trend: number
}

type ColorTuple = readonly [
  slug: string,
  name: string,
  labelZh: string,
  synonyms: string,
  hex: string,
  family: ColorFamily,
  bold: number,
  lightness: Lightness,
  fAdj: number,
  trend: number,
]

// prettier-ignore
const COLOR_ROWS: readonly ColorTuple[] = [
  ['jet-black', 'Jet Black', '黑', 'black, 黑色, 全黑', '#111114', 'black', 0.10, 'D', 0.05, 0.5],
  ['washed-black', 'Washed Black', '水洗黑', 'faded black, 炭黑', '#2B2A2E', 'black', 0.10, 'D', 0, 0.5],
  ['onyx', 'Onyx', '縞黑', 'deep black, 墨黑', '#17181C', 'black', 0.12, 'D', 0.05, 0.55],
  ['ink', 'Ink', '墨色', 'blue-black, 深藍黑', '#1B1F2E', 'black', 0.15, 'D', 0.05, 0.55],
  ['optic-white', 'Optic White', '純白', 'white, bright white, 白色', '#F8F8F6', 'white', 0.15, 'L', 0.05, 0.5],
  ['ivory', 'Ivory', '象牙白', 'cream, 米白', '#F3EEDF', 'white', 0.12, 'L', 0.05, 0.6],
  ['off-white', 'Off-White', '米白', 'bone, 米色白', '#EFEDE6', 'white', 0.10, 'L', 0, 0.55],
  ['ecru', 'Ecru', '亞麻白', 'natural, unbleached, 原色', '#E9E3D3', 'white', 0.10, 'L', 0, 0.55],
  ['heather-grey', 'Heather Grey', '麻灰', 'grey marl, 灰色, 淺灰', '#A9A9AE', 'grey', 0.08, 'M', 0, 0.5],
  ['charcoal', 'Charcoal', '炭灰', 'dark grey, 深灰', '#4A4B50', 'grey', 0.10, 'D', 0.05, 0.5],
  ['slate', 'Slate', '石板灰', 'blue grey, 灰藍', '#6B7280', 'grey', 0.12, 'M', 0.02, 0.55],
  ['dove-grey', 'Dove Grey', '鴿灰', 'light grey, 淺灰, 銀灰', '#C9C9CB', 'grey', 0.08, 'L', 0, 0.5],
  ['oatmeal', 'Oatmeal', '燕麥色', '燕麥, 淺米', '#D9CDB8', 'neutral', 0.10, 'L', 0, 0.7],
  ['beige', 'Beige', '米色', '米黃, 卡其米', '#D6C3A5', 'neutral', 0.10, 'L', 0, 0.6],
  ['sand', 'Sand', '沙色', '沙, 淺卡其', '#CDB58F', 'neutral', 0.12, 'M', 0, 0.6],
  ['stone', 'Stone', '石色', 'greige, taupe, khaki, 卡其, 灰米', '#B8AD9A', 'neutral', 0.10, 'M', 0, 0.6],
  ['camel', 'Camel', '駝色', '駝, 焦糖', '#B98B55', 'brown', 0.25, 'M', 0.05, 0.7],
  ['chocolate', 'Chocolate', '巧克力棕', 'dark brown, 深棕, 咖啡', '#4E342E', 'brown', 0.20, 'D', 0.03, 0.6],
  ['tan', 'Tan', '淺棕', '棕褐, 卡其棕', '#C69C6D', 'brown', 0.22, 'M', 0, 0.55],
  ['cognac', 'Cognac', '干邑棕', 'saddle, 焦糖棕, 紅棕', '#8B4A2B', 'brown', 0.30, 'M', 0.03, 0.6],
  ['crimson', 'Crimson', '正紅', 'red, 紅色, 大紅', '#B3122E', 'red', 0.80, 'M', 0, 0.55],
  ['burgundy', 'Burgundy', '酒紅', 'wine, oxblood, 勃根地', '#6B1E2E', 'red', 0.55, 'D', 0.05, 0.65],
  ['brick', 'Brick', '磚紅', 'rust, 鐵鏽紅, 磚', '#A3462F', 'red', 0.55, 'M', 0, 0.55],
  ['tomato', 'Tomato', '番茄紅', 'bright red, 亮紅, 橘紅', '#E2452E', 'red', 0.90, 'M', -0.05, 0.5],
  ['blush', 'Blush', '裸粉', 'nude pink, 粉, 淡粉', '#E8B4B8', 'pink', 0.30, 'L', 0, 0.65],
  ['baby-pink', 'Baby Pink', '嬰兒粉', 'pastel pink, 粉紅, 淺粉', '#F4C6D4', 'pink', 0.40, 'L', -0.03, 0.6],
  ['hot-pink', 'Hot Pink', '桃紅', 'fuchsia, magenta, 桃紅色, 亮粉', '#E3308A', 'pink', 0.95, 'M', -0.05, 0.6],
  ['dusty-rose', 'Dusty Rose', '乾燥玫瑰', 'rose, mauve pink, 玫瑰粉, 豆沙', '#C98A94', 'pink', 0.35, 'M', 0.02, 0.6],
  ['butter', 'Butter', '奶油黃', 'pale yellow, 淡黃, 鵝黃', '#F3E2A0', 'yellow-orange', 0.45, 'L', -0.03, 0.7],
  ['mustard', 'Mustard', '芥末黃', 'ochre, 芥黃, 薑黃', '#C9A227', 'yellow-orange', 0.65, 'M', 0, 0.55],
  ['tangerine', 'Tangerine', '橘色', 'orange, 橙, 亮橘', '#F07E26', 'yellow-orange', 0.90, 'M', -0.05, 0.55],
  ['terracotta', 'Terracotta', '陶土色', 'clay, burnt orange, 磚橘, 陶土', '#C4653F', 'yellow-orange', 0.60, 'M', 0, 0.6],
  ['olive', 'Olive', '橄欖綠', 'army green, 軍綠, 橄欖', '#6E6C3E', 'green', 0.25, 'M', 0, 0.6],
  ['forest', 'Forest', '森林綠', 'dark green, hunter, 深綠, 墨綠', '#204D31', 'green', 0.35, 'D', 0.02, 0.55],
  ['sage', 'Sage', '鼠尾草綠', '灰綠, 抹茶, 淺綠', '#A6B392', 'green', 0.20, 'L', 0, 0.7],
  ['emerald', 'Emerald', '祖母綠', 'bright green, 翠綠, 寶石綠', '#128A5F', 'green', 0.80, 'M', 0, 0.55],
  ['navy', 'Navy', '海軍藍', 'dark blue, 深藍, 藏青', '#1C2A4A', 'blue', 0.15, 'D', 0.05, 0.5],
  ['cobalt', 'Cobalt', '鈷藍', 'royal blue, 寶藍, 亮藍', '#2551C2', 'blue', 0.85, 'M', 0, 0.55],
  ['sky', 'Sky', '天藍', 'light blue, baby blue, 淺藍, 粉藍', '#9FCAE9', 'blue', 0.35, 'L', -0.02, 0.6],
  ['mid-wash-denim', 'Mid-Wash Denim', '中藍丹寧', 'denim blue, indigo, 牛仔藍, 靛藍', '#5E7EA8', 'blue', 0.25, 'M', -0.03, 0.55],
  ['lavender', 'Lavender', '薰衣草紫', 'lilac, 淡紫, 丁香', '#B8A8D9', 'purple', 0.35, 'L', 0, 0.65],
  ['plum', 'Plum', '梅紫', 'aubergine, 深紫, 茄紫', '#5C2A57', 'purple', 0.45, 'D', 0.02, 0.55],
  ['violet', 'Violet', '紫羅蘭', 'purple, 紫色, 亮紫', '#7B3FB3', 'purple', 0.85, 'M', 0, 0.5],
  ['mauve', 'Mauve', '藕紫', '灰紫, 藕色', '#9F7F91', 'purple', 0.25, 'M', 0, 0.6],
  ['gold', 'Gold', '金色', 'golden, 金, 黃金', '#C9A43A', 'multi-metallic', 0.75, 'M', 0.02, 0.6],
  ['silver', 'Silver', '銀色', '銀, 白銀', '#BFC3CA', 'multi-metallic', 0.55, 'L', 0, 0.55],
  ['rose-gold', 'Rose Gold', '玫瑰金', '玫瑰金色', '#B8767D', 'multi-metallic', 0.55, 'M', 0, 0.6],
  ['multicolour', 'Multicolour', '多色', 'multi, rainbow, colourful, 彩色, 撞色', '#6C5CE7', 'multi-metallic', 1.0, 'M', -0.05, 0.5],
]

/** §2.1 — 48 colours in spec order (4 per family, families in `COLOR_FAMILIES` order). */
export const COLORS: readonly ColorRow[] = COLOR_ROWS.map(
  ([slug, name, labelZh, synonyms, hex, family, boldness, lightness, formalityAdj, trend]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
    hex,
    family,
    boldness,
    lightness,
    formalityAdj,
    trend,
  }),
)

const COLOR_BY_KEY: ReadonlyMap<string, ColorRow> = new Map(
  COLORS.flatMap((c) => [
    [c.slug, c],
    [c.name, c],
    [c.name.toLowerCase(), c],
  ]),
)
const COLOR_BY_HEX: ReadonlyMap<string, ColorRow> = new Map(
  COLORS.map((c) => [c.hex.toUpperCase(), c]),
)

/** Contract lookup by `name`; also accepts the slug or a lower-cased name. */
export function findColor(name: string): ColorRow | undefined {
  return COLOR_BY_KEY.get(name) ?? COLOR_BY_KEY.get(name.toLowerCase())
}

export function colorByHex(hex: string): ColorRow | undefined {
  return COLOR_BY_HEX.get(hex.toUpperCase())
}

export function colorsInFamily(family: ColorFamily): ColorRow[] {
  return COLORS.filter((c) => c.family === family)
}

export function findColorFamily(slug: string): ColorFamilyDef | undefined {
  return COLOR_FAMILY_DEFS.find((f) => f.slug === slug)
}

// ---------------------------------------------------------------------------
// §2.2 Colour priors per group and department multipliers
// ---------------------------------------------------------------------------

type PriorRow = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

// prettier-ignore
const PRIOR_ROWS: Readonly<Record<CategoryGroup, PriorRow>> = {
  //            black white grey neutral brown red pink y-o green blue purple multi
  tops:        [16, 16, 10, 10, 5, 5, 6, 5, 7, 12, 4, 4],
  bottoms:     [18, 6, 8, 14, 8, 3, 3, 3, 8, 24, 2, 3],
  dresses:     [14, 8, 4, 8, 4, 9, 12, 6, 9, 12, 8, 6],
  outerwear:   [20, 6, 10, 14, 10, 4, 3, 4, 10, 14, 2, 3],
  footwear:    [22, 14, 8, 10, 14, 4, 4, 3, 5, 8, 2, 6],
  bags:        [22, 6, 6, 12, 20, 5, 6, 3, 6, 6, 3, 5],
  accessories: [20, 8, 10, 10, 8, 6, 6, 5, 8, 10, 4, 5],
  jewelry:     [4, 4, 2, 2, 2, 3, 5, 3, 4, 3, 3, 65],
  activewear:  [24, 8, 12, 6, 2, 5, 8, 5, 8, 12, 6, 4],
  swimwear:    [16, 8, 3, 5, 3, 9, 10, 8, 10, 14, 6, 8],
  loungewear:  [8, 10, 16, 12, 4, 4, 12, 5, 8, 12, 6, 3],
  tailoring:   [22, 6, 18, 12, 6, 3, 3, 1, 6, 20, 2, 1],
}

/** `COLOR_PRIOR[group][family]` — relative weights (§2.2). */
export const COLOR_PRIOR: Readonly<Record<CategoryGroup, Readonly<Record<ColorFamily, number>>>> =
  Object.fromEntries(
    Object.entries(PRIOR_ROWS).map(([group, row]) => [
      group,
      Object.fromEntries(COLOR_FAMILIES.map((family, i) => [family, row[i]])),
    ]),
  ) as Record<CategoryGroup, Record<ColorFamily, number>>

/** Department multipliers on the family prior; families not listed are ×1 (§2.2). */
export const DEPT_COLOR_MULT: Readonly<
  Record<Department, Readonly<Partial<Record<ColorFamily, number>>>>
> = {
  women: {},
  men: { pink: 0.3, purple: 0.5, 'yellow-orange': 0.7 },
  unisex: { pink: 0.6 },
  kids: { black: 0.5, grey: 0.6, brown: 0.7 },
}

/** Family weight for a (group, department) after the department multiplier. */
export function colorFamilyWeight(
  group: CategoryGroup,
  department: Department,
  family: ColorFamily,
): number {
  return COLOR_PRIOR[group][family] * (DEPT_COLOR_MULT[department][family] ?? 1)
}

/** Jeans colour rule (§2.2): allowed colours and the forced `wash` extra. */
export const JEANS_WASH_BY_COLOR: Readonly<Record<string, string>> = {
  'mid-wash-denim': 'mid-wash',
  navy: 'dark-wash',
  ink: 'dark-wash',
  sky: 'light-wash',
  'jet-black': 'black',
  'washed-black': 'black',
  ecru: 'raw',
  'optic-white': 'raw',
  stone: 'raw',
}

export const JEANS_COLORS: readonly string[] = Object.keys(JEANS_WASH_BY_COLOR)

/** Jewelry colour rule (§2.2): material → forced colour slug(s); `pearl-resin` is uniform over its list. */
export const JEWELRY_COLOR_BY_MATERIAL: Readonly<Record<string, readonly string[]>> = {
  'gold-vermeil': ['gold'],
  'sterling-silver': ['silver'],
  'stainless-steel': ['silver'],
  'pearl-resin': ['ivory', 'silver', 'rose-gold', 'blush'],
}
