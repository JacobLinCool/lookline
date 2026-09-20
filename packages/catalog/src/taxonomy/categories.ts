/**
 * Category groups (§1.1), categories (§1.2), subcategories (§1.3) and subcategory economics
 * (§5.1) of docs/specs/CATALOG_SPEC.md. Every table is transcribed row for row; the
 * `SUBCATEGORIES` records are assembled at module load from the compact tables below.
 */
import type { CategoryDef, CategoryGroup, Department, SizeSystem, SubcategoryDef } from '../types'
import { ATTRIBUTE_SCHEMAS, schemaColumns } from './attribute-schemas'

// ---------------------------------------------------------------------------
// Departments and category groups
// ---------------------------------------------------------------------------

export const DEPARTMENTS = ['women', 'men', 'unisex', 'kids'] as const

/** Contract order = style-vector dims 52–63 (docs/ARCHITECTURE.md). */
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
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

export interface CategoryGroupDef {
  slug: CategoryGroup
  name: string
  labelZh: string
  /** Extra lower-case search terms (the lexicon adds slug, name and labelZh). */
  synonyms: readonly string[]
  /** Target share of the `solid` pattern inside the group (§1.1). */
  solidShare: number
}

/** §1.1, in `CATEGORY_GROUPS` order. */
export const CATEGORY_GROUP_DEFS: readonly CategoryGroupDef[] = [
  {
    slug: 'tops',
    name: 'Tops',
    labelZh: '上衣',
    synonyms: ['top', 'shirt', 'tee', '上身', '衣服'],
    solidShare: 0.62,
  },
  {
    slug: 'bottoms',
    name: 'Bottoms',
    labelZh: '下身',
    synonyms: ['pants', 'trousers', 'skirt', '褲子', '裙子', '下著'],
    solidShare: 0.72,
  },
  {
    slug: 'dresses',
    name: 'Dresses',
    labelZh: '洋裝',
    synonyms: ['dress', 'jumpsuit', '連身裙', '連衣裙', '洋裝'],
    solidShare: 0.55,
  },
  {
    slug: 'outerwear',
    name: 'Outerwear',
    labelZh: '外套',
    synonyms: ['jacket', 'coat', '外套', '夾克', '大衣'],
    solidShare: 0.74,
  },
  {
    slug: 'footwear',
    name: 'Footwear',
    labelZh: '鞋',
    synonyms: ['shoes', 'sneakers', 'boots', '鞋子', '鞋款'],
    solidShare: 0.82,
  },
  {
    slug: 'bags',
    name: 'Bags',
    labelZh: '包款',
    synonyms: ['bag', 'handbag', 'purse', '包', '包包', '袋'],
    solidShare: 0.78,
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    labelZh: '配件',
    synonyms: ['accessory', 'hat', 'belt', 'scarf', '配飾', '帽子'],
    solidShare: 0.7,
  },
  {
    slug: 'jewelry',
    name: 'Jewelry',
    labelZh: '珠寶',
    synonyms: ['jewellery', 'necklace', 'earrings', 'ring', '首飾', '飾品'],
    solidShare: 0.95,
  },
  {
    slug: 'activewear',
    name: 'Activewear',
    labelZh: '運動服',
    synonyms: ['sportswear', 'gym', 'athletic', '運動', '健身'],
    solidShare: 0.7,
  },
  {
    slug: 'swimwear',
    name: 'Swimwear',
    labelZh: '泳裝',
    synonyms: ['swimsuit', 'bikini', 'swim', '泳衣', '泳褲'],
    solidShare: 0.55,
  },
  {
    slug: 'loungewear',
    name: 'Loungewear',
    labelZh: '居家服',
    synonyms: ['pyjamas', 'pajamas', 'sleepwear', '睡衣', '家居'],
    solidShare: 0.66,
  },
  {
    slug: 'tailoring',
    name: 'Tailoring',
    labelZh: '西裝',
    synonyms: ['suit', 'blazer', 'formal', '西服', '正裝'],
    solidShare: 0.8,
  },
]

/** `GROUP_META[group]` — the §1.1 row keyed by slug. */
export const GROUP_META: Readonly<Record<CategoryGroup, CategoryGroupDef>> = Object.fromEntries(
  CATEGORY_GROUP_DEFS.map((g) => [g.slug, g]),
) as Record<CategoryGroup, CategoryGroupDef>

// ---------------------------------------------------------------------------
// Categories (§1.2, 46)
// ---------------------------------------------------------------------------

