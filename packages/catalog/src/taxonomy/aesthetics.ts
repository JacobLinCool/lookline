/**
 * The 32 aesthetics (CATALOG_SPEC §3), ordered by style-vector dim 0–31, plus the extra tables the
 * spec attaches to them: NEIGHBOURS, priors, department multipliers, background tints, favourites,
 * attribute boosts and the home-brand bias used by the affinity scorer (generate/affinity.ts).
 *
 * This file must not import values from the taxonomy barrel (it is imported by it); the small
 * colour→family and subcategory→group maps it needs are kept private here.
 */
import type { AestheticDef, Axis, CategoryGroup, ColorFamily, Department } from '../types'

export type AestheticSlug =
  | 'minimalist'
  | 'quiet-luxury'
  | 'streetwear'
  | 'y2k'
  | 'grunge'
  | 'gorpcore'
  | 'preppy'
  | 'cottagecore'
  | 'coastal'
  | 'dark-academia'
  | 'balletcore'
  | 'techwear'
  | 'boho'
  | 'athleisure'
  | 'romantic'
  | 'retro-70s'
  | 'workwear'
  | 'clean-girl'
  | 'avant-garde'
  | 'coquette'
  | 'normcore'
  | 'scandi'
  | 'city-boy'
  | 'glam'
  | 'punk'
  | 'mob-wife'
  | 'western'
  | 'resort'
  | 'goth'
  | 'kidcore'
  | 'corporate-chic'
  | 'k-street'

/** Extra per-aesthetic parameters from §3.1 that are not part of the contract `AestheticDef`. */
export interface AestheticMeta {
  slug: AestheticSlug
  /** W/M/U/K department multipliers (`deptMult` in §3.4). */
  dept: Record<Department, number>
  /** SVG background tint. */
  bg: string
  /** Global prior used when the primary is not a brand home aesthetic; the 32 sum to 1. */
  prior: number
}

// ---------------------------------------------------------------------------
// Private lookups (transcribed from §1.2 and §2.1 so this file stays cycle-free)
// ---------------------------------------------------------------------------

const GROUP_SUBCATEGORIES: ReadonlyArray<readonly [CategoryGroup, readonly string[]]> = [
  [
    'tops',
    [
      'tee',
      'tank-top',
      'crop-top',
      'button-down-shirt',
      'linen-shirt',
      'polo-shirt',
      'blouse',
      'camisole',
      'bodysuit',
      'crewneck-sweater',
      'cardigan',
      'turtleneck',
      'hoodie',
      'sweatshirt',
    ],
  ],
  [
    'bottoms',
    [
      'jeans',
      'chinos',
      'wide-leg-trousers',
      'cargo-pants',
      'leggings',
      'casual-shorts',
      'mini-skirt',
      'midi-skirt',
      'maxi-skirt',
      'pleated-skirt',
      'overalls',
    ],
  ],
  [
    'dresses',
    [
      'mini-dress',
      'midi-dress',
      'maxi-dress',
      'shirt-dress',
      'wrap-dress',
      'knit-dress',
      'slip-dress',
      'evening-gown',
      'jumpsuit',
    ],
  ],
  [
    'outerwear',
    [
      'denim-jacket',
      'bomber-jacket',
      'biker-jacket',
      'overshirt',
      'puffer-jacket',
      'windbreaker',
      'fleece-jacket',
      'parka',
      'trench-coat',
      'wool-coat',
    ],
  ],
  [
    'footwear',
    [
      'sneaker',
      'running-shoe',
      'loafer',
      'derby',
      'ballet-flat',
      'chelsea-boot',
      'ankle-boot',
      'knee-high-boot',
      'combat-boot',
      'hiking-boot',
      'pump',
      'heeled-sandal',
      'flat-sandal',
      'slide',
    ],
  ],
  [
    'bags',
    [
      'tote',
      'shoulder-bag',
      'crossbody',
      'mini-bag',
      'clutch',
      'bucket-bag',
      'backpack',
      'belt-bag',
      'duffle',
    ],
  ],
  [
    'accessories',
    [
      'baseball-cap',
      'beanie',
      'bucket-hat',
      'belt',
      'watch',
      'scarf',
      'tie',
      'sunglasses',
      'socks',
      'hair-clip',
    ],
  ],
  ['jewelry', ['necklace', 'earrings', 'bracelet', 'ring', 'brooch']],
  [
    'activewear',
    [
      'sports-bra',
      'performance-tee',
      'training-tights',
      'running-shorts',
      'bike-shorts',
      'joggers',
      'track-jacket',
    ],
  ],
  [
    'swimwear',
    ['bikini-top', 'bikini-bottom', 'one-piece', 'swim-trunks', 'rash-guard', 'cover-up'],
  ],
  ['loungewear', ['pajama-set', 'nightgown', 'robe', 'sweatpants', 'lounge-shorts', 'slipper']],
  [
    'tailoring',
    [
      'two-piece-suit',
      'tuxedo',
      'blazer',
      'waistcoat',
      'tailored-trousers',
      'pencil-skirt',
      'sheath-dress',
      'dress-shirt',
    ],
  ],
]

/** Subcategory slug → category group (private copy of §1.2 for derivations in this file). */
export const SUBCATEGORY_GROUP: Readonly<Record<string, CategoryGroup>> = Object.fromEntries(
  GROUP_SUBCATEGORIES.flatMap(([group, subs]) => subs.map((s) => [s, group] as const)),
)

const FAMILY_COLORS: ReadonlyArray<readonly [ColorFamily, readonly string[]]> = [
  ['black', ['jet-black', 'washed-black', 'onyx', 'ink']],
  ['white', ['optic-white', 'ivory', 'off-white', 'ecru']],
  ['grey', ['heather-grey', 'charcoal', 'slate', 'dove-grey']],
  ['neutral', ['oatmeal', 'beige', 'sand', 'stone']],
  ['brown', ['camel', 'chocolate', 'tan', 'cognac']],
  ['red', ['crimson', 'burgundy', 'brick', 'tomato']],
  ['pink', ['blush', 'baby-pink', 'hot-pink', 'dusty-rose']],
  ['yellow-orange', ['butter', 'mustard', 'tangerine', 'terracotta']],
  ['green', ['olive', 'forest', 'sage', 'emerald']],
  ['blue', ['navy', 'cobalt', 'sky', 'mid-wash-denim']],
  ['purple', ['lavender', 'plum', 'violet', 'mauve']],
  ['multi-metallic', ['gold', 'silver', 'rose-gold', 'multicolour']],
]

