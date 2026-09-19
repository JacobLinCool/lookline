/**
 * The 150 fictional brands (CATALOG_SPEC §4): 50 fully specified rows, a hard-coded roster of
 * 100 whose remaining fields come from a per-brand RNG stream, and seed-derived catalog shares.
 */
import { createRng, hashSeed } from '../rng'
import { AESTHETICS } from '../taxonomy'
import type { BrandTier, CategoryGroup, Department, GeneratedBrand } from '../types'

export type BrandVoice = 'crisp' | 'warm' | 'technical' | 'playful' | 'editorial'

/** `GeneratedBrand` (DB columns) plus the in-memory extras of §4.1. */
export interface BrandRecord extends GeneratedBrand {
  homeAesthetics: string[]
  homeDepartments: string[]
  priceMultiplier: number
  origin: string
  description: string
  /** Parallel to `homeAesthetics`; sums to 1. */
  homeWeights: number[]
  departmentWeights: Partial<Record<Department, number>>
  /** Unlisted = 0 (generalists: 0.15 everywhere unlisted). */
  groupWeights: Partial<Record<CategoryGroup, number>>
  popularity: number
  trend: number
  voice: BrandVoice
  founded: number
  generalist: boolean
  /** Share of the catalog in [0.0012, 0.015]; the 150 sum to 1 (§4.1). */
  size: number
}

export const TIER_PRICE_BAND: Readonly<Record<BrandTier, readonly [number, number]>> = {
  budget: [0.45, 0.75],
  mid: [0.9, 1.35],
  premium: [1.8, 3.0],
  luxury: [5, 12],
}

export const TIER_SHARE: Readonly<Record<BrandTier, number>> = {
  budget: 0.3,
  mid: 0.44,
  premium: 0.18,
  luxury: 0.08,
}

export const BRAND_SIZE_MIN = 0.0012
export const BRAND_SIZE_MAX = 0.015

export const VOICE_PRIOR: Readonly<
  Record<BrandTier, ReadonlyArray<readonly [BrandVoice, number]>>
> = {
  budget: [
    ['crisp', 3],
    ['playful', 3],
    ['warm', 2],
    ['technical', 2],
  ],
  mid: [
    ['crisp', 3],
    ['warm', 3],
    ['technical', 2],
    ['playful', 1],
    ['editorial', 1],
  ],
  premium: [
    ['editorial', 3],
    ['crisp', 3],
    ['warm', 2],
    ['technical', 2],
  ],
  luxury: [
    ['editorial', 5],
    ['crisp', 3],
  ],
}

const CITY_GROUPS: ReadonlyArray<readonly [readonly string[], readonly string[]]> = [
  [
    ['scandi', 'minimalist'],
    ['Copenhagen', 'Stockholm', 'Oslo', 'Helsinki', 'Aarhus'],
  ],
  [
    ['streetwear', 'k-street', 'y2k'],
    ['Seoul', 'Tokyo', 'Los Angeles', 'London', 'Taipei'],
  ],
  [
    ['city-boy', 'workwear', 'techwear'],
    ['Tokyo', 'Osaka', 'Kobe', 'Nagoya'],
  ],
  [
    ['coastal', 'resort'],
    ['Kaohsiung', 'Lisbon', 'Sydney', 'Cebu', 'Palma'],
  ],
  [
    ['quiet-luxury', 'corporate-chic', 'romantic', 'coquette', 'glam', 'mob-wife'],
    ['Paris', 'Milan', 'Florence', 'Geneva'],
  ],
  [
    ['preppy', 'dark-academia', 'punk', 'grunge', 'goth'],
    ['London', 'Edinburgh', 'Manchester', 'Dublin'],
  ],
  [
    ['kidcore', 'normcore', 'athleisure', 'clean-girl', 'balletcore'],
    ['Taipei', 'Taichung', 'Taoyuan', 'Singapore', 'Vancouver'],
  ],
  [
    ['boho', 'retro-70s', 'western', 'cottagecore', 'gorpcore', 'avant-garde'],
    ['Austin', 'Melbourne', 'Portland', 'Antwerp', 'Berlin'],
  ],
]

/** Origin cities per primary aesthetic (§4.3). */
export const CITIES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  CITY_GROUPS.flatMap(([slugs, cities]) => slugs.map((slug) => [slug, cities] as const)),
)

export const TAGLINES: Readonly<Record<BrandVoice, readonly string[]>> = {
  crisp: [
    'Fewer things, made right.',
    'Cut clean. Worn long.',
    'Nothing to hide behind.',
    'Designed to be repeated.',
  ],
  warm: [
    'Made for long evenings.',
    'Softness you keep.',
    'Handed down, not thrown out.',
    'Slow by choice.',
  ],
  technical: [
    'Built for weather that changes its mind.',
    'Every seam has a job.',
    'Tested, then tested again.',
    'Function first, always.',
  ],
  playful: [
    'Loud on purpose.',
    'Wear it before someone else does.',
    'Serious about not being serious.',
    'Colour is a mood.',
  ],
  editorial: [
    'A study in proportion.',
    'Worn in daylight, made for film.',
    'The edit, not the trend.',
    'Cut in the city, worn everywhere.',
  ],
}