export const CATEGORIES: readonly CategoryDef[] = [
  {
    slug: 't-shirts',
    name: 'T-Shirts',
    labelZh: 'T恤',
    group: 'tops',
    subcategories: ['tee', 'tank-top', 'crop-top'],
  },
  {
    slug: 'shirts',
    name: 'Shirts',
    labelZh: '襯衫',
    group: 'tops',
    subcategories: ['button-down-shirt', 'linen-shirt', 'polo-shirt'],
  },
  {
    slug: 'blouses',
    name: 'Blouses',
    labelZh: '女衫',
    group: 'tops',
    subcategories: ['blouse', 'camisole', 'bodysuit'],
  },
  {
    slug: 'knitwear',
    name: 'Knitwear',
    labelZh: '針織',
    group: 'tops',
    subcategories: ['crewneck-sweater', 'cardigan', 'turtleneck'],
  },
  {
    slug: 'sweats',
    name: 'Sweats',
    labelZh: '衛衣',
    group: 'tops',
    subcategories: ['hoodie', 'sweatshirt'],
  },
  { slug: 'jeans', name: 'Jeans', labelZh: '牛仔褲', group: 'bottoms', subcategories: ['jeans'] },
  {
    slug: 'trousers',
    name: 'Trousers',
    labelZh: '長褲',
    // `褲子` is listed on the bottoms group too, where it dragged skirts into a search for
    // trousers; the longer-first scan prefers this tier for the same word.
    synonyms: ['褲子', 'pants'],
    group: 'bottoms',
    subcategories: ['chinos', 'wide-leg-trousers', 'cargo-pants', 'leggings'],
  },
  {
    slug: 'shorts',
    name: 'Shorts',
    labelZh: '短褲',
    group: 'bottoms',
    subcategories: ['casual-shorts'],
  },
  {
    slug: 'skirts',
    name: 'Skirts',
    labelZh: '裙子',
    group: 'bottoms',
    subcategories: ['mini-skirt', 'midi-skirt', 'maxi-skirt', 'pleated-skirt'],
  },
  {
    slug: 'overalls',
    name: 'Overalls',
    labelZh: '吊帶褲',
    group: 'bottoms',
    subcategories: ['overalls'],
  },
  {
    slug: 'day-dresses',
    name: 'Day Dresses',
    labelZh: '日常洋裝',
    group: 'dresses',
    subcategories: [
      'mini-dress',
      'midi-dress',
      'maxi-dress',
      'shirt-dress',
      'wrap-dress',
      'knit-dress',
    ],
  },
  {
    slug: 'evening-dresses',
    name: 'Evening Dresses',
    labelZh: '晚裝',
    group: 'dresses',
    subcategories: ['slip-dress', 'evening-gown'],
  },
  {
    slug: 'jumpsuits',
    name: 'Jumpsuits',
    labelZh: '連身褲',
    group: 'dresses',
    subcategories: ['jumpsuit'],
  },
  {
    slug: 'jackets',
    name: 'Jackets',
    labelZh: '夾克',
    group: 'outerwear',
    subcategories: ['denim-jacket', 'bomber-jacket', 'biker-jacket', 'overshirt'],
  },
  {
    slug: 'technical-outerwear',
    name: 'Technical Outerwear',
    labelZh: '機能外套',
    group: 'outerwear',
    subcategories: ['puffer-jacket', 'windbreaker', 'fleece-jacket', 'parka'],
  },
  {
    slug: 'coats',
    name: 'Coats',
    labelZh: '大衣',
    group: 'outerwear',
    subcategories: ['trench-coat', 'wool-coat'],
  },
  {
    slug: 'sneakers',
    name: 'Sneakers',
    labelZh: '運動鞋',
    group: 'footwear',
    subcategories: ['sneaker', 'running-shoe'],
  },
  {
    slug: 'flats',
    name: 'Flats',
    labelZh: '平底鞋',
    group: 'footwear',
    subcategories: ['loafer', 'derby', 'ballet-flat'],
  },
  {
    slug: 'boots',
    name: 'Boots',
    labelZh: '靴子',
    group: 'footwear',
    subcategories: ['chelsea-boot', 'ankle-boot', 'knee-high-boot', 'combat-boot', 'hiking-boot'],
  },
  {
    slug: 'heels',
    name: 'Heels',
    labelZh: '高跟鞋',
    group: 'footwear',
    subcategories: ['pump', 'heeled-sandal'],
  },
  {
    slug: 'sandals',
    name: 'Sandals',
    labelZh: '涼鞋',
    group: 'footwear',
    subcategories: ['flat-sandal', 'slide'],
  },
  {
    slug: 'handbags',
    name: 'Handbags',
    labelZh: '手袋',
    group: 'bags',
    subcategories: ['tote', 'shoulder-bag', 'crossbody', 'mini-bag', 'clutch', 'bucket-bag'],
  },
  {
    slug: 'carry',
    name: 'Carry',
    labelZh: '背包',
    group: 'bags',
    subcategories: ['backpack', 'belt-bag', 'duffle'],
  },
  {
    slug: 'hats',
    name: 'Hats',
    labelZh: '帽子',
    group: 'accessories',
    subcategories: ['baseball-cap', 'beanie', 'bucket-hat'],
  },
  {
    slug: 'belts-watches',
    name: 'Belts & Watches',
    labelZh: '皮帶與手錶',
    group: 'accessories',
    subcategories: ['belt', 'watch'],
  },
  {
    slug: 'scarves-ties',
    name: 'Scarves & Ties',
    labelZh: '圍巾與領帶',
    group: 'accessories',
    subcategories: ['scarf', 'tie'],
  },
  {
    slug: 'eyewear',
    name: 'Eyewear',
    labelZh: '眼鏡',
    group: 'accessories',
    subcategories: ['sunglasses'],
  },
  { slug: 'socks', name: 'Socks', labelZh: '襪子', group: 'accessories', subcategories: ['socks'] },
  {
    slug: 'hair-accessories',
    name: 'Hair Accessories',
    labelZh: '髮飾',
    group: 'accessories',
    subcategories: ['hair-clip'],
  },
  {
    slug: 'necklaces',
    name: 'Necklaces',
    labelZh: '項鍊',
    group: 'jewelry',
    subcategories: ['necklace'],
  },
  {
    slug: 'earrings',
    name: 'Earrings',
    labelZh: '耳環',
    group: 'jewelry',
    subcategories: ['earrings'],
  },
  {
    slug: 'bracelets-rings',
    name: 'Bracelets & Rings',
    labelZh: '手鍊與戒指',
    group: 'jewelry',
    subcategories: ['bracelet', 'ring'],
  },
  {
    slug: 'brooches',
    name: 'Brooches',
    labelZh: '胸針',
    group: 'jewelry',
    subcategories: ['brooch'],
  },
  {
    slug: 'performance-tops',
    name: 'Performance Tops',
    labelZh: '運動上衣',
    group: 'activewear',
    subcategories: ['sports-bra', 'performance-tee'],
  },
  {
    slug: 'performance-bottoms',
    name: 'Performance Bottoms',
    labelZh: '運動下身',
    group: 'activewear',
    subcategories: ['training-tights', 'running-shorts', 'bike-shorts', 'joggers'],
  },
  {
    slug: 'track',
    name: 'Track',
    labelZh: '運動外套',
    group: 'activewear',
    subcategories: ['track-jacket'],
  },
  {
    slug: 'bikinis',
    name: 'Bikinis',
    labelZh: '比基尼',
    group: 'swimwear',
    subcategories: ['bikini-top', 'bikini-bottom'],
  },
  {
    slug: 'swimsuits',
    name: 'Swimsuits',
    labelZh: '泳衣',
    group: 'swimwear',
    subcategories: ['one-piece', 'swim-trunks', 'rash-guard'],
  },
  {
    slug: 'beachwear',
    name: 'Beachwear',
    labelZh: '海灘服',
    group: 'swimwear',
    subcategories: ['cover-up'],
  },
  {
    slug: 'sleepwear',
    name: 'Sleepwear',
    labelZh: '睡衣',
    group: 'loungewear',
    subcategories: ['pajama-set', 'nightgown', 'robe'],
  },
  {
    slug: 'lounge-sets',
    name: 'Lounge Sets',
    labelZh: '休閒家居',
    group: 'loungewear',
    subcategories: ['sweatpants', 'lounge-shorts'],
  },
  {
    slug: 'slippers',
    name: 'Slippers',
    labelZh: '拖鞋',
    group: 'loungewear',
    subcategories: ['slipper'],
  },
  {
    slug: 'suits',
    name: 'Suits',
    labelZh: '套裝',
    group: 'tailoring',
    subcategories: ['two-piece-suit', 'tuxedo'],
  },
  {
    slug: 'tailored-jackets',
    name: 'Tailored Jackets',
    labelZh: '西裝外套',
    group: 'tailoring',
    subcategories: ['blazer', 'waistcoat'],
  },
  {
    slug: 'tailored-bottoms',
    name: 'Tailored Bottoms',
    labelZh: '西裝褲裙',
    group: 'tailoring',
    subcategories: ['tailored-trousers', 'pencil-skirt'],
  },
  {
    slug: 'tailored-dresses-shirts',
    name: 'Tailored Dresses & Shirts',
    labelZh: '正裝洋裝與襯衫',
    group: 'tailoring',
    subcategories: ['sheath-dress', 'dress-shirt'],
  },
]