/** Colour slug → colour family (private copy of §2.1 for derivations in this file). */
export const COLOR_SLUG_FAMILY: Readonly<Record<string, ColorFamily>> = Object.fromEntries(
  FAMILY_COLORS.flatMap(([family, colors]) => colors.map((c) => [c, family] as const)),
)

// ---------------------------------------------------------------------------
// §3.1 identity and parameters + §3.2 favourites, one row per aesthetic
// ---------------------------------------------------------------------------

interface Row {
  slug: AestheticSlug
  name: string
  labelZh: string
  synonyms: readonly string[]
  definition: string
  dept: readonly [number, number, number, number]
  bg: string
  trend: number
  fAdj: number
  bold: number
  prior: number
  neighbours: readonly [AestheticSlug, AestheticSlug, AestheticSlug, AestheticSlug]
  subcategories: readonly string[]
  colours: readonly string[]
  materials: readonly string[]
  patterns: readonly string[]
  fits: readonly string[]
}

const s = (list: string): readonly string[] => list.split(/,\s*/)

const ROWS: readonly Row[] = [
  {
    slug: 'minimalist',
    name: 'Minimalist',
    labelZh: '極簡',
    synonyms: ['minimal', 'clean', '簡約', '極簡風'],
    definition: 'Clean lines, neutral palette, no logos, one idea per garment.',
    dept: [1, 1, 1, 0.3],
    bg: '#F3F1EC',
    trend: 0.55,
    fAdj: 0.05,
    bold: 0.1,
    prior: 0.05,
    neighbours: ['scandi', 'quiet-luxury', 'normcore', 'clean-girl'],
    subcategories: s(
      'tee, button-down-shirt, wide-leg-trousers, wool-coat, tote, loafer, sneaker, crewneck-sweater, midi-dress, turtleneck, tailored-trousers, crossbody',
    ),
    colours: s('optic-white, jet-black, oatmeal, stone, heather-grey, ivory, charcoal, off-white'),
    materials: s('cotton-poplin, merino, wool, leather, linen, cotton-jersey'),
    patterns: s('solid'),
    fits: s('regular, relaxed, straight, slim, column, shift'),
  },
  {
    slug: 'quiet-luxury',
    name: 'Quiet Luxury',
    labelZh: '低調奢華',
    synonyms: ['old money', 'stealth wealth', '老錢風', '靜奢'],
    definition: 'Understated luxury: cashmere, camel, tailoring, nothing that shouts.',
    dept: [1, 0.8, 0.4, 0.1],
    bg: '#EFE8DC',
    trend: 0.7,
    fAdj: 0.12,
    bold: 0.1,
    prior: 0.035,
    neighbours: ['minimalist', 'corporate-chic', 'dark-academia', 'scandi'],
    subcategories: s(
      'crewneck-sweater, wool-coat, trench-coat, blazer, tailored-trousers, loafer, tote, blouse, midi-skirt, pencil-skirt, shoulder-bag, scarf, watch',
    ),
    colours: s('camel, ivory, navy, chocolate, oatmeal, charcoal, tan, burgundy'),
    materials: s('cashmere, wool, silk, leather, merino, suede'),
    patterns: s('solid, pinstripe, houndstooth'),
    fits: s('regular, slim, straight, column, pencil'),
  },
  {
    slug: 'streetwear',
    name: 'Streetwear',
    labelZh: '街頭',
    synonyms: ['street', 'hype', '街頭風', '潮流'],
    definition: 'Oversized hoodies, graphic tees, chunky sneakers, logo energy.',
    dept: [0.7, 1, 1, 0.5],
    bg: '#E9E9EA',
    trend: 0.75,
    fAdj: -0.12,
    bold: 0.5,
    prior: 0.055,
    neighbours: ['k-street', 'techwear', 'normcore', 'y2k'],
    subcategories: s(
      'hoodie, sweatshirt, tee, cargo-pants, joggers, sneaker, bomber-jacket, baseball-cap, beanie, belt-bag, backpack, puffer-jacket',
    ),
    colours: s(
      'jet-black, optic-white, heather-grey, tomato, cobalt, tangerine, forest, washed-black',
    ),
    materials: s('french-terry, cotton-jersey, nylon, denim, fleece'),
    patterns: s('monogram, colour-block, camo, solid'),
    fits: s('oversized, boxy, relaxed, wide'),
  },
  {
    slug: 'y2k',
    name: 'Y2K',
    labelZh: '千禧',
    synonyms: ['2000s', 'millennium', '千禧風', '辣妹'],
    definition: 'Early-2000s revival: low rise, baby tees, butterfly clips, shine.',
    dept: [1, 0.3, 0.5, 0.2],
    bg: '#F6E4F0',
    trend: 0.8,
    fAdj: -0.15,
    bold: 0.7,
    prior: 0.03,
    neighbours: ['k-street', 'coquette', 'glam', 'streetwear'],
    subcategories: s(
      'crop-top, camisole, mini-skirt, jeans, bodysuit, mini-bag, hair-clip, heeled-sandal, tank-top, track-jacket, sunglasses, belt',
    ),
    colours: s('baby-pink, hot-pink, butter, sky, lavender, silver, optic-white, mid-wash-denim'),
    materials: s('satin, performance-knit, denim, mesh, velvet, cotton-jersey'),
    patterns: s('monogram, colour-block, geometric, ditsy-floral, tie-dye'),
    fits: s('fitted, skinny, bodycon, slim'),
  },
  {
    slug: 'grunge',
    name: 'Grunge',
    labelZh: '頹廢搖滾',
    synonyms: ['90s grunge', '油漬搖滾'],
    definition: '90s flannel, ripped denim, combat boots, deliberately undone.',
    dept: [0.8, 1, 1, 0.1],
    bg: '#E4E2E0',
    trend: 0.5,
    fAdj: -0.15,
    bold: 0.4,
    prior: 0.025,
    neighbours: ['punk', 'goth', 'workwear', 'streetwear'],
    subcategories: s(
      'button-down-shirt, tee, jeans, combat-boot, cardigan, biker-jacket, beanie, slip-dress, denim-jacket, overshirt',
    ),
    colours: s('washed-black, charcoal, burgundy, forest, olive, ink, heather-grey'),
    materials: s('flannel, denim, leather, cotton-jersey, mohair-blend'),
    patterns: s('plaid, solid, breton-stripe'),
    fits: s('oversized, relaxed, straight, slip'),
  },
  {
    slug: 'gorpcore',
    name: 'Gorpcore',
    labelZh: '山系',
    synonyms: ['outdoor', 'hiking style', '機能戶外', '戶外風'],
    definition: 'Technical outdoor gear worn in the city: fleece, shells, trail shoes.',
    dept: [0.7, 1, 1, 0.4],
    bg: '#E6EAE3',
    trend: 0.7,
    fAdj: -0.15,
    bold: 0.4,
    prior: 0.03,
    neighbours: ['techwear', 'workwear', 'athleisure', 'normcore'],
    subcategories: s(
      'fleece-jacket, windbreaker, puffer-jacket, parka, cargo-pants, hiking-boot, running-shoe, belt-bag, backpack, beanie, bucket-hat, track-jacket',
    ),
    colours: s('olive, forest, tangerine, navy, stone, charcoal, cobalt, mustard'),
    materials: s('fleece, nylon, recycled-polyester, performance-knit, rubber'),
    patterns: s('colour-block, solid, camo'),
    fits: s('relaxed, regular, oversized, tapered'),
  },
  {
    slug: 'preppy',
    name: 'Preppy',
    labelZh: '學院',
    synonyms: ['ivy', 'collegiate', '學院風', '常春藤'],
    definition: 'Collegiate classics: polos, chinos, loafers, stripes and plaid.',
    dept: [1, 1, 0.5, 0.8],
    bg: '#E8EEF6',
    trend: 0.5,
    fAdj: 0.08,
    bold: 0.3,
    prior: 0.03,
    neighbours: ['dark-academia', 'coastal', 'corporate-chic', 'quiet-luxury'],
    subcategories: s(
      'polo-shirt, button-down-shirt, chinos, crewneck-sweater, cardigan, pleated-skirt, loafer, blazer, casual-shorts, baseball-cap, tote, derby',
    ),
    colours: s('navy, optic-white, crimson, forest, butter, sky, stone, camel'),
    materials: s('cotton-poplin, cotton-jersey, merino, twill, tweed, leather'),
    patterns: s('breton-stripe, gingham, plaid, houndstooth, solid'),
    fits: s('regular, slim, straight, pleated, a-line'),
  },
  {
    slug: 'cottagecore',
    name: 'Cottagecore',
    labelZh: '田園',
    synonyms: ['cottage', 'prairie', '田園風', '森林系'],
    definition: 'Pastoral romance: prairie dresses, florals, linen, gingham, baskets.',
    dept: [1, 0.1, 0.2, 0.6],
    bg: '#F1F3E6',
    trend: 0.55,
    fAdj: -0.03,
    bold: 0.3,
    prior: 0.03,
    neighbours: ['romantic', 'boho', 'coastal', 'coquette'],
    subcategories: s(
      'midi-dress, maxi-dress, blouse, cardigan, midi-skirt, wrap-dress, flat-sandal, tote, bucket-hat, hair-clip, linen-shirt, nightgown',
    ),
    colours: s('sage, butter, blush, oatmeal, ivory, dusty-rose, lavender, sky'),
    materials: s('linen, cotton-poplin, lace, viscose, raffia, chiffon'),
    patterns: s('ditsy-floral, gingham, bold-floral, solid'),
    fits: s('relaxed, regular, fit-and-flare, tiered, a-line'),
  },
  {
    slug: 'coastal',
    name: 'Coastal',
    labelZh: '海岸',
    synonyms: ['riviera', 'coastal grandmother', '海邊風', '度假'],
    definition: 'Coastal ease: linen, stripes, white, straw.',
    dept: [1, 0.7, 0.5, 0.4],
    bg: '#EAF2F5',
    trend: 0.6,
    fAdj: 0,
    bold: 0.2,
    prior: 0.035,
    neighbours: ['resort', 'scandi', 'preppy', 'cottagecore'],
    subcategories: s(
      'linen-shirt, wide-leg-trousers, casual-shorts, maxi-dress, cover-up, flat-sandal, slide, tote, sunglasses, bucket-hat, cardigan, one-piece',
    ),
    colours: s('optic-white, ivory, sand, sky, navy, sage, oatmeal, beige'),
    materials: s('linen, cotton-poplin, raffia, canvas, cotton-jersey'),
    patterns: s('breton-stripe, solid, gingham'),
    fits: s('relaxed, regular, wide, shift'),
  },
  {
    slug: 'dark-academia',
    name: 'Dark Academia',
    labelZh: '暗黑學院',
    synonyms: ['academia', 'scholarly', '學術風', '復古學院'],
    definition: 'Library romance: tweed, turtlenecks, pleats, oxblood, brass.',
    dept: [1, 1, 0.5, 0.1],
    bg: '#E9E3DA',
    trend: 0.55,
    fAdj: 0.12,
    bold: 0.2,
    prior: 0.03,
    neighbours: ['preppy', 'quiet-luxury', 'goth', 'corporate-chic'],
    subcategories: s(
      'turtleneck, blazer, pleated-skirt, tailored-trousers, cardigan, derby, chelsea-boot, wool-coat, button-down-shirt, tie, brooch, tote',
    ),
    colours: s('chocolate, burgundy, forest, charcoal, camel, ink, stone, plum'),
    materials: s('tweed, wool, corduroy, flannel, leather, merino'),
    patterns: s('houndstooth, plaid, pinstripe, solid'),
    fits: s('slim, regular, tapered, pleated, pencil'),
  },
  {
    slug: 'balletcore',
    name: 'Balletcore',
    labelZh: '芭蕾',
    synonyms: ['ballet', '芭蕾風'],
    definition: 'Studio softness: wrap knits, ribbon, blush, leg-warmer layering.',
    dept: [1, 0, 0.1, 0.5],
    bg: '#F8E9EE',
    trend: 0.65,
    fAdj: 0,
    bold: 0.2,
    prior: 0.022,
    neighbours: ['coquette', 'romantic', 'clean-girl', 'athleisure'],
    subcategories: s(
      'cardigan, bodysuit, ballet-flat, midi-skirt, leggings, crop-top, hair-clip, socks, camisole, wrap-dress, knit-dress, training-tights',
    ),
    colours: s('blush, baby-pink, ivory, dusty-rose, off-white, lavender, jet-black'),
    materials: s('cotton-jersey, mohair-blend, satin, mesh, lace, merino'),
    patterns: s('solid, ditsy-floral'),
    fits: s('fitted, slim, wrap, a-line'),
  },
  {
    slug: 'techwear',
    name: 'Techwear',
    labelZh: '機能',
    synonyms: ['tech', 'urban ninja', '機能風', '都市機能'],
    definition: 'Urban technical: black shells, straps, taped seams, modular pockets.',
    dept: [0.4, 1, 1, 0.1],
    bg: '#DDDFE3',
    trend: 0.6,
    fAdj: -0.1,
    bold: 0.3,
    prior: 0.025,
    neighbours: ['gorpcore', 'streetwear', 'avant-garde', 'k-street'],
    subcategories: s(
      'windbreaker, cargo-pants, bomber-jacket, belt-bag, backpack, sneaker, combat-boot, performance-tee, joggers, puffer-jacket, sunglasses, running-shoe',
    ),
    colours: s('jet-black, onyx, charcoal, slate, olive, ink, washed-black'),
    materials: s('nylon, recycled-polyester, performance-knit, rubber, mesh'),
    patterns: s('solid, camo, geometric'),
    fits: s('tapered, relaxed, regular, slim'),
  },
  {
    slug: 'boho',
    name: 'Boho',
    labelZh: '波希米亞',
    synonyms: ['bohemian', '波西米亞', '民族風'],
    definition: 'Bohemian layering: crochet, fringe, earthy prints, flowing maxis.',
    dept: [1, 0.2, 0.3, 0.2],
    bg: '#F2EADF',
    trend: 0.5,
    fAdj: -0.05,
    bold: 0.5,
    prior: 0.028,
    neighbours: ['cottagecore', 'retro-70s', 'resort', 'western'],
    subcategories: s(
      'maxi-dress, maxi-skirt, blouse, cardigan, wide-leg-trousers, flat-sandal, bucket-bag, necklace, bracelet, scarf, cover-up, earrings',
    ),
    colours: s('terracotta, mustard, tan, olive, burgundy, oatmeal, cognac, brick'),
    materials: s('viscose, linen, suede, raffia, lace, chiffon, cotton-poplin'),
    patterns: s('bold-floral, geometric, ditsy-floral, tie-dye'),
    fits: s('relaxed, wide, tiered, wrap, flared'),
  },
  {
    slug: 'athleisure',
    name: 'Athleisure',
    labelZh: '運動休閒',
    synonyms: ['sporty', 'gym-to-street', '運動風', '機能休閒'],
    definition: 'Gym-to-street: leggings, sports bras, sleek trainers, matching sets.',
    dept: [1, 1, 0.8, 0.5],
    bg: '#E7EBEF',
    trend: 0.7,
    fAdj: -0.15,
    bold: 0.3,
    prior: 0.05,
    neighbours: ['clean-girl', 'gorpcore', 'normcore', 'balletcore'],
    subcategories: s(
      'training-tights, sports-bra, bike-shorts, performance-tee, track-jacket, joggers, sneaker, running-shoe, hoodie, baseball-cap, belt-bag, tank-top',
    ),
    colours: s('jet-black, heather-grey, sage, mauve, navy, optic-white, dusty-rose, slate'),
    materials: s('performance-knit, recycled-polyester, french-terry, mesh, nylon'),
    patterns: s('solid, colour-block'),
    fits: s('fitted, compression, regular, relaxed, tapered'),
  },
  {
    slug: 'romantic',
    name: 'Romantic',
    labelZh: '浪漫',
    synonyms: ['feminine', 'soft', '浪漫風', '甜美'],
    definition: 'Soft femininity: ruffles, puff sleeves, florals, satin, drape.',
    dept: [1, 0, 0.05, 0.3],
    bg: '#F7EBEF',
    trend: 0.55,
    fAdj: 0.05,
    bold: 0.3,
    prior: 0.03,
    neighbours: ['coquette', 'cottagecore', 'balletcore', 'glam'],
    subcategories: s(
      'blouse, midi-dress, wrap-dress, slip-dress, mini-dress, midi-skirt, heeled-sandal, pump, earrings, mini-bag, camisole, evening-gown',
    ),
    colours: s('blush, dusty-rose, lavender, butter, ivory, sky, mauve, baby-pink'),
    materials: s('chiffon, satin, silk, lace, viscose, cotton-poplin'),
    patterns: s('ditsy-floral, bold-floral, polka-dot, solid'),
    fits: s('fit-and-flare, a-line, fitted, regular, wrap, slip'),
  },
  {
    slug: 'retro-70s',
    name: 'Retro 70s',
    labelZh: '復古70',
    synonyms: ['seventies', '70s', '七零年代', '復古'],
    definition: 'Seventies revival: flares, suede, corduroy, warm browns and rust.',
    dept: [1, 0.8, 0.5, 0.1],
    bg: '#F1E7D8',
    trend: 0.5,
    fAdj: -0.03,
    bold: 0.5,
    prior: 0.022,
    neighbours: ['boho', 'western', 'workwear', 'grunge'],
    subcategories: s(
      'jeans, wide-leg-trousers, button-down-shirt, biker-jacket, knee-high-boot, sunglasses, maxi-dress, crewneck-sweater, turtleneck, belt, shoulder-bag, overshirt',
    ),
    colours: s('cognac, mustard, terracotta, chocolate, olive, tan, burgundy, camel'),
    materials: s('corduroy, suede, denim, velvet, wool, viscose'),
    patterns: s('geometric, bold-floral, solid, breton-stripe'),
    fits: s('flared, fitted, slim, wide, wrap'),
  },
  {
    slug: 'workwear',
    name: 'Workwear',
    labelZh: '工裝',
    synonyms: ['utility', 'heritage', '工裝風', '阿美咔嘰'],
    definition: 'Heritage utility: chore coats, canvas, selvedge denim, rugged boots.',
    dept: [0.6, 1, 1, 0.3],
    bg: '#EBE6DC',
    trend: 0.55,
    fAdj: -0.05,
    bold: 0.2,
    prior: 0.033,
    neighbours: ['city-boy', 'gorpcore', 'western', 'normcore'],
    subcategories: s(
      'overshirt, denim-jacket, cargo-pants, jeans, chinos, button-down-shirt, combat-boot, hiking-boot, beanie, overalls, belt, tote',
    ),
    colours: s('stone, tan, navy, olive, chocolate, mid-wash-denim, brick, charcoal'),
    materials: s('canvas, denim, twill, corduroy, flannel, leather, wool'),
    patterns: s('solid, plaid, breton-stripe'),
    fits: s('relaxed, straight, regular'),
  },
  {
    slug: 'clean-girl',
    name: 'Clean Girl',
    labelZh: '乾淨女孩',
    synonyms: ['clean look', 'polished', '乾淨風', '高級感'],
    definition: 'Sleek and polished: neutral bodysuits, gold hoops, monochrome sets.',
    dept: [1, 0, 0.2, 0.1],
    bg: '#F2EEE8',
    trend: 0.75,
    fAdj: 0.03,
    bold: 0.15,
    prior: 0.035,
    neighbours: ['minimalist', 'athleisure', 'balletcore', 'quiet-luxury'],
    subcategories: s(
      'bodysuit, tank-top, leggings, wide-leg-trousers, blazer, mini-bag, earrings, necklace, sneaker, slide, midi-dress, crop-top',
    ),
    colours: s('optic-white, beige, oatmeal, jet-black, sand, camel, stone, ivory'),
    materials: s('cotton-jersey, performance-knit, viscose, gold-vermeil, vegan-leather, satin'),
    patterns: s('solid'),
    fits: s('fitted, slim, regular, column, wide'),
  },
  {
    slug: 'avant-garde',
    name: 'Avant-Garde',
    labelZh: '前衛',
    synonyms: ['conceptual', 'deconstructed', '前衛風', '解構'],
    definition: 'Sculptural, deconstructed, asymmetric; fashion as architecture.',
    dept: [1, 0.7, 1, 0],
    bg: '#E3E1E3',
    trend: 0.6,
    fAdj: 0.05,
    bold: 0.6,
    prior: 0.02,
    neighbours: ['minimalist', 'goth', 'techwear', 'mob-wife'],
    subcategories: s(
      'wool-coat, wide-leg-trousers, maxi-dress, blazer, jumpsuit, combat-boot, tote, turtleneck, biker-jacket, evening-gown, earrings, overshirt',
    ),
    colours: s('jet-black, onyx, optic-white, charcoal, slate, ink, washed-black'),
    materials: s('wool, nylon, leather, viscose, performance-knit, satin'),
    patterns: s('solid, geometric, colour-block'),
    fits: s('oversized, boxy, wide, column'),
  },
  {
    slug: 'coquette',
    name: 'Coquette',
    labelZh: '嬌俏',
    synonyms: ['bows', 'girly', '蝴蝶結風', '少女'],
    definition: 'Bows, lace, pearls, cherry red; hyper-feminine and playful.',
    dept: [1, 0, 0.05, 0.4],
    bg: '#FAE8EC',
    trend: 0.7,
    fAdj: 0,
    bold: 0.4,
    prior: 0.03,
    neighbours: ['romantic', 'balletcore', 'y2k', 'cottagecore'],
    subcategories: s(
      'mini-dress, camisole, mini-skirt, ballet-flat, hair-clip, necklace, earrings, cardigan, blouse, socks, slip-dress, mini-bag',
    ),
    colours: s('baby-pink, blush, crimson, ivory, optic-white, dusty-rose, jet-black'),
    materials: s('lace, satin, silk, cotton-poplin, pearl-resin, chiffon'),
    patterns: s('polka-dot, ditsy-floral, gingham, solid'),
    fits: s('fitted, fit-and-flare, slim, a-line, slip'),
  },
  {
    slug: 'normcore',
    name: 'Normcore',
    labelZh: '基本',
    synonyms: ['basic', 'everyday', '基本款', '素人風'],
    definition: 'Deliberately unremarkable basics: straight jeans, plain tees, dad trainers.',
    dept: [0.8, 1, 1, 0.6],
    bg: '#ECECEA',
    trend: 0.45,
    fAdj: -0.03,
    bold: 0.05,
    prior: 0.05,
    neighbours: ['minimalist', 'streetwear', 'workwear', 'athleisure'],
    subcategories: s(
      'tee, jeans, chinos, crewneck-sweater, sneaker, fleece-jacket, baseball-cap, casual-shorts, denim-jacket, socks, polo-shirt, sweatshirt',
    ),
    colours: s(
      'heather-grey, navy, optic-white, mid-wash-denim, stone, jet-black, beige, dove-grey',
    ),
    materials: s('cotton-jersey, denim, fleece, twill, cotton-poplin'),
    patterns: s('solid, breton-stripe'),
    fits: s('regular, straight, relaxed'),
  },
  {
    slug: 'scandi',
    name: 'Scandi',
    labelZh: '北歐',
    synonyms: ['scandinavian', 'nordic', '北歐風', '斯堪地'],
    definition: 'Nordic minimal-cosy: soft wool, muted tones, functional shapes.',
    dept: [1, 0.8, 0.8, 0.7],
    bg: '#EEEDE9',
    trend: 0.6,
    fAdj: 0.02,
    bold: 0.15,
    prior: 0.035,
    neighbours: ['minimalist', 'coastal', 'quiet-luxury', 'normcore'],
    subcategories: s(
      'crewneck-sweater, cardigan, wool-coat, wide-leg-trousers, midi-dress, turtleneck, sneaker, chelsea-boot, scarf, beanie, tote, puffer-jacket',
    ),
    colours: s('oatmeal, stone, sage, ivory, charcoal, camel, sky, heather-grey'),
    materials: s('merino, wool, mohair-blend, linen, cotton-poplin, recycled-polyester'),
    patterns: s('solid, breton-stripe, geometric'),
    fits: s('relaxed, regular, oversized, shift'),
  },
  {
    slug: 'city-boy',
    name: 'City Boy',
    labelZh: '城市男孩',
    synonyms: ['citiboy', 'popeye', '日系城市', '日系'],
    definition: 'Tokyo city-boy: loose chinos, wide shorts, workwear-meets-prep layering.',
    dept: [0.3, 1, 1, 0.1],
    bg: '#E8EBEA',
    trend: 0.7,
    fAdj: 0,
    bold: 0.2,
    prior: 0.03,
    neighbours: ['workwear', 'normcore', 'preppy', 'k-street'],
    subcategories: s(
      'button-down-shirt, chinos, wide-leg-trousers, casual-shorts, overshirt, sneaker, loafer, crewneck-sweater, bucket-hat, tote, socks, denim-jacket',
    ),
    colours: s('navy, stone, optic-white, olive, sand, mid-wash-denim, chocolate, sage'),
    materials: s('cotton-poplin, twill, linen, canvas, merino, denim'),
    patterns: s('solid, breton-stripe, plaid, gingham'),
    fits: s('wide, relaxed, oversized, boxy'),
  },
  {
    slug: 'glam',
    name: 'Glam',
    labelZh: '華麗',
    synonyms: ['glamour', 'glitz', '華麗風', '派對'],
    definition: 'Night-out glamour: sequins, satin, metallics, heels, statement earrings.',
    dept: [1, 0.1, 0.05, 0],
    bg: '#EEE5EC',
    trend: 0.6,
    fAdj: 0.1,
    bold: 0.8,
    prior: 0.025,
    neighbours: ['mob-wife', 'romantic', 'y2k', 'resort'],
    subcategories: s(
      'mini-dress, evening-gown, slip-dress, pump, heeled-sandal, clutch, earrings, necklace, blazer, bodysuit, midi-skirt, jumpsuit',
    ),
    colours: s('gold, silver, jet-black, crimson, hot-pink, emerald, plum, violet'),
    materials: s('sequin, satin, silk, velvet, gold-vermeil, vegan-leather'),
    patterns: s('solid, geometric, leopard'),
    fits: s('fitted, bodycon, slim, column'),
  },
  {
    slug: 'punk',
    name: 'Punk',
    labelZh: '龐克',
    synonyms: ['rock', '龐克風', '搖滾'],
    definition: 'Studs, tartan, leather, safety pins; anti-establishment tailoring.',
    dept: [0.8, 1, 1, 0],
    bg: '#E2E0E2',
    trend: 0.5,
    fAdj: -0.1,
    bold: 0.7,
    prior: 0.02,
    neighbours: ['grunge', 'goth', 'streetwear', 'avant-garde'],
    subcategories: s(
      'biker-jacket, combat-boot, tee, jeans, pleated-skirt, mini-skirt, belt, necklace, bracelet, waistcoat, bomber-jacket, sneaker',
    ),
    colours: s('jet-black, crimson, optic-white, charcoal, tomato, plum, washed-black'),
    materials: s('leather, denim, vegan-leather, cotton-jersey, mohair-blend, stainless-steel'),
    patterns: s('plaid, solid, leopard, breton-stripe'),
    fits: s('skinny, slim, fitted, pleated'),
  },
  {
    slug: 'mob-wife',
    name: 'Mob Wife',
    labelZh: '黑幫貴婦',
    synonyms: ['maximal glam', 'fur and leopard', '貴婦風', '豹紋'],
    definition: 'Maximalist glamour: shearling, leopard, gold, oversized sunglasses.',
    dept: [1, 0.05, 0.05, 0],
    bg: '#EBE3DF',
    trend: 0.7,
    fAdj: 0.05,
    bold: 0.8,
    prior: 0.018,
    neighbours: ['glam', 'retro-70s', 'avant-garde', 'quiet-luxury'],
    subcategories: s(
      'wool-coat, biker-jacket, sunglasses, shoulder-bag, pump, knee-high-boot, earrings, necklace, midi-dress, blazer, slip-dress, belt',
    ),
    colours: s('jet-black, gold, crimson, chocolate, burgundy, camel, plum, cognac'),
    materials: s('shearling, leather, velvet, satin, gold-vermeil, silk'),
    patterns: s('leopard, solid, houndstooth'),
    fits: s('oversized, fitted, slim, bodycon'),
  },
  {
    slug: 'western',
    name: 'Western',
    labelZh: '西部',
    synonyms: ['cowboy', 'cowgirl', '牛仔風', '西部風'],
    definition: 'Cowboy revival: denim on denim, fringe, boots, pearl snaps.',
    dept: [0.9, 1, 0.5, 0.2],
    bg: '#F0E9DE',
    trend: 0.65,
    fAdj: -0.05,
    bold: 0.45,
    prior: 0.022,
    neighbours: ['workwear', 'retro-70s', 'boho', 'grunge'],
    subcategories: s(
      'denim-jacket, jeans, button-down-shirt, knee-high-boot, ankle-boot, belt, overshirt, midi-skirt, casual-shorts, scarf, necklace, chelsea-boot',
    ),
    colours: s('mid-wash-denim, tan, cognac, chocolate, optic-white, brick, sky, stone'),
    materials: s('denim, suede, leather, cotton-poplin, canvas, corduroy'),
    patterns: s('plaid, solid, geometric, bold-floral'),
    fits: s('straight, flared, slim, relaxed, a-line'),
  },
  {
    slug: 'resort',
    name: 'Resort',
    labelZh: '度假',
    synonyms: ['vacation', 'tropical', '度假風', '熱帶'],
    definition: 'Tropical holiday: bright prints, palm florals, kaftans, straw, sandals.',
    dept: [1, 0.7, 0.4, 0.6],
    bg: '#EAF4EE',
    trend: 0.55,
    fAdj: -0.08,
    bold: 0.7,
    prior: 0.03,
    neighbours: ['coastal', 'boho', 'glam', 'y2k'],
    subcategories: s(
      'cover-up, bikini-top, bikini-bottom, one-piece, swim-trunks, maxi-dress, casual-shorts, linen-shirt, flat-sandal, slide, sunglasses, tote',
    ),
    colours: s('tangerine, emerald, hot-pink, butter, sky, optic-white, sand, cobalt'),
    materials: s('linen, viscose, cotton-poplin, raffia, performance-knit, rubber'),
    patterns: s('bold-floral, geometric, breton-stripe, colour-block, tie-dye'),
    fits: s('relaxed, wide, regular, tiered, wrap'),
  },
  {
    slug: 'goth',
    name: 'Goth',
    labelZh: '哥德',
    synonyms: ['gothic', 'dark', '哥德風', '暗黑'],
    definition: 'Dark romance: all black, lace, velvet, silver hardware, platforms.',
    dept: [1, 0.6, 0.7, 0],
    bg: '#DED9DF',
    trend: 0.5,
    fAdj: 0,
    bold: 0.55,
    prior: 0.02,
    neighbours: ['punk', 'dark-academia', 'avant-garde', 'grunge'],
    subcategories: s(
      'maxi-dress, slip-dress, combat-boot, biker-jacket, turtleneck, mini-skirt, leggings, necklace, ring, blouse, wool-coat, bracelet',
    ),
    colours: s('jet-black, onyx, washed-black, burgundy, plum, silver, ink'),
    materials: s('velvet, lace, leather, vegan-leather, mesh, sterling-silver, satin'),
    patterns: s('solid, geometric'),
    fits: s('fitted, slim, oversized, column, slip'),
  },
  {
    slug: 'kidcore',
    name: 'Kidcore',
    labelZh: '童趣',
    synonyms: ['playful', 'colourful kids', '童趣風', '童裝'],
    definition: 'Playful primaries, cartoons, rainbows, comfort first.',
    dept: [0.1, 0.05, 0.2, 1],
    bg: '#FBF1DC',
    trend: 0.5,
    fAdj: -0.2,
    bold: 0.8,
    prior: 0.03,
    neighbours: ['streetwear', 'athleisure', 'preppy', 'resort'],
    subcategories: s(
      'tee, hoodie, sweatshirt, leggings, casual-shorts, sneaker, overalls, mini-dress, backpack, baseball-cap, bucket-hat, socks, pajama-set, rash-guard, slide',
    ),
    colours: s('tomato, cobalt, butter, emerald, hot-pink, tangerine, optic-white, multicolour'),
    materials: s('cotton-jersey, french-terry, fleece, denim, rubber, recycled-polyester'),
    patterns: s('colour-block, polka-dot, breton-stripe, geometric, tie-dye, monogram'),
    fits: s('regular, relaxed, a-line'),
  },
  {
    slug: 'corporate-chic',
    name: 'Corporate Chic',
    labelZh: '都會職場',
    synonyms: ['office siren', 'workwear chic', '職場風', '通勤'],
    definition: 'Office-siren modern workwear: sharp tailoring, pencil skirts, sleek pumps.',
    dept: [1, 1, 0.2, 0],
    bg: '#E8EAEF',
    trend: 0.6,
    fAdj: 0.2,
    bold: 0.2,
    prior: 0.035,
    neighbours: ['quiet-luxury', 'minimalist', 'preppy', 'dark-academia'],
    subcategories: s(
      'blazer, tailored-trousers, pencil-skirt, sheath-dress, dress-shirt, two-piece-suit, pump, loafer, tote, blouse, waistcoat, wool-coat, tie',
    ),
    colours: s('navy, charcoal, jet-black, optic-white, ivory, burgundy, camel, stone'),
    materials: s('wool, twill, cotton-poplin, silk, viscose, leather'),
    patterns: s('pinstripe, solid, houndstooth'),
    fits: s('slim, fitted, regular, straight, pencil, column'),
  },
  {
    slug: 'k-street',
    name: 'K-Street',
    labelZh: '韓系街頭',
    synonyms: ['korean street', 'seoul style', '韓系', '韓風'],
    definition:
      'Seoul street: oversized layering, soft monochrome, cropped jackets, chunky trainers.',
    dept: [1, 1, 1, 0.3],
    bg: '#EEF0F2',
    trend: 0.8,
    fAdj: -0.1,
    bold: 0.35,
    prior: 0.04,
    neighbours: ['streetwear', 'y2k', 'city-boy', 'athleisure'],
    subcategories: s(
      'hoodie, sweatshirt, bomber-jacket, wide-leg-trousers, cargo-pants, sneaker, bucket-hat, baseball-cap, crop-top, tee, pleated-skirt, crossbody, cardigan',
    ),
    colours: s('optic-white, jet-black, heather-grey, beige, sky, lavender, sage, stone'),
    materials: s('french-terry, cotton-jersey, nylon, denim, mohair-blend, performance-knit'),
    patterns: s('solid, monogram, colour-block, breton-stripe'),
    fits: s('oversized, boxy, wide, relaxed, pleated'),
  },
]