/** ASCII kebab-case with diacritics stripped and `&` → `and` (`Étoile Enfant` → `etoile-enfant`). */
export function slugifyBrand(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// §4.2 fully specified brands 1–50 (columns transcribed as in the spec table)
// ---------------------------------------------------------------------------

interface FixedRow {
  id: number
  name: string
  tier: BrandTier
  home: string
  depts: string
  groups: string
  price: number
  pop: number
  trend: number
  voice: BrandVoice
  origin: string
  founded: number
  tagline: string
}

const fixed = (
  id: number,
  name: string,
  tier: BrandTier,
  home: string,
  depts: string,
  groups: string,
  price: number,
  pop: number,
  trend: number,
  voice: BrandVoice,
  origin: string,
  founded: number,
  tagline: string,
): FixedRow => ({
  id,
  name,
  tier,
  home,
  depts,
  groups,
  price,
  pop,
  trend,
  voice,
  origin,
  founded,
  tagline,
})

export const FIXED_BRANDS: readonly FixedRow[] = [
  fixed(
    1,
    'Arlo Basics',
    'budget',
    'normcore .6, minimalist .4',
    'W1 M1 U.8 K.6',
    'tops 1, bottoms 1, loungewear .6, accessories .3',
    0.55,
    0.95,
    0.3,
    'crisp',
    'Taipei',
    2011,
    'Everyday, done properly.',
  ),
  fixed(
    2,
    'Pelican & Pip',
    'budget',
    'kidcore 1',
    'K1',
    'tops 1, bottoms 1, outerwear .6, swimwear .5, loungewear .6, footwear .4, accessories .3',
    0.5,
    0.7,
    0.4,
    'playful',
    'Kaohsiung',
    2015,
    'Built for playgrounds.',
  ),
  fixed(
    3,
    'Marlow Street',
    'budget',
    'streetwear .6, k-street .4',
    'U1 M1 W.8',
    'tops 1, bottoms .8, outerwear .6, accessories .5, bags .3',
    0.6,
    0.85,
    0.7,
    'playful',
    'Seoul',
    2016,
    'Loud basics.',
  ),
  fixed(
    4,
    'Daily Thread',
    'budget',
    'normcore .5, clean-girl .5',
    'W1 M.7',
    'tops 1, bottoms .8, dresses .6, loungewear .5',
    0.55,
    0.9,
    0.4,
    'crisp',
    'Taichung',
    2012,
    'Wardrobe staples, weekly.',
  ),
  fixed(
    5,
    'Tempo Active',
    'budget',
    'athleisure 1',
    'W1 M1 U.6 K.5',
    'activewear 1, footwear .5, accessories .2',
    0.6,
    0.8,
    0.5,
    'technical',
    'Kuala Lumpur',
    2017,
    'Move more, spend less.',
  ),
  fixed(
    6,
    'Sunny Row',
    'budget',
    'coastal .5, resort .5',
    'W1',
    'dresses 1, swimwear .9, tops .6, accessories .3',
    0.55,
    0.6,
    0.4,
    'warm',
    'Cebu',
    2018,
    'Holiday in every drawer.',
  ),
  fixed(
    7,
    'Bolt Kids',
    'budget',
    'kidcore .6, athleisure .4',
    'K1',
    'activewear 1, footwear .8, tops .6, accessories .3',
    0.5,
    0.55,
    0.4,
    'playful',
    'Taoyuan',
    2019,
    'Fast feet, tough knees.',
  ),
  fixed(
    8,
    'Fern & Co.',
    'budget',
    'cottagecore .6, romantic .4',
    'W1 K.2',
    'dresses 1, tops .8, accessories .4, bottoms .3',
    0.6,
    0.65,
    0.45,
    'warm',
    'Chiang Mai',
    2016,
    'Soft things for soft days.',
  ),
  fixed(
    9,
    'Grid Nine',
    'budget',
    'techwear .6, streetwear .4',
    'M1 U.8',
    'outerwear 1, bottoms .8, bags .6, accessories .3',
    0.65,
    0.6,
    0.55,
    'technical',
    'Shenzhen',
    2018,
    'Urban armour, entry level.',
  ),
  fixed(
    10,
    'Pocket Denim Co.',
    'budget',
    'normcore .5, workwear .5',
    'W1 M1 K.5',
    'bottoms 1, outerwear .5, tops .2',
    0.6,
    0.75,
    0.35,
    'crisp',
    'Kaohsiung',
    2009,
    'Denim without the drama.',
  ),
  fixed(
    11,
    'Hush Lounge',
    'budget',
    'clean-girl .5, scandi .5',
    'W1 M.6 U.6',
    'loungewear 1, tops .3',
    0.55,
    0.6,
    0.4,
    'warm',
    'Taipei',
    2020,
    'Stay in, dress well.',
  ),
  fixed(
    12,
    'Trinket Lab',
    'budget',
    'coquette .6, y2k .4',
    'W1 K.2',
    'jewelry 1, accessories .6',
    0.45,
    0.7,
    0.65,
    'playful',
    'Bangkok',
    2019,
    'Tiny things, big mood.',
  ),
  fixed(
    13,
    'Halden Row',
    'mid',
    'minimalist .6, scandi .4',
    'W1 M1 U.5',
    'tops 1, bottoms .9, outerwear .8, tailoring .5, accessories .3',
    1.1,
    0.85,
    0.55,
    'crisp',
    'Copenhagen',
    2009,
    'Quiet, considered, worn daily.',
  ),
  fixed(
    14,
    'Cove & Salt',
    'mid',
    'coastal .6, resort .4',
    'W1 M.7',
    'tops .9, bottoms .7, swimwear 1, dresses .8, accessories .5',
    1.0,
    0.7,
    0.5,
    'warm',
    'Lisbon',
    2014,
    'Linen, sun, salt.',
  ),
  fixed(
    15,
    'Northfold',
    'mid',
    'gorpcore .7, workwear .3',
    'M1 U1 W.7',
    'outerwear 1, footwear .6, bags .7, accessories .5, bottoms .4',
    1.2,
    0.8,
    0.65,
    'technical',
    'Vancouver',
    2008,
    'Weatherproof, city-proof.',
  ),
  fixed(
    16,
    'Mira Sato',
    'mid',
    'clean-girl .5, romantic .5',
    'W1',
    'dresses 1, tops .9, bottoms .6, jewelry .4',
    1.15,
    0.85,
    0.7,
    'editorial',
    'Tokyo',
    2013,
    'Effortless is a discipline.',
  ),
  fixed(
    17,
    'Lumen Athletics',
    'mid',
    'athleisure 1',
    'W1 M1 U.5',
    'activewear 1, footwear .6, bags .3, accessories .2',
    1.2,
    0.9,
    0.65,
    'technical',
    'Portland',
    2010,
    'Engineered for the everyday athlete.',
  ),
  fixed(
    18,
    'Kestrel Supply',
    'mid',
    'workwear .6, city-boy .4',
    'M1 U.8',
    'tops 1, bottoms .9, outerwear .8, accessories .4',
    1.15,
    0.65,
    0.55,
    'crisp',
    'Osaka',
    2012,
    'Made to be worn in.',
  ),
  fixed(
    19,
    'Juniper Lane',
    'mid',
    'cottagecore .5, boho .5',
    'W1',
    'dresses 1, tops .8, bottoms .5, accessories .5, bags .3',
    1.0,
    0.7,
    0.5,
    'warm',
    'Melbourne',
    2015,
    'Gathered, not grabbed.',
  ),
  fixed(
    20,
    'Ossa Studio',
    'mid',
    'avant-garde .6, minimalist .4',
    'W1 U.7',
    'dresses .8, outerwear 1, tops .8, bags .5, bottoms .5',
    1.3,
    0.5,
    0.6,
    'editorial',
    'Antwerp',
    2017,
    'Shape first.',
  ),
  fixed(
    21,
    'Brixham & Sons',
    'mid',
    'preppy .6, dark-academia .4',
    'M1 W.8',
    'tops 1, tailoring .8, footwear .6, accessories .6, outerwear .5',
    1.2,
    0.6,
    0.4,
    'crisp',
    'Edinburgh',
    1998,
    'Since the library days.',
  ),
  fixed(
    22,
    'Solstice Swim',
    'mid',
    'resort .6, coastal .4',
    'W1 M.6 K.4',
    'swimwear 1',
    1.1,
    0.6,
    0.5,
    'warm',
    'Gold Coast',
    2016,
    'Chlorine-tested, sun-approved.',
  ),
  fixed(
    23,
    'Nakamura Works',
    'mid',
    'city-boy .6, normcore .4',
    'M1 U.9 W.6',
    'footwear 1, bottoms .7, tops .6, accessories .3',
    1.25,
    0.75,
    0.6,
    'crisp',
    'Kobe',
    2005,
    'Function is the style.',
  ),
  fixed(
    24,
    'Velo Noir',
    'mid',
    'techwear .6, streetwear .4',
    'M1 U.9',
    'outerwear 1, bags .8, bottoms .7, footwear .5',
    1.3,
    0.55,
    0.65,
    'technical',
    'Berlin',
    2018,
    'Ride through the city.',
  ),
  fixed(
    25,
    'Bloom & Bramble',
    'mid',
    'romantic .5, coquette .5',
    'W1 K.4',
    'dresses 1, tops .8, jewelry .5, accessories .5',
    1.0,
    0.7,
    0.6,
    'warm',
    'Bristol',
    2014,
    'Prettiness on purpose.',
  ),
  fixed(
    26,
    'Tidewater',
    'mid',
    'western .6, workwear .4',
    'M1 W.9',
    'bottoms 1, footwear .8, outerwear .7, accessories .5, tops .5',
    1.2,
    0.55,
    0.6,
    'warm',
    'Austin',
    2011,
    'Boots first.',
  ),
  fixed(
    27,
    'Seoul Ninety',
    'mid',
    'k-street .7, y2k .3',
    'W1 M.9 U.9',
    'tops 1, bottoms .8, outerwear .8, accessories .6, bags .4',
    1.05,
    0.9,
    0.85,
    'playful',
    'Seoul',
    2019,
    'Oversized and on time.',
  ),
  fixed(
    28,
    'Cinder Athletics',
    'mid',
    'athleisure .6, gorpcore .4',
    'W1 M1',
    'activewear 1, outerwear .5, footwear .3',
    1.15,
    0.6,
    0.55,
    'technical',
    'Auckland',
    2015,
    'Warm up outside.',
  ),
  fixed(
    29,
    'Wren & Willow',
    'mid',
    'scandi .6, cottagecore .4',
    'W1 K.5',
    'tops 1, dresses .8, loungewear .7, accessories .3',
    1.1,
    0.65,
    0.5,
    'warm',
    'Stockholm',
    2012,
    'Knitted for long evenings.',
  ),
  fixed(
    30,
    'Riot Club',
    'mid',
    'punk .6, grunge .4',
    'U1 W.9 M.9',
    'tops 1, outerwear .8, footwear .7, accessories .6, jewelry .4',
    1.1,
    0.55,
    0.5,
    'playful',
    'Manchester',
    2010,
    'Wear it loud.',
  ),
  fixed(
    31,
    'Palma Dolce',
    'mid',
    'resort .5, glam .5',
    'W1',
    'dresses 1, swimwear .8, footwear .6, bags .5',
    1.2,
    0.5,
    0.55,
    'editorial',
    'Palma',
    2015,
    'Golden hour, all year.',
  ),
  fixed(
    32,
    'Loom & Ledger',
    'mid',
    'corporate-chic .6, minimalist .4',
    'W1 M1',
    'tailoring 1, tops .7, bags .4, footwear .3',
    1.3,
    0.6,
    0.5,
    'crisp',
    'Singapore',
    2016,
    'Boardroom, minus the stiffness.',
  ),
  fixed(
    33,
    'Vesper Atelier',
    'premium',
    'quiet-luxury .6, corporate-chic .4',
    'W1',
    'tailoring 1, dresses .8, outerwear .8, bags .5, tops .5',
    2.4,
    0.55,
    0.6,
    'editorial',
    'Paris',
    2007,
    'Cut close, worn long.',
  ),
  fixed(
    34,
    'Hollis Tailoring',
    'premium',
    'corporate-chic .5, dark-academia .5',
    'M1 W.6',
    'tailoring 1, tops .6, accessories .5, footwear .3',
    2.6,
    0.5,
    0.4,
    'crisp',
    'London',
    1989,
    'Measured twice.',
  ),
  fixed(
    35,
    'Sable Noir',
    'premium',
    'goth .6, avant-garde .4',
    'W1 U.6',
    'dresses 1, outerwear .8, jewelry .6, footwear .6, tops .5',
    2.2,
    0.45,
    0.55,
    'editorial',
    'Berlin',
    2011,
    'Black is a spectrum.',
  ),
  fixed(
    36,
    'Studio Ferra',
    'premium',
    'glam .6, romantic .4',
    'W1',
    'dresses 1, footwear .8, jewelry .6, bags .6',
    2.5,
    0.55,
    0.6,
    'editorial',
    'Milan',
    2009,
    'Dressed for the exit.',
  ),
  fixed(
    37,
    'Orbit Technical',
    'premium',
    'techwear .6, gorpcore .4',
    'M1 U1',
    'outerwear 1, bags .8, bottoms .7, footwear .5, accessories .3',
    2.3,
    0.5,
    0.7,
    'technical',
    'Tokyo',
    2014,
    'Systems for weather.',
  ),
  fixed(
    38,
    'Alder Street',
    'premium',
    'minimalist .6, scandi .4',
    'W1 M1 U.6',
    'footwear 1, bags .8, tops .5, outerwear .5',
    2.0,
    0.6,
    0.55,
    'crisp',
    'Copenhagen',
    2010,
    'Fewer, better, longer.',
  ),
  fixed(
    39,
    'Marigold House',
    'premium',
    'boho .6, retro-70s .4',
    'W1',
    'dresses 1, bottoms .6, accessories .6, bags .5, tops .5',
    1.9,
    0.5,
    0.5,
    'warm',
    'Los Angeles',
    2012,
    'Sunset in fabric.',
  ),
  fixed(
    40,
    'Rui Oda',
    'premium',
    'city-boy .6, minimalist .4',
    'M1 U.8',
    'tops 1, bottoms .9, outerwear .8, tailoring .4, accessories .3',
    2.4,
    0.55,
    0.65,
    'crisp',
    'Tokyo',
    2003,
    'Relaxed precision.',
  ),
  fixed(
    41,
    'Étoile Enfant',
    'premium',
    'kidcore .5, preppy .5',
    'K1',
    'tops 1, bottoms .9, dresses .7, outerwear .7, footwear .5, accessories .3',
    1.8,
    0.4,
    0.45,
    'warm',
    'Lyon',
    2008,
    'Small clothes, grown-up cloth.',
  ),
  fixed(
    42,
    'Gaia Loom',
    'premium',
    'cottagecore .5, scandi .5',
    'W1 U.4',
    'tops 1, dresses .7, loungewear .6, accessories .5',
    1.9,
    0.45,
    0.5,
    'warm',
    'Helsinki',
    2013,
    'Woven slowly.',
  ),
  fixed(
    43,
    'Kilo Nine',
    'premium',
    'streetwear .6, k-street .4',
    'U1 M1 W.9',
    'footwear 1, tops .8, outerwear .7, bags .5, accessories .4',
    2.2,
    0.75,
    0.85,
    'playful',
    'Seoul',
    2015,
    'Drops, not seasons.',
  ),
  fixed(
    44,
    'Cassia Fine',
    'premium',
    'clean-girl .5, coquette .5',
    'W1',
    'jewelry 1, accessories .2',
    2.0,
    0.6,
    0.6,
    'editorial',
    'Taipei',
    2016,
    'Gold you forget to take off.',
  ),
  fixed(
    45,
    'Maison Élodie',
    'luxury',
    'quiet-luxury .6, romantic .4',
    'W1',
    'bags 1, dresses .7, outerwear .7, footwear .6, jewelry .5, accessories .4',
    8.0,
    0.5,
    0.55,
    'editorial',
    'Paris',
    1962,
    'Heritage, quietly.',
  ),
  fixed(
    46,
    'Castelmora',
    'luxury',
    'glam .6, mob-wife .4',
    'W1 M.5',
    'bags 1, footwear .8, outerwear .7, jewelry .6, accessories .6, dresses .5',
    9.0,
    0.55,
    0.65,
    'editorial',
    'Rome',
    1971,
    'Never understated.',
  ),
  fixed(
    47,
    'Aurelio Benedetti',
    'luxury',
    'corporate-chic .5, quiet-luxury .5',
    'M1 W.6',
    'tailoring 1, footwear .8, outerwear .7, accessories .5, tops .4',
    7.0,
    0.4,
    0.4,
    'crisp',
    'Florence',
    1958,
    'The suit is the argument.',
  ),
  fixed(
    48,
    'Kōri',
    'luxury',
    'avant-garde .7, techwear .3',
    'U1 W.9 M.8',
    'outerwear 1, dresses .6, footwear .6, bags .6, tops .5, bottoms .5',
    6.0,
    0.35,
    0.7,
    'editorial',
    'Tokyo',
    1994,
    'Garments as questions.',
  ),
  fixed(
    49,
    'Verrine',
    'luxury',
    'coquette .5, glam .5',
    'W1',
    'jewelry 1, bags .7, dresses .5, footwear .5, accessories .4',
    10.0,
    0.45,
    0.6,
    'editorial',
    'Geneva',
    1985,
    'Precious, playful.',
  ),
  fixed(
    50,
    'Holm & Vatne',
    'luxury',
    'scandi .6, minimalist .4',
    'W1 M1 U.7',
    'outerwear 1, bags .7, footwear .6, tops .5, accessories .4',
    5.0,
    0.35,
    0.5,
    'crisp',
    'Oslo',
    2001,
    'Warmth without weight.',
  ),
]

/** Generalists take weight .15 in every group and department they do not list (§4.2). */
export const GENERALIST_IDS: readonly number[] = [1, 4, 13]

// ---------------------------------------------------------------------------
// §4.3 roster 51–150: `id name · tier · home aesthetics · departments`
// ---------------------------------------------------------------------------

const ROSTER_TEXT = `51 Basic Fold ·b· normcore,scandi ·WMU
52 Daily Port Kids ·b· kidcore ·K
53 Metro Supply ·b· streetwear ·MU
54 Plain Goods ·b· minimalist ·WMU
55 Urban Swim ·b· resort ·WMK
56 Studio Lane ·b· clean-girl ·W
57 Prime Sport ·b· athleisure ·MU
58 Northline Wear ·b· gorpcore,normcore ·MU
59 Common Thread ·b· cottagecore ·W
60 Dock & Yard ·b· workwear ·M
61 Loft Basics ·b· k-street ·WU
62 Tram Label ·b· y2k ·W
63 Field Kids ·b· kidcore,preppy ·K
64 Simple Swim ·b· coastal ·W
65 Metro Lounge ·b· normcore ·WM
66 Plain Jewels ·b· clean-girl ·W
67 Yard Active ·b· athleisure ·WK
68 Port Basics ·b· coastal,normcore ·WMU
69 Ash & Fen ·m· scandi,minimalist ·WMU
70 Cedar Works ·m· workwear,western ·M
71 Hearth Studio ·m· cottagecore ·WK
72 Kiln Collective ·m· avant-garde ·U
73 Linden Atelier ·m· romantic ·W
74 Loam Supply ·m· gorpcore ·MU
75 Marsh & Moss ·m· boho ·W
76 Oriel House ·m· dark-academia,preppy ·WM
77 Pike Tailors ·m· corporate-chic ·M
78 Quay Swim ·m· coastal,resort ·WM
79 Reed Active ·m· athleisure ·W
80 Sable Studio ·m· goth ·WU
81 Selby & Slate ·m· minimalist,city-boy ·MU
82 Sorrel Kids ·m· kidcore ·K
83 Tarn Works ·m· techwear ·MU
84 Thistle Collective ·m· punk,grunge ·U
85 Vale Atelier ·m· quiet-luxury ·W
86 Wold Supply ·m· western ·MW
87 Birch & Elm ·m· scandi ·WMK
88 Harbor Studio ·m· coastal ·WM
89 Moss Active ·m· athleisure,gorpcore ·MU
90 Fen House ·m· romantic,coquette ·W
91 Ash Tailors ·m· corporate-chic ·WM
92 Slate Works ·m· streetwear ·MU
93 Kiln Kids ·m· kidcore,scandi ·K
94 Oriel Swim ·m· resort ·W
95 Reed & Thistle ·m· cottagecore,boho ·W
96 Quay Collective ·m· k-street ·WMU
97 Pike Supply ·m· workwear ·MU
98 Linden Lounge ·m· clean-girl ·WM
99 Sorrel Studio ·m· balletcore ·W
100 Cedar Jewels ·m· boho,romantic ·W
101 Marsh Tailors ·m· dark-academia ·M
102 Tarn & Vale ·m· minimalist ·WMU
103 Elm Active ·m· athleisure ·WK
104 Hearth Lounge ·m· scandi ·WMU
105 Loam Kids ·m· kidcore,gorpcore ·K
106 Selby House ·m· preppy ·WM
107 Birch Works ·m· normcore ·MU
108 Wold Studio ·m· retro-70s ·W
109 Harbor Jewels ·m· coastal,clean-girl ·W
110 Moss & Fen ·m· cottagecore ·W
111 Slate Atelier ·m· avant-garde,goth ·WU
112 Thistle Swim ·m· resort,glam ·W
113 Quay Works ·m· city-boy ·M
114 Ash Collective ·m· k-street,y2k ·WU
115 Kiln Active ·m· athleisure ·M
116 Vale Kids ·m· preppy,kidcore ·K
117 Sorrel & Reed ·m· balletcore,romantic ·W
118 Pike House ·m· western ·M
119 Ines Vance ·p· quiet-luxury ·W
120 Noor Okafor ·p· avant-garde ·WU
121 Teo Lindqvist ·p· scandi,minimalist ·MU
122 Yara Amsel ·p· romantic ·W
123 Hiro Tanaka ·p· city-boy ·M
124 Lior Marchetti ·p· corporate-chic ·M
125 Anouk Duval ·p· coquette,balletcore ·W
126 Sanne Reyes ·p· glam ·W
127 Rafael Bergman ·p· dark-academia ·MW
128 Mai Kwon ·p· k-street ·WU
129 Sofia Ferreira ·p· boho,resort ·W
130 Emil Halloran ·p· workwear,western ·M
131 Vance Atelier ·p· minimalist ·WM
132 Okafor Studio ·p· streetwear ·MU
133 Lindqvist Active ·p· athleisure,gorpcore ·WM
134 Amsel Jewels ·p· glam,mob-wife ·W
135 Tanaka Works ·p· techwear ·MU
136 Marchetti Tailors ·p· corporate-chic,quiet-luxury ·M
137 Duval Kids ·p· kidcore ·K
138 Reyes Swim ·p· resort ·W
139 Bergman House ·p· scandi ·WMU
140 Kwon Collective ·p· punk,goth ·U
141 Vauclair ·l· quiet-luxury ·WM
142 Ormond ·l· corporate-chic ·M
143 Serrano ·l· glam ·W
144 Lorenzetti ·l· mob-wife,glam ·W
145 Maison Aubrac ·l· romantic,coquette ·W
146 Castiglia ·l· quiet-luxury,minimalist ·WMU
147 Hessling ·l· avant-garde ·U
148 Marquand ·l· dark-academia,corporate-chic ·M
149 Ravel ·l· minimalist,scandi ·WU
150 Solenne ·l· resort,coastal ·W`

export interface RosterRow {
  id: number
  name: string
  tier: BrandTier
  homeAesthetics: readonly string[]
  /** Department letters in listed order (W/M/U/K). */
  departments: readonly Department[]
}

const TIER_LETTER: Readonly<Record<string, BrandTier>> = {
  b: 'budget',
  m: 'mid',
  p: 'premium',
  l: 'luxury',
}
const DEPT_LETTER: Readonly<Record<string, Department>> = {
  W: 'women',
  M: 'men',
  U: 'unisex',
  K: 'kids',
}

export const ROSTER: readonly RosterRow[] = ROSTER_TEXT.split('\n').map((line) => {
  const m = /^(\d+) (.+?) ·([bmpl])· ([a-z0-9,-]+) ·([WMUK]+)$/.exec(line.trim())
  if (!m) throw new Error(`@lookline/catalog: bad roster line "${line}"`)
  return {
    id: Number(m[1]),
    name: m[2]!,
    tier: TIER_LETTER[m[3]!]!,
    homeAesthetics: m[4]!.split(','),
    departments: m[5]!.split('').map((ch) => DEPT_LETTER[ch]!),
  }
})

// ---------------------------------------------------------------------------
// Parsing helpers for the compact spec columns
// ---------------------------------------------------------------------------

function parseHome(text: string): { slugs: string[]; weights: number[] } {
  const slugs: string[] = []
  const weights: number[] = []
  for (const part of text.split(/,\s*/)) {
    const [slug, w] = part.trim().split(/\s+/)
    slugs.push(slug!)
    weights.push(Number(w ?? '1'))
  }
  return { slugs, weights }
}

function parseDepts(text: string): Partial<Record<Department, number>> {
  const out: Partial<Record<Department, number>> = {}
  for (const token of text.split(/\s+/)) {
    const dept = DEPT_LETTER[token[0]!]
    if (dept) out[dept] = Number(token.slice(1))
  }
  return out
}

function parseGroups(text: string): Partial<Record<CategoryGroup, number>> {
  const out: Partial<Record<CategoryGroup, number>> = {}
  for (const part of text.split(/,\s*/)) {
    const [group, w] = part.trim().split(/\s+/)
    out[group as CategoryGroup] = Number(w)
  }
  return out
}

const ALL_DEPARTMENTS: readonly Department[] = ['women', 'men', 'unisex', 'kids']
const ALL_GROUPS: readonly CategoryGroup[] = [
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

const round2 = (x: number): number => Math.round(x * 100) / 100
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

function favouredGroupsOf(slug: string): readonly CategoryGroup[] {
  return AESTHETICS.find((a) => a.slug === slug)?.favours.categoryGroups ?? []
}

/** Roster group weights (§4.3): 1 for groups of the first home aesthetic, .5 for the second, .3 accessories; suffix overrides. */
function rosterGroupWeights(row: RosterRow): Partial<Record<CategoryGroup, number>> {
  const suffix = row.name.split(' ').at(-1)
  switch (suffix) {
    case 'Swim':
      return { swimwear: 1, accessories: 0.3 }
    case 'Active':
      return { activewear: 1, footwear: 0.4 }
    case 'Jewels':
      return { jewelry: 1, accessories: 0.3 }
    case 'Tailors':
      return { tailoring: 1, tops: 0.4 }
    case 'Lounge':
      return { loungewear: 1, tops: 0.3 }
    default:
      break
  }
  const out: Partial<Record<CategoryGroup, number>> = {}
  for (const g of favouredGroupsOf(row.homeAesthetics[0]!)) out[g] = 1
  if (row.homeAesthetics[1]) {
    for (const g of favouredGroupsOf(row.homeAesthetics[1])) out[g] = Math.max(out[g] ?? 0, 0.5)
  }
  out.accessories = Math.max(out.accessories ?? 0, 0.3)
  return out
}

function fixedBrand(row: FixedRow): Omit<BrandRecord, 'size'> {
  const home = parseHome(row.home)
  const departmentWeights = parseDepts(row.depts)
  const groupWeights = parseGroups(row.groups)
  const generalist = GENERALIST_IDS.includes(row.id)
  if (generalist) {
    for (const d of ALL_DEPARTMENTS) departmentWeights[d] ??= 0.15
    for (const g of ALL_GROUPS) groupWeights[g] ??= 0.15
  }
  return {
    id: row.id,
    slug: slugifyBrand(row.name),
    name: row.name,
    tier: row.tier,
    homeAesthetics: home.slugs,
    homeWeights: home.weights,
    homeDepartments: ALL_DEPARTMENTS.filter((d) => (departmentWeights[d] ?? 0) > 0),
    departmentWeights,
    groupWeights,
    priceMultiplier: row.price,
    popularity: row.pop,
    trend: row.trend,
    voice: row.voice,
    origin: row.origin,
    founded: row.founded,
    description: row.tagline,
    generalist,
  }
}

function rosterBrand(row: RosterRow, seed: number): Omit<BrandRecord, 'size'> {
  const rng = createRng(hashSeed(seed, 'brand', row.id))
  const [lo, hi] = TIER_PRICE_BAND[row.tier]
  const priceMultiplier = round2(rng.float(lo, hi))
  const popularity = round2(clamp(rng.normal(0.55, 0.15), 0.2, 0.95))
  const trend = round2(rng.float(0.3, 0.9))
  const voice = rng.weighted(VOICE_PRIOR[row.tier])
  const primary = row.homeAesthetics[0]!
  const origin = rng.pick(CITIES[primary] ?? ['Taipei'])
  const founded = rng.int(1975, 2022)
  const description = rng.pick(TAGLINES[voice])

  const departmentWeights: Partial<Record<Department, number>> = {}
  row.departments.forEach((d, i) => {
    departmentWeights[d] = i === 0 ? 1 : 0.8
  })
  const suffix = row.name.split(' ').at(-1)
  if (suffix === 'Kids') {
    for (const d of Object.keys(departmentWeights) as Department[]) {
      if (d !== 'kids') delete departmentWeights[d]
    }
    departmentWeights.kids = 1
  }

  return {
    id: row.id,
    slug: slugifyBrand(row.name),
    name: row.name,
    tier: row.tier,
    homeAesthetics: [...row.homeAesthetics],
    homeWeights: row.homeAesthetics.length === 2 ? [0.6, 0.4] : [1],
    homeDepartments: ALL_DEPARTMENTS.filter((d) => (departmentWeights[d] ?? 0) > 0),
    departmentWeights,
    groupWeights: rosterGroupWeights(row),
    priceMultiplier,
    popularity,
    trend,
    voice,
    origin,
    founded,
    description,
    generalist: false,
  }
}

/**
 * Brand sizes (§4.1): `tierShare × zipf(rankWithinTier, s = 0.8)` normalised within tier, then
 * clamped to [0.12 %, 1.5 %] and renormalised so the 150 shares sum to 1. Returns shares keyed by
 * brand id.
 */
export function brandSizes(
  seed: number,
  brands: ReadonlyArray<Pick<GeneratedBrand, 'id' | 'tier'>>,
): Map<number, number> {
  const sizes = new Map<number, number>()
  for (const tier of Object.keys(TIER_SHARE) as BrandTier[]) {
    const ids = brands.filter((b) => b.tier === tier).map((b) => b.id)
    if (ids.length === 0) continue
    const order = createRng(hashSeed(seed, 'brand-rank', tier)).shuffle(ids)
    const z = order.map((_, i) => Math.pow(i + 1, -0.8))
    const total = z.reduce((a, b) => a + b, 0)
    order.forEach((id, i) => sizes.set(id, (TIER_SHARE[tier] * z[i]!) / total))
  }
  // Clamp and renormalise: iterate until every share sits in range and the total is 1.
  const fixedIds = new Set<number>()
  for (let iter = 0; iter < 50; iter++) {
    let fixedSum = 0
    let freeSum = 0
    for (const [id, v] of sizes) {
      if (fixedIds.has(id)) fixedSum += v
      else freeSum += v
    }
    const scale = freeSum > 0 ? (1 - fixedSum) / freeSum : 0
    let changed = false
    for (const [id, v] of sizes) {
      if (fixedIds.has(id)) continue
      const scaled = v * scale
      const clamped = clamp(scaled, BRAND_SIZE_MIN, BRAND_SIZE_MAX)
      sizes.set(id, clamped)
      if (clamped !== scaled) {
        fixedIds.add(id)
        changed = true
      }
    }
    if (!changed) break
  }
  return sizes
}

/** 150 fictional brands (CATALOG_SPEC §4). Deterministic for a seed; ids 1..150; unique slugs. */
export function generateBrands(seed: number): BrandRecord[] {
  const partial: Array<Omit<BrandRecord, 'size'>> = [
    ...FIXED_BRANDS.map(fixedBrand),
    ...ROSTER.map((row) => rosterBrand(row, seed)),
  ]
  const sizes = brandSizes(seed, partial)
  return partial.map((b) => ({ ...b, size: sizes.get(b.id) ?? BRAND_SIZE_MIN }))
}