// ---------------------------------------------------------------------------
// Subcategory economics (§5.1) — `form`/`cov`/`struct` are the SubcategoryDef axis bases
// ---------------------------------------------------------------------------

export interface SubcatEcon {
  /** Mid-tier median price, integer TWD. */
  basePrice: number
  /** Log-normal sigma of the price draw. */
  sigma: number
  /** Minimum brand tier: 0 budget … 3 luxury. */
  minTier: number
  formality: number
  coverage: number
  structure: number
}

type EconRow = readonly [
  base: number,
  sigma: number,
  minTier: number,
  form: number,
  cov: number,
  struct: number,
]

const ECON: Readonly<Record<string, EconRow>> = {
  tee: [890, 0.25, 0, 0.15, 0.45, 0.15],
  'tank-top': [690, 0.25, 0, 0.1, 0.35, 0.1],
  'crop-top': [790, 0.25, 0, 0.1, 0.25, 0.1],
  'polo-shirt': [1290, 0.25, 0, 0.4, 0.45, 0.25],
  'button-down-shirt': [1690, 0.25, 0, 0.55, 0.55, 0.45],
  'linen-shirt': [1890, 0.22, 0, 0.4, 0.55, 0.3],
  blouse: [1590, 0.28, 0, 0.55, 0.5, 0.25],
  camisole: [890, 0.25, 0, 0.3, 0.3, 0.1],
  bodysuit: [1090, 0.25, 0, 0.3, 0.45, 0.15],
  'crewneck-sweater': [1990, 0.28, 0, 0.4, 0.55, 0.2],
  cardigan: [2190, 0.28, 0, 0.4, 0.55, 0.2],
  turtleneck: [1490, 0.25, 0, 0.5, 0.6, 0.2],
  hoodie: [1790, 0.25, 0, 0.1, 0.6, 0.2],
  sweatshirt: [1490, 0.25, 0, 0.12, 0.55, 0.2],
  jeans: [2290, 0.3, 0, 0.3, 0.55, 0.55],
  chinos: [1790, 0.25, 0, 0.5, 0.55, 0.5],
  'wide-leg-trousers': [1990, 0.28, 0, 0.55, 0.6, 0.4],
  'cargo-pants': [1990, 0.25, 0, 0.2, 0.55, 0.5],
  leggings: [990, 0.25, 0, 0.1, 0.55, 0.1],
  'casual-shorts': [1190, 0.25, 0, 0.2, 0.3, 0.35],
  'mini-skirt': [1290, 0.28, 0, 0.3, 0.25, 0.35],
  'midi-skirt': [1690, 0.28, 0, 0.5, 0.45, 0.35],
  'maxi-skirt': [1890, 0.28, 0, 0.4, 0.6, 0.25],
  'pleated-skirt': [1590, 0.25, 0, 0.5, 0.4, 0.45],
  overalls: [2490, 0.25, 0, 0.1, 0.65, 0.5],
  'mini-dress': [1990, 0.3, 0, 0.45, 0.4, 0.3],
  'midi-dress': [2490, 0.3, 0, 0.55, 0.6, 0.3],
  'maxi-dress': [2790, 0.3, 0, 0.5, 0.75, 0.25],
  'shirt-dress': [2290, 0.28, 0, 0.55, 0.6, 0.4],
  'slip-dress': [1990, 0.3, 0, 0.55, 0.45, 0.1],
  'wrap-dress': [2290, 0.28, 0, 0.55, 0.6, 0.25],
  'knit-dress': [2190, 0.28, 0, 0.45, 0.65, 0.2],
  'evening-gown': [5900, 0.35, 1, 0.95, 0.8, 0.45],
  jumpsuit: [2590, 0.28, 0, 0.45, 0.75, 0.4],
  'denim-jacket': [2990, 0.28, 0, 0.25, 0.55, 0.6],
  'bomber-jacket': [3490, 0.3, 0, 0.3, 0.55, 0.55],
  'biker-jacket': [5900, 0.32, 1, 0.35, 0.55, 0.8],
  'puffer-jacket': [4490, 0.3, 0, 0.2, 0.65, 0.45],
  windbreaker: [2690, 0.28, 0, 0.15, 0.6, 0.4],
  'fleece-jacket': [2290, 0.25, 0, 0.1, 0.6, 0.25],
  overshirt: [2490, 0.25, 0, 0.3, 0.55, 0.45],
  parka: [5490, 0.3, 0, 0.25, 0.8, 0.55],
  'trench-coat': [5900, 0.3, 1, 0.7, 0.8, 0.7],
  'wool-coat': [7900, 0.32, 1, 0.75, 0.8, 0.75],
  sneaker: [2690, 0.3, 0, 0.2, 0.2, 0.55],
  'running-shoe': [3290, 0.28, 0, 0.1, 0.2, 0.5],
  loafer: [3490, 0.3, 0, 0.65, 0.2, 0.75],
  derby: [3990, 0.3, 0, 0.8, 0.2, 0.85],
  'ballet-flat': [2290, 0.28, 0, 0.5, 0.15, 0.5],
  'chelsea-boot': [4490, 0.3, 0, 0.6, 0.3, 0.8],
  'ankle-boot': [3990, 0.3, 0, 0.55, 0.3, 0.8],
  'knee-high-boot': [5900, 0.32, 1, 0.6, 0.45, 0.8],
  'combat-boot': [4490, 0.3, 0, 0.3, 0.35, 0.85],
  'hiking-boot': [4990, 0.28, 0, 0.15, 0.35, 0.85],
  pump: [3290, 0.3, 0, 0.85, 0.15, 0.7],
  'heeled-sandal': [2990, 0.3, 0, 0.65, 0.1, 0.55],
  'flat-sandal': [1690, 0.28, 0, 0.25, 0.1, 0.4],
  slide: [1190, 0.28, 0, 0.1, 0.1, 0.35],
  tote: [2490, 0.35, 0, 0.45, 0, 0.55],
  'shoulder-bag': [3290, 0.35, 0, 0.6, 0, 0.7],
  crossbody: [2690, 0.35, 0, 0.4, 0, 0.65],
  'mini-bag': [2290, 0.35, 0, 0.55, 0, 0.7],
  clutch: [1990, 0.35, 0, 0.85, 0, 0.7],
  'bucket-bag': [2990, 0.35, 0, 0.45, 0, 0.55],
  backpack: [2690, 0.32, 0, 0.15, 0, 0.6],
  'belt-bag': [1590, 0.32, 0, 0.1, 0, 0.55],
  duffle: [3490, 0.32, 0, 0.3, 0, 0.55],
  'baseball-cap': [890, 0.25, 0, 0.1, 0, 0.45],
  beanie: [690, 0.25, 0, 0.1, 0, 0.1],
  'bucket-hat': [890, 0.25, 0, 0.1, 0, 0.35],
  belt: [1290, 0.32, 0, 0.55, 0, 0.8],
  watch: [4990, 0.4, 0, 0.6, 0, 0.9],
  scarf: [1190, 0.32, 0, 0.45, 0, 0.1],
  tie: [1290, 0.3, 0, 0.95, 0, 0.4],
  sunglasses: [1990, 0.35, 0, 0.4, 0, 0.9],
  socks: [290, 0.22, 0, 0.2, 0, 0.1],
  'hair-clip': [390, 0.3, 0, 0.2, 0, 0.7],
  necklace: [1490, 0.4, 0, 0.55, 0, 0.9],
  earrings: [990, 0.4, 0, 0.55, 0, 0.9],
  bracelet: [1190, 0.4, 0, 0.5, 0, 0.9],
  ring: [990, 0.4, 0, 0.55, 0, 0.95],
  brooch: [890, 0.35, 0, 0.75, 0, 0.95],
  'sports-bra': [1190, 0.25, 0, 0.05, 0.25, 0.2],
  'performance-tee': [890, 0.25, 0, 0.05, 0.45, 0.15],
  'training-tights': [1690, 0.25, 0, 0.05, 0.55, 0.15],
  'running-shorts': [990, 0.25, 0, 0.05, 0.25, 0.2],
  'bike-shorts': [1090, 0.25, 0, 0.05, 0.35, 0.15],
  'track-jacket': [2290, 0.28, 0, 0.1, 0.55, 0.4],
  joggers: [1590, 0.25, 0, 0.08, 0.55, 0.2],
  'bikini-top': [990, 0.28, 0, 0.05, 0.1, 0.15],
  'bikini-bottom': [890, 0.28, 0, 0.05, 0.1, 0.15],
  'one-piece': [1790, 0.28, 0, 0.1, 0.3, 0.2],
  'swim-trunks': [1290, 0.28, 0, 0.05, 0.2, 0.3],
  'rash-guard': [1290, 0.25, 0, 0.05, 0.45, 0.2],
  'cover-up': [1590, 0.3, 0, 0.2, 0.6, 0.1],
  'pajama-set': [1690, 0.28, 0, 0.1, 0.7, 0.15],
  nightgown: [1190, 0.28, 0, 0.1, 0.55, 0.1],
  robe: [1990, 0.3, 0, 0.15, 0.75, 0.15],
  sweatpants: [1290, 0.25, 0, 0.05, 0.55, 0.15],
  'lounge-shorts': [790, 0.25, 0, 0.05, 0.25, 0.15],
  slipper: [990, 0.28, 0, 0.05, 0.1, 0.3],
  blazer: [4490, 0.32, 0, 0.8, 0.55, 0.85],
  'two-piece-suit': [9900, 0.32, 1, 0.95, 0.8, 0.9],
  tuxedo: [12900, 0.3, 1, 1.0, 0.8, 0.95],
  waistcoat: [2290, 0.3, 0, 0.7, 0.4, 0.75],
  'tailored-trousers': [2990, 0.3, 0, 0.75, 0.55, 0.6],
  'pencil-skirt': [2290, 0.28, 0, 0.75, 0.4, 0.6],
  'sheath-dress': [3490, 0.3, 0, 0.8, 0.6, 0.6],
  'dress-shirt': [1990, 0.25, 0, 0.8, 0.55, 0.55],
}