const uniq = <T>(items: readonly T[]): T[] => Array.from(new Set(items))

/** Exactly 32 entries, ordered by `index` (style-vector dims 0–31). */
export const AESTHETICS: readonly AestheticDef[] = ROWS.map((row, index) => ({
  slug: row.slug,
  name: row.name,
  labelZh: row.labelZh,
  synonyms: row.synonyms,
  index,
  definition: row.definition,
  favours: {
    categoryGroups: uniq(
      row.subcategories.flatMap((sub) => {
        const group = SUBCATEGORY_GROUP[sub]
        return group ? [group] : []
      }),
    ),
    subcategories: row.subcategories,
    colorFamilies: uniq(
      row.colours.flatMap((c) => {
        const family = COLOR_SLUG_FAMILY[c]
        return family ? [family] : []
      }),
    ),
    materials: row.materials,
    patterns: row.patterns,
    fits: row.fits,
  },
  axes: { trendiness: row.trend, formality: row.fAdj, boldness: row.bold } satisfies Partial<
    Record<Axis, number>
  >,
}))

/** Ordered slugs (dims 0–31). */
export const AESTHETIC_SLUGS: readonly AestheticSlug[] = ROWS.map((r) => r.slug)

const byRow = <T>(pick: (row: Row) => T): Readonly<Record<AestheticSlug, T>> =>
  Object.fromEntries(ROWS.map((row) => [row.slug, pick(row)])) as Record<AestheticSlug, T>