/** `SUBCAT_ECON[subcategory]` (§5.1). */
export const SUBCAT_ECON: Readonly<Record<string, SubcatEcon>> = Object.fromEntries(
  Object.entries(ECON).map(
    ([slug, [basePrice, sigma, minTier, formality, coverage, structure]]) => [
      slug,
      { basePrice, sigma, minTier, formality, coverage, structure },
    ],
  ),
)

// ---------------------------------------------------------------------------
// Silhouette ids (§9.2): the 65 base ids + 30 aliases the renderer knows
// ---------------------------------------------------------------------------

export const SILHOUETTE_BASE_IDS: readonly string[] = [
  'tee',
  'tank',
  'shirt',
  'blouse',
  'sweater',
  'cardigan',
  'hoodie',
  'sweatshirt',
  'pants',
  'pants-wide',
  'shorts',
  'skirt-mini',
  'skirt-midi',
  'skirt-maxi',
  'overalls',
  'dress-mini',
  'dress-midi',
  'dress-maxi',
  'jumpsuit',
  'jacket',
  'puffer',
  'coat',
  'trench',
  'sneaker',
  'boot-ankle',
  'boot-knee',
  'loafer',
  'flat',
  'pump',
  'sandal',
  'slide',
  'tote',
  'shoulder-bag',
  'crossbody',
  'clutch',
  'bucket-bag',
  'backpack',
  'belt-bag',
  'duffle',
  'cap',
  'beanie',
  'bucket-hat',
  'belt',
  'scarf',
  'tie',
  'sunglasses',
  'socks',
  'hair-clip',
  'watch',
  'necklace',
  'earrings',
  'bracelet',
  'ring',
  'brooch',
  'sports-bra',
  'bikini-top',
  'bikini-bottom',
  'one-piece',
  'trunks',
  'kaftan',
  'pajama',
  'nightgown',
  'robe',
  'blazer',
  'waistcoat',
]

export const SILHOUETTE_ALIAS_IDS: readonly string[] = [
  'tee-long',
  'tee-fitted',
  'tank-cropped',
  'tank-bodysuit',
  'shirt-overshirt',
  'sweater-turtle',
  'pants-cargo',
  'pants-fitted',
  'pants-cuff',
  'shorts-fitted',
  'skirt-midi-pleated',
  'skirt-midi-pencil',
  'dress-midi-placket',
  'dress-midi-straps',
  'dress-midi-wrap',
  'dress-midi-column',
  'dress-maxi-gown',
  'jacket-rib',
  'jacket-asym',
  'jacket-hood',
  'jacket-zip',
  'coat-hood',
  'sneaker-high',
  'sneaker-runner',
  'loafer-laces',
  'boot-ankle-laces',
  'pump-straps',
  'slide-fluffy',
  'shoulder-bag-mini',
  'blazer-suit',
  'blazer-satin',
]

/** Every silhouette key `silhouetteFor` may return (65 base + 30 aliases). */
export const SILHOUETTE_IDS: readonly string[] = [...SILHOUETTE_BASE_IDS, ...SILHOUETTE_ALIAS_IDS]

// ---------------------------------------------------------------------------
// Subcategories (§1.3, 109)
// ---------------------------------------------------------------------------

export type SeasonCode = 'A' | 'S' | 'W' | 'T' | 'Y'