/** Secondary-aesthetic candidates per aesthetic (§3.1 `neighbours`), in table order. */
export const NEIGHBOURS: Readonly<Record<AestheticSlug, readonly AestheticSlug[]>> = byRow(
  (r) => r.neighbours,
)

/** Global prior per aesthetic (§3.1); sums to 1. */
export const AESTHETIC_PRIOR: Readonly<Record<AestheticSlug, number>> = byRow((r) => r.prior)

/** Department multipliers `deptMult(a, dept)` (§3.1 `dept` W/M/U/K). */
export const AESTHETIC_DEPT_MULT: Readonly<Record<AestheticSlug, Record<Department, number>>> =
  byRow((r) => ({ women: r.dept[0], men: r.dept[1], unisex: r.dept[2], kids: r.dept[3] }))

/** SVG background tint per aesthetic (§3.1 `bg`). */
export const AESTHETIC_BG: Readonly<Record<AestheticSlug, string>> = byRow((r) => r.bg)

/** Favoured named colours per aesthetic (§3.2, colour slugs). */
export const AESTHETIC_COLORS: Readonly<Record<AestheticSlug, readonly string[]>> = byRow(
  (r) => r.colours,
)

/**
 * Colour prior per aesthetic: colour-family weights in (0, 1] derived from the favoured colours
 * (§3.2): `count in family / max count`, so the most favoured family scores 1. Blank = 0.
 */