/** `SubcategoryDef` plus the generator fields the spec adds (§13 item 2). */
export interface SubcategoryRow extends SubcategoryDef, SubcatEcon {
  /** Attribute schema id (§1.4). */
  schema: string
  /** Sampling weight inside (department, group) (§7). */
  weight: number
  /** Season prior code (§2.7). */
  seasonCode: SeasonCode
  /** Display noun used by the name grammar (injective over the table). */
  noun: string
}

type SubRow = readonly [
  slug: string,
  name: string,
  labelZh: string,
  synonyms: string,
  depts: string,
  size: 'a' | 'n' | 'e' | 'o',
  schema: string,
  weight: number,
  season: SeasonCode,
  noun: string,
  silhouette: string,
]

// prettier-ignore
const SUB_ROWS: readonly SubRow[] = [
  ['tee', 'T-Shirt', 'T恤', 't-shirt, tshirt, 短T, 短袖', 'WMUK', 'a', 'tee', 30, 'Y', 'Tee', 'tee'],
  ['tank-top', 'Tank Top', '背心', 'tank, vest, singlet, 無袖', 'WMUK', 'a', 'tank', 8, 'S', 'Tank', 'tank'],
  ['crop-top', 'Crop Top', '短版上衣', 'cropped top, 露臍, 短版', 'WK', 'a', 'tank', 6, 'S', 'Crop Top', 'tank-cropped'],
  ['polo-shirt', 'Polo Shirt', 'Polo衫', 'polo, 有領T', 'WMUK', 'a', 'shirt', 8, 'Y', 'Polo', 'shirt'],
  ['button-down-shirt', 'Button-Down Shirt', '襯衫', 'shirt, oxford, 長袖襯衫', 'WMU', 'a', 'shirt', 16, 'Y', 'Shirt', 'shirt'],
  ['linen-shirt', 'Linen Shirt', '亞麻襯衫', 'linen, 麻襯衫', 'WMU', 'a', 'shirt', 6, 'S', 'Linen Shirt', 'shirt'],
  ['blouse', 'Blouse', '女衫', 'top, 上衣, 雪紡衫', 'W', 'a', 'blouse', 14, 'Y', 'Blouse', 'blouse'],
  ['camisole', 'Camisole', '細肩帶上衣', 'cami, 吊帶, 細肩帶', 'W', 'a', 'tank', 6, 'S', 'Camisole', 'tank'],
  ['bodysuit', 'Bodysuit', '連身衣', 'body, 連體衣', 'W', 'a', 'bodysuit', 5, 'Y', 'Bodysuit', 'tank-bodysuit'],
  ['crewneck-sweater', 'Crewneck Sweater', '圓領毛衣', 'sweater, jumper, pullover, knit, 毛衣, 針織衫', 'WMUK', 'a', 'knit', 16, 'W', 'Sweater', 'sweater'],
  ['cardigan', 'Cardigan', '開襟衫', 'cardi, 針織外套, 開衫', 'WMUK', 'a', 'knit', 10, 'T', 'Cardigan', 'cardigan'],
  ['turtleneck', 'Turtleneck', '高領毛衣', 'roll neck, polo neck, 高領', 'WMU', 'a', 'knit', 7, 'W', 'Turtleneck', 'sweater-turtle'],
  ['hoodie', 'Hoodie', '連帽衫', 'hooded sweatshirt, 帽T, 連帽', 'WMUK', 'a', 'sweat', 14, 'T', 'Hoodie', 'hoodie'],
  ['sweatshirt', 'Sweatshirt', '衛衣', 'crewneck, 大學T, 圓領衛衣', 'WMUK', 'a', 'sweat', 10, 'T', 'Sweatshirt', 'sweatshirt'],
  ['jeans', 'Jeans', '牛仔褲', 'denim, 丹寧, 牛仔', 'WMUK', 'n', 'pant', 30, 'Y', 'Jeans', 'pants'],
  ['chinos', 'Chinos', '卡其褲', 'chino, khakis, 休閒褲', 'WMUK', 'n', 'pant', 14, 'Y', 'Chinos', 'pants'],
  ['wide-leg-trousers', 'Wide-Leg Trousers', '寬褲', 'wide leg pants, palazzo, 闊腿褲, 寬版褲', 'WMU', 'n', 'pant', 12, 'Y', 'Wide-Leg Trousers', 'pants-wide'],
  ['cargo-pants', 'Cargo Pants', '工裝褲', 'cargos, utility pants, 多口袋褲', 'WMUK', 'n', 'pant', 9, 'Y', 'Cargo Pants', 'pants-cargo'],
  ['leggings', 'Leggings', '內搭褲', 'tights, 緊身褲, 打底褲', 'WK', 'a', 'active-bottom', 8, 'Y', 'Leggings', 'pants-fitted'],
  ['casual-shorts', 'Shorts', '短褲', 'shorts, 休閒短褲', 'WMUK', 'a', 'short', 14, 'S', 'Shorts', 'shorts'],
  ['mini-skirt', 'Mini Skirt', '短裙', 'miniskirt, 迷你裙', 'WK', 'a', 'skirt', 8, 'S', 'Mini Skirt', 'skirt-mini'],
  ['midi-skirt', 'Midi Skirt', '中長裙', 'midi, 及膝裙, 中裙', 'W', 'a', 'skirt', 10, 'Y', 'Midi Skirt', 'skirt-midi'],
  ['maxi-skirt', 'Maxi Skirt', '長裙', 'maxi, 及踝裙', 'W', 'a', 'skirt', 6, 'S', 'Maxi Skirt', 'skirt-maxi'],
  ['pleated-skirt', 'Pleated Skirt', '百褶裙', 'pleats, 褶裙', 'WK', 'a', 'skirt', 6, 'Y', 'Pleated Skirt', 'skirt-midi-pleated'],
  ['overalls', 'Overalls', '吊帶褲', 'dungarees, bib overalls, 工裝吊帶', 'WUK', 'a', 'overalls', 4, 'Y', 'Overalls', 'overalls'],
  ['mini-dress', 'Mini Dress', '短洋裝', 'short dress, 短裙洋裝', 'WK', 'a', 'dress', 16, 'S', 'Mini Dress', 'dress-mini'],
  ['midi-dress', 'Midi Dress', '中長洋裝', 'midi, 及膝洋裝', 'WK', 'a', 'dress', 20, 'Y', 'Midi Dress', 'dress-midi'],
  ['maxi-dress', 'Maxi Dress', '長洋裝', 'long dress, 長裙洋裝', 'WK', 'a', 'dress', 12, 'S', 'Maxi Dress', 'dress-maxi'],
  ['shirt-dress', 'Shirt Dress', '襯衫洋裝', 'shirtdress, 襯衫裙', 'W', 'a', 'dress', 8, 'Y', 'Shirt Dress', 'dress-midi-placket'],
  ['slip-dress', 'Slip Dress', '吊帶洋裝', 'slip, 緞面洋裝, 細肩帶洋裝', 'W', 'a', 'dress', 8, 'S', 'Slip Dress', 'dress-midi-straps'],
  ['wrap-dress', 'Wrap Dress', '裹身洋裝', 'wrap, 綁帶洋裝', 'W', 'a', 'dress', 8, 'Y', 'Wrap Dress', 'dress-midi-wrap'],
  ['knit-dress', 'Knit Dress', '針織洋裝', 'sweater dress, 毛衣裙', 'W', 'a', 'dress', 8, 'W', 'Knit Dress', 'dress-midi'],
  ['evening-gown', 'Evening Gown', '晚禮服', 'gown, formal dress, 禮服', 'W', 'a', 'dress', 4, 'Y', 'Gown', 'dress-maxi-gown'],
  ['jumpsuit', 'Jumpsuit', '連身褲', 'romper, playsuit, 連體褲', 'WK', 'a', 'jumpsuit', 6, 'Y', 'Jumpsuit', 'jumpsuit'],
  ['denim-jacket', 'Denim Jacket', '牛仔外套', 'jean jacket, trucker, 丹寧外套', 'WMUK', 'a', 'jacket', 12, 'T', 'Denim Jacket', 'jacket'],
  ['bomber-jacket', 'Bomber Jacket', '飛行外套', 'bomber, ma-1, 飛行夾克', 'WMUK', 'a', 'jacket', 10, 'T', 'Bomber', 'jacket-rib'],
  ['biker-jacket', 'Biker Jacket', '騎士外套', 'leather jacket, moto, 皮衣, 皮外套', 'WMU', 'a', 'jacket', 6, 'T', 'Biker Jacket', 'jacket-asym'],
  ['puffer-jacket', 'Puffer Jacket', '羽絨外套', 'puffer, down jacket, 羽絨, 鋪棉', 'WMUK', 'a', 'puffer', 12, 'W', 'Puffer', 'puffer'],
  ['windbreaker', 'Windbreaker', '風衣外套', 'shell, rain jacket, 防風, 防水外套', 'WMUK', 'a', 'jacket', 8, 'T', 'Windbreaker', 'jacket-hood'],
  ['fleece-jacket', 'Fleece Jacket', '刷毛外套', 'fleece, polar, 搖粒絨', 'WMUK', 'a', 'jacket', 8, 'W', 'Fleece', 'jacket-zip'],
  ['overshirt', 'Overshirt', '襯衫外套', 'shacket, chore jacket, 工裝外套', 'WMU', 'a', 'jacket', 8, 'T', 'Overshirt', 'shirt-overshirt'],
  ['parka', 'Parka', '派克大衣', 'anorak, 長版羽絨, 連帽大衣', 'WMUK', 'a', 'coat', 6, 'W', 'Parka', 'coat-hood'],
  ['trench-coat', 'Trench Coat', '風衣', 'trench, mac, 長風衣', 'WMU', 'a', 'coat', 8, 'T', 'Trench', 'trench'],
  ['wool-coat', 'Wool Coat', '羊毛大衣', 'overcoat, topcoat, 大衣, 毛呢', 'WMU', 'a', 'coat', 10, 'W', 'Coat', 'coat'],
  ['sneaker', 'Sneaker', '休閒鞋', 'sneakers, trainers, 球鞋, 板鞋', 'WMUK', 'e', 'sneaker', 30, 'Y', 'Sneaker', 'sneaker'],
  ['running-shoe', 'Running Shoe', '跑鞋', 'runner, trainer, 慢跑鞋, 運動鞋', 'WMUK', 'e', 'sneaker', 14, 'Y', 'Runner', 'sneaker-runner'],
  ['loafer', 'Loafer', '樂福鞋', 'penny loafer, moccasin, 樂福', 'WMU', 'e', 'shoe', 10, 'Y', 'Loafer', 'loafer'],
  ['derby', 'Derby', '德比鞋', 'oxford shoe, brogue, 皮鞋, 紳士鞋', 'WM', 'e', 'shoe', 6, 'Y', 'Derby', 'loafer-laces'],
  ['ballet-flat', 'Ballet Flat', '芭蕾平底鞋', 'flats, mary jane, 平底鞋, 娃娃鞋', 'WK', 'e', 'shoe', 8, 'Y', 'Ballet Flat', 'flat'],
  ['chelsea-boot', 'Chelsea Boot', '切爾西靴', 'chelsea, 短靴', 'WMU', 'e', 'boot', 8, 'W', 'Chelsea Boot', 'boot-ankle'],
  ['ankle-boot', 'Ankle Boot', '踝靴', 'bootie, 短靴, 裸靴', 'WK', 'e', 'boot', 10, 'W', 'Ankle Boot', 'boot-ankle'],
  ['knee-high-boot', 'Knee-High Boot', '長靴', 'tall boot, riding boot, 及膝靴', 'W', 'e', 'boot', 5, 'W', 'Knee Boot', 'boot-knee'],
  ['combat-boot', 'Combat Boot', '軍靴', 'lace-up boot, 馬丁靴, 軍靴', 'WMUK', 'e', 'boot', 8, 'W', 'Combat Boot', 'boot-ankle-laces'],
  ['hiking-boot', 'Hiking Boot', '登山靴', 'trail boot, 登山鞋', 'WMUK', 'e', 'boot', 6, 'W', 'Hiking Boot', 'boot-ankle-laces'],
  ['pump', 'Pump', '高跟鞋', 'heels, stiletto, court shoe, 高跟, 尖頭鞋', 'W', 'e', 'shoe', 8, 'Y', 'Pump', 'pump'],
  ['heeled-sandal', 'Heeled Sandal', '高跟涼鞋', 'strappy sandal, 涼鞋跟鞋', 'W', 'e', 'shoe', 6, 'S', 'Heeled Sandal', 'pump-straps'],
  ['flat-sandal', 'Flat Sandal', '平底涼鞋', 'sandals, 涼鞋', 'WMUK', 'e', 'sandal', 10, 'S', 'Sandal', 'sandal'],
  ['slide', 'Slide', '拖鞋', 'slides, flip flop, mule, 拖鞋, 夾腳拖', 'WMUK', 'e', 'sandal', 8, 'S', 'Slide', 'slide'],
  ['tote', 'Tote', '托特包', 'tote bag, shopper, 大包, 手提袋', 'WMU', 'o', 'bag', 22, 'Y', 'Tote', 'tote'],
  ['shoulder-bag', 'Shoulder Bag', '肩背包', 'baguette, hobo, 單肩包', 'WM', 'o', 'bag', 16, 'Y', 'Shoulder Bag', 'shoulder-bag'],
  ['crossbody', 'Crossbody Bag', '斜背包', 'cross body, messenger, satchel, 斜挎包, 側背包', 'WMU', 'o', 'bag', 18, 'Y', 'Crossbody', 'crossbody'],
  ['mini-bag', 'Mini Bag', '迷你包', 'micro bag, 小包', 'W', 'o', 'bag', 8, 'Y', 'Mini Bag', 'shoulder-bag-mini'],
  ['clutch', 'Clutch', '手拿包', 'evening bag, pouch, 晚宴包', 'W', 'o', 'bag', 6, 'Y', 'Clutch', 'clutch'],
  ['bucket-bag', 'Bucket Bag', '水桶包', 'drawstring bag, 水桶袋', 'W', 'o', 'bag', 8, 'Y', 'Bucket Bag', 'bucket-bag'],
  ['backpack', 'Backpack', '後背包', 'rucksack, daypack, 背包, 雙肩包', 'WMUK', 'o', 'bag', 16, 'Y', 'Backpack', 'backpack'],
  ['belt-bag', 'Belt Bag', '腰包', 'fanny pack, bum bag, sling, 胸包', 'WMUK', 'o', 'bag', 8, 'Y', 'Belt Bag', 'belt-bag'],
  ['duffle', 'Duffle', '旅行袋', 'duffel, weekender, gym bag, 行李袋', 'MU', 'o', 'bag', 5, 'Y', 'Duffle', 'duffle'],
  ['baseball-cap', 'Baseball Cap', '棒球帽', 'cap, dad hat, 鴨舌帽, 老帽', 'WMUK', 'o', 'hat', 16, 'Y', 'Cap', 'cap'],
  ['beanie', 'Beanie', '毛帽', 'knit hat, 針織帽, 冷帽', 'WMUK', 'o', 'hat', 10, 'W', 'Beanie', 'beanie'],
  ['bucket-hat', 'Bucket Hat', '漁夫帽', 'fisherman hat, 漁夫', 'WMUK', 'o', 'hat', 10, 'S', 'Bucket Hat', 'bucket-hat'],
  ['belt', 'Belt', '皮帶', 'leather belt, 腰帶', 'WMU', 'o', 'belt', 12, 'Y', 'Belt', 'belt'],
  ['watch', 'Watch', '手錶', 'wristwatch, timepiece, 腕錶, 錶', 'WMU', 'o', 'watch', 6, 'Y', 'Watch', 'watch'],
  ['scarf', 'Scarf', '圍巾', 'wrap, shawl, 披肩, 絲巾', 'WMUK', 'o', 'scarf', 12, 'W', 'Scarf', 'scarf'],
  ['tie', 'Tie', '領帶', 'necktie, 領結', 'M', 'o', 'tie', 6, 'Y', 'Tie', 'tie'],
  ['sunglasses', 'Sunglasses', '太陽眼鏡', 'shades, sunnies, 墨鏡', 'WMU', 'o', 'sunglasses', 12, 'S', 'Sunglasses', 'sunglasses'],
  ['socks', 'Socks', '襪子', 'sock, crew socks, 襪', 'WMUK', 'o', 'socks', 12, 'Y', 'Socks', 'socks'],
  ['hair-clip', 'Hair Clip', '髮夾', 'claw clip, barrette, scrunchie, 髮飾, 鯊魚夾', 'WK', 'o', 'hair-clip', 6, 'Y', 'Hair Clip', 'hair-clip'],
  ['necklace', 'Necklace', '項鍊', 'chain, pendant, choker, 頸鍊', 'WMU', 'o', 'jewel', 28, 'Y', 'Necklace', 'necklace'],
  ['earrings', 'Earrings', '耳環', 'earring, hoops, studs, 耳飾, 耳釘', 'WU', 'o', 'jewel', 28, 'Y', 'Earrings', 'earrings'],
  ['bracelet', 'Bracelet', '手鍊', 'bangle, cuff, 手環', 'WMU', 'o', 'jewel', 16, 'Y', 'Bracelet', 'bracelet'],
  ['ring', 'Ring', '戒指', 'band, signet, 指環', 'WMU', 'o', 'jewel', 20, 'Y', 'Ring', 'ring'],
  ['brooch', 'Brooch', '胸針', 'pin, lapel pin, 別針', 'WMU', 'o', 'jewel', 4, 'Y', 'Brooch', 'brooch'],
  ['sports-bra', 'Sports Bra', '運動內衣', 'bra top, 運動胸衣', 'W', 'a', 'active-top', 14, 'Y', 'Sports Bra', 'sports-bra'],
  ['performance-tee', 'Performance Tee', '運動T恤', 'training tee, gym shirt, 排汗衫, 機能T', 'WMUK', 'a', 'active-top', 18, 'Y', 'Training Tee', 'tee-fitted'],
  ['training-tights', 'Training Tights', '運動緊身褲', 'gym leggings, 運動褲, 瑜珈褲', 'WK', 'a', 'active-bottom', 16, 'Y', 'Training Tights', 'pants-fitted'],
  ['running-shorts', 'Running Shorts', '跑步短褲', 'gym shorts, 運動短褲', 'WMUK', 'a', 'active-bottom', 14, 'S', 'Running Shorts', 'shorts'],
  ['bike-shorts', 'Bike Shorts', '單車短褲', 'cycling shorts, biker shorts, 騎行褲', 'WU', 'a', 'active-bottom', 8, 'S', 'Bike Shorts', 'shorts-fitted'],
  ['track-jacket', 'Track Jacket', '運動外套', 'zip jacket, warm-up jacket, 運動夾克', 'WMUK', 'a', 'jacket', 12, 'T', 'Track Jacket', 'jacket-zip'],
  ['joggers', 'Joggers', '慢跑褲', 'track pants, 運動長褲, 束口褲', 'WMUK', 'a', 'active-bottom', 16, 'Y', 'Joggers', 'pants-cuff'],
  ['bikini-top', 'Bikini Top', '比基尼上衣', 'swim top, 泳裝上衣', 'W', 'a', 'swim-top', 22, 'S', 'Bikini Top', 'bikini-top'],
  ['bikini-bottom', 'Bikini Bottom', '比基尼下身', 'swim bottom, 泳裝下身', 'W', 'a', 'swim-bottom', 20, 'S', 'Bikini Bottom', 'bikini-bottom'],
  ['one-piece', 'One-Piece Swimsuit', '連身泳衣', 'swimsuit, one piece, 泳衣', 'WK', 'a', 'one-piece', 20, 'S', 'Swimsuit', 'one-piece'],
  ['swim-trunks', 'Swim Trunks', '泳褲', 'board shorts, swim shorts, 海灘褲', 'MK', 'a', 'trunks', 20, 'S', 'Swim Trunks', 'trunks'],
  ['rash-guard', 'Rash Guard', '防曬泳衣', 'rashie, swim shirt, 水母衣, 防磨衣', 'WMK', 'a', 'rash-guard', 10, 'S', 'Rash Guard', 'tee-fitted'],
  ['cover-up', 'Cover-Up', '罩衫', 'kaftan, beach dress, sarong, 沙灘罩衫', 'W', 'a', 'cover-up', 8, 'S', 'Cover-Up', 'kaftan'],
  ['pajama-set', 'Pajama Set', '睡衣套裝', 'pyjamas, pjs, 睡衣', 'WMUK', 'a', 'lounge', 18, 'Y', 'Pajama Set', 'pajama'],
  ['nightgown', 'Nightgown', '睡裙', 'nightie, nightdress, 睡袍裙', 'WK', 'a', 'nightgown', 8, 'S', 'Nightgown', 'nightgown'],
  ['robe', 'Robe', '浴袍', 'dressing gown, bathrobe, 睡袍', 'WMU', 'a', 'robe', 10, 'W', 'Robe', 'robe'],
  ['sweatpants', 'Sweatpants', '棉褲', 'lounge pants, 休閒棉褲, 家居褲', 'WMUK', 'a', 'active-bottom', 18, 'Y', 'Sweatpants', 'pants-cuff'],
  ['lounge-shorts', 'Lounge Shorts', '居家短褲', 'sleep shorts, 家居短褲', 'WMUK', 'a', 'short', 10, 'S', 'Lounge Shorts', 'shorts'],
  ['slipper', 'Slipper', '室內拖鞋', 'house shoes, 室內鞋, 毛拖', 'WMUK', 'e', 'sandal', 10, 'W', 'Slipper', 'slide-fluffy'],
  ['blazer', 'Blazer', '西裝外套', 'sport coat, suit jacket, 西外', 'WMU', 'a', 'tailor-jacket', 24, 'Y', 'Blazer', 'blazer'],
  ['two-piece-suit', 'Two-Piece Suit', '兩件式西裝', 'suit, 套裝, 西裝', 'WM', 'a', 'suit', 10, 'Y', 'Suit', 'blazer-suit'],
  ['tuxedo', 'Tuxedo', '燕尾服', 'dinner suit, black tie, 禮服西裝', 'M', 'a', 'suit', 3, 'Y', 'Tuxedo', 'blazer-satin'],
  ['waistcoat', 'Waistcoat', '背心西裝', 'vest, gilet, 西裝背心', 'WMU', 'a', 'waistcoat', 6, 'Y', 'Waistcoat', 'waistcoat'],
  ['tailored-trousers', 'Tailored Trousers', '西裝褲', 'dress pants, slacks, 西褲', 'WMU', 'n', 'tailor-trouser', 20, 'Y', 'Trousers', 'pants'],
  ['pencil-skirt', 'Pencil Skirt', '鉛筆裙', 'office skirt, 窄裙, 包臀裙', 'W', 'a', 'skirt', 8, 'Y', 'Pencil Skirt', 'skirt-midi-pencil'],
  ['sheath-dress', 'Sheath Dress', '修身洋裝', 'office dress, 西裝洋裝, 直筒洋裝', 'W', 'a', 'dress', 8, 'Y', 'Sheath Dress', 'dress-midi-column'],
  ['dress-shirt', 'Dress Shirt', '正式襯衫', 'formal shirt, 商務襯衫, 白襯衫', 'WM', 'a', 'dress-shirt', 14, 'Y', 'Dress Shirt', 'shirt'],
]