export const AESTHETIC_COLOR_PRIOR: Readonly<
  Record<AestheticSlug, Partial<Record<ColorFamily, number>>>
> = byRow((r) => {
  const counts = new Map<ColorFamily, number>()
  for (const c of r.colours) {
    const family = COLOR_SLUG_FAMILY[c]
    if (family) counts.set(family, (counts.get(family) ?? 0) + 1)
  }
  const max = Math.max(1, ...counts.values())
  const out: Partial<Record<ColorFamily, number>> = {}
  for (const [family, n] of counts) out[family] = Math.round((n / max) * 1000) / 1000
  return out
})

/** Per-aesthetic metadata rows (dept multipliers, background, prior) in dim order. */
export const AESTHETIC_META: readonly AestheticMeta[] = ROWS.map((r) => ({
  slug: r.slug,
  dept: AESTHETIC_DEPT_MULT[r.slug],
  bg: r.bg,
  prior: r.prior,
}))

/**
 * Home-brand bias of the affinity scorer (§3.4): `score(a) = raw(a) · (home ? 1.0 : 0.6) · deptMult`;
 * `homeWeightBonus` is the `0.15·home(a)` added to the final weight.
 */
export const HOME_BRAND_BIAS = { home: 1.0, other: 0.6, homeWeightBonus: 0.15 } as const

/** Weights of the five affinity terms in `raw(a)` (§3.4). */
export const AFFINITY_TERM_WEIGHTS = {
  category: 0.45,
  colour: 0.2,
  material: 0.15,
  pattern: 0.1,
  fit: 0.1,
} as const

/**
 * Aesthetic-specific attribute boosts (§3.3): multipliers on schema value weights when the
 * product's (provisional) primary aesthetic matches. A value ending in `*` matches by prefix
 * (`double-*` → `double-4`, `double-6`). Use `attributeBoost()` to look one up.
 */
export const ATTRIBUTE_BOOSTS: Readonly<
  Partial<Record<AestheticSlug, Readonly<Record<string, Readonly<Record<string, number>>>>>>
> = {
  romantic: { sleeve: { puff: 3 }, neckline: { sweetheart: 2 } },
  coquette: { sleeve: { puff: 3 }, stone: { pearl: 4 }, style: { bow: 4 } },
  techwear: { closure: { zip: 3 }, hood: { fixed: 2 } },
  glam: { heel: { stiletto: 3 }, scale: { statement: 3 }, stone: { 'cubic-zirconia': 2 } },
  'clean-girl': { scale: { dainty: 3 }, rise: { high: 2 } },
  y2k: { rise: { low: 4 }, length: { cropped: 3 } },
  streetwear: { height: { high: 2 }, sole: { foam: 2 }, length: { longline: 2 } },
  'k-street': { height: { high: 2 }, sole: { foam: 2 }, length: { longline: 2 } },
  punk: { toe: { pointed: 2 }, hardware: { silver: 3 } },
  'mob-wife': { lining: { shearling: 4 }, frame: { shield: 3 } },
  balletcore: { sleeve: { long: 2 } },
  kidcore: { closure: { velcro: 5 }, pack: { '3-pack': 2 } },
  'corporate-chic': { lapel: { notch: 2 }, heel: { kitten: 2 } },
  'avant-garde': { length: { longline: 3 }, buttons: { 'double-*': 2 } },
  gorpcore: { hood: { fixed: 3 }, insulation: { heavy: 2 } },
  'quiet-luxury': { gauge: { fine: 2 }, buttons: { 'double-*': 2 } },
  workwear: { closure: { snap: 3 }, wash: { raw: 3 } },
  western: { closure: { snap: 4 }, heel: { block: 2 } },
  'dark-academia': { collar: { 'button-down': 2 }, pleats: { single: 2 } },
}