const DEPT_LETTER: Readonly<Record<string, Department>> = {
  W: 'women',
  M: 'men',
  U: 'unisex',
  K: 'kids',
}

const SIZE_CODE: Readonly<Record<SubRow[5], SizeSystem>> = {
  a: 'alpha',
  n: 'numeric-waist',
  e: 'eu-shoe',
  o: 'one-size',
}

/** Splits a comma-separated synonym column into lower-case trimmed terms. */
export function splitSynonyms(column: string): string[] {
  return column
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
}

const CATEGORY_OF_SUB: ReadonlyMap<string, CategoryDef> = new Map(
  CATEGORIES.flatMap((c) => c.subcategories.map((s) => [s, c] as const)),
)

function buildSubcategory(row: SubRow): SubcategoryRow {
  const [
    slug,
    name,
    labelZh,
    synonyms,
    depts,
    size,
    schema,
    weight,
    seasonCode,
    noun,
    silhouetteId,
  ] = row
  const category = CATEGORY_OF_SUB.get(slug)
  if (!category)
    throw new Error(`@lookline/catalog: subcategory ${slug} is not listed by any category`)
  const econ = SUBCAT_ECON[slug]
  if (!econ) throw new Error(`@lookline/catalog: subcategory ${slug} has no SUBCAT_ECON row`)
  const attributeSchema = ATTRIBUTE_SCHEMAS[schema]
  if (!attributeSchema)
    throw new Error(`@lookline/catalog: subcategory ${slug} references unknown schema ${schema}`)
  const departments = [...depts].map((letter) => {
    const dept = DEPT_LETTER[letter]
    if (!dept) throw new Error(`@lookline/catalog: unknown department letter ${letter} on ${slug}`)
    return dept
  })
  return {
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
    group: category.group,
    category: category.slug,
    departments,
    sizeSystem: SIZE_CODE[size],
    silhouetteId,
    coverage: econ.coverage,
    formality: econ.formality,
    structure: econ.structure,
    basePrice: econ.basePrice,
    sigma: econ.sigma,
    minTier: econ.minTier,
    attributes: schemaColumns(attributeSchema),
    schema,
    weight,
    seasonCode,
    noun,
  }
}