/** Multiplier for `(aesthetic, attribute key, value)`; 1 when no boost applies (§3.3, §7.7). */
export function attributeBoost(aesthetic: string, key: string, value: string): number {
  const table = ATTRIBUTE_BOOSTS[aesthetic as AestheticSlug]?.[key]
  if (!table) return 1
  const exact = table[value]
  if (exact !== undefined) return exact
  for (const [pattern, mult] of Object.entries(table)) {
    if (pattern.endsWith('*') && value.startsWith(pattern.slice(0, -1))) return mult
  }
  return 1
}

const BY_SLUG: ReadonlyMap<string, AestheticDef> = new Map(AESTHETICS.map((a) => [a.slug, a]))

/** Lookup by slug; `undefined` for unknown slugs. */
export function aestheticBySlug(slug: string): AestheticDef | undefined {
  return BY_SLUG.get(slug)
}

/** True when `slug` is one of the 32 aesthetics. */
export function isAestheticSlug(slug: string): slug is AestheticSlug {
  return BY_SLUG.has(slug)
}

/** `deptMult(a, dept)` of §3.4; 0 for unknown aesthetics. */
export function aestheticDeptMult(slug: string, department: Department): number {
  return AESTHETIC_DEPT_MULT[slug as AestheticSlug]?.[department] ?? 0
}

/** Neighbour slugs of an aesthetic (empty for unknown slugs). */
export function neighboursOf(slug: string): readonly AestheticSlug[] {
  return NEIGHBOURS[slug as AestheticSlug] ?? []
}