/** §1.3 — 109 rows in spec order. Each element also satisfies the extended `SubcategoryRow`. */
export const SUBCATEGORIES: readonly SubcategoryRow[] = SUB_ROWS.map(buildSubcategory)

const SUB_BY_SLUG: ReadonlyMap<string, SubcategoryRow> = new Map(
  SUBCATEGORIES.map((s) => [s.slug, s]),
)
const CAT_BY_SLUG: ReadonlyMap<string, CategoryDef> = new Map(CATEGORIES.map((c) => [c.slug, c]))

export function findSubcategory(slug: string): SubcategoryRow | undefined {
  return SUB_BY_SLUG.get(slug)
}

export function findCategory(slug: string): CategoryDef | undefined {
  return CAT_BY_SLUG.get(slug)
}

export function findCategoryGroup(slug: string): CategoryGroupDef | undefined {
  return (GROUP_META as Record<string, CategoryGroupDef | undefined>)[slug]
}

/** Subcategories of a group, optionally restricted to those sold in `department`. */
export function subcategoriesFor(group: CategoryGroup, department?: Department): SubcategoryRow[] {
  return SUBCATEGORIES.filter(
    (s) => s.group === group && (department === undefined || s.departments.includes(department)),
  )
}

/** Category of a subcategory slug, or undefined. */
export function categoryOf(subcategory: string): CategoryDef | undefined {
  return CATEGORY_OF_SUB.get(subcategory)
}
