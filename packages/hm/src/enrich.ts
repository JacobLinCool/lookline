/**
 * Two columns recovered from data H&M does ship, so they stop being empty.
 *
 * `section_name` is H&M's own shelf (56 of them) and carries the occasion the buyer had in mind:
 * `Womens Tailoring` and `Men Suits & Tailoring` are formalwear, `Ladies H&M Sport` is a gym, and
 * `Womens Nightwear, Socks & Tights` is not something to build a wedding outfit from. That last
 * one is why a pair of tights was landing in a wedding look: `product_group_name` files them under
 * the lower body like any pair of trousers, and only the shelf knows better.
 *
 * `detail_desc` names the fabric in 80% of rows ("Jersey top in soft cotton with…"), which is the
 * only place material appears at all.
 */

import { PRICE_SCALE } from './derive'

/** Occasions the intent parser can ask for; seasons live in the same taxonomy but not here. */
export type Occasion =
  | 'everyday'
  | 'work'
  | 'formal'
  | 'wedding-guest'
  | 'date-night'
  | 'party'
  | 'brunch'
  | 'festival'
  | 'travel'
  | 'beach'
  | 'lounge'
  | 'workout'

interface SectionMeaning {
  occasions: readonly Occasion[]
  /** 0 = you would not leave the house in it, 1 = black tie. Feeds the style vector's formality. */
  formality: number
}

/** Every `section_name` in the file. Anything unlisted falls back to everyday wear. */
const SECTIONS: Record<string, SectionMeaning> = {
  // Formalwear — the only shelves that answer "正式場合"
  'Womens Tailoring': { occasions: ['work', 'formal', 'wedding-guest'], formality: 0.9 },
  'Men Suits & Tailoring': { occasions: ['work', 'formal', 'wedding-guest'], formality: 0.92 },
  'Contemporary Smart': { occasions: ['work', 'formal', 'brunch'], formality: 0.75 },
  'Men Edition': { occasions: ['work', 'formal'], formality: 0.8 },
  'Womens Premium': { occasions: ['formal', 'date-night', 'wedding-guest'], formality: 0.8 },
  // Going out
  'Womens Trend': { occasions: ['party', 'date-night'], formality: 0.55 },
  'Divided Selected': { occasions: ['party', 'date-night'], formality: 0.5 },
  'Divided Projects': { occasions: ['festival', 'party'], formality: 0.4 },
  'Special Collections': { occasions: ['party', 'date-night'], formality: 0.6 },
  Collaborations: { occasions: ['party', 'festival'], formality: 0.55 },
  'Contemporary Street': { occasions: ['everyday', 'festival'], formality: 0.35 },
  // Everyday
  'Womens Everyday Collection': { occasions: ['everyday'], formality: 0.4 },
  'Womens Everyday Basics': { occasions: ['everyday'], formality: 0.3 },
  'Womens Casual': { occasions: ['everyday', 'brunch'], formality: 0.35 },
  'Contemporary Casual': { occasions: ['everyday', 'brunch'], formality: 0.4 },
  'Divided Collection': { occasions: ['everyday', 'party'], formality: 0.35 },
  'Divided Basics': { occasions: ['everyday'], formality: 0.3 },
  'Ladies Denim': { occasions: ['everyday', 'brunch'], formality: 0.35 },
  'Denim Men': { occasions: ['everyday', 'brunch'], formality: 0.35 },
  'H&M+': { occasions: ['everyday'], formality: 0.4 },
  Mama: { occasions: ['everyday'], formality: 0.35 },
  'Womens Jackets': { occasions: ['everyday', 'work'], formality: 0.55 },
  'Mens Outerwear': { occasions: ['everyday', 'work'], formality: 0.55 },
  // Accessories and shoes take the occasion of whatever they are worn with
  'Womens Small accessories': { occasions: ['everyday'], formality: 0.45 },
  'Womens Big accessories': { occasions: ['everyday', 'travel'], formality: 0.45 },
  'Divided Accessories': { occasions: ['everyday'], formality: 0.35 },
  'Men Accessories': { occasions: ['everyday'], formality: 0.45 },
  'Womens Shoes': { occasions: ['everyday'], formality: 0.45 },
  'Men Shoes': { occasions: ['everyday'], formality: 0.45 },
  // Sport
  'Ladies H&M Sport': { occasions: ['workout'], formality: 0.15 },
  'Men H&M Sport': { occasions: ['workout'], formality: 0.15 },
  'Kids Sports': { occasions: ['workout'], formality: 0.15 },
  // Beach
  'Womens Swimwear, beachwear': { occasions: ['beach'], formality: 0.1 },
  // Underwear and nightwear — never part of an outfit
  'Womens Lingerie': { occasions: ['lounge'], formality: 0.05 },
  'Men Underwear': { occasions: ['lounge'], formality: 0.05 },
  'Girls Underwear & Basics': { occasions: ['lounge'], formality: 0.05 },
  'Boys Underwear & Basics': { occasions: ['lounge'], formality: 0.05 },
  'Womens Nightwear, Socks & Tigh': { occasions: ['lounge'], formality: 0.1 },
}

const DEFAULT_SECTION: SectionMeaning = { occasions: ['everyday'], formality: 0.35 }

export function sectionMeaning(sectionName: string): SectionMeaning {
  return SECTIONS[sectionName] ?? DEFAULT_SECTION
}

/**
 * Fabrics named in `detail_desc`, most specific first — cashmere before wool, so "cashmere-blend
 * wool" reads as cashmere. Returns the first hit; the description names one fabric as the subject
 * and the rest as a blend.
 */
const MATERIALS: ReadonlyArray<readonly [string, RegExp]> = [
  ['cashmere', /cashmere/],
  ['silk', /\bsilk\b/],
  ['linen', /\blinen\b/],
  ['leather', /leather/],
  ['denim', /denim/],
  ['wool', /\bwool|merino/],
  ['corduroy', /corduroy/],
  ['velvet', /velvet/],
  ['satin', /satin/],
  ['fleece', /fleece/],
  ['lace', /\blace\b/],
  ['jersey', /jersey/],
  ['cotton', /cotton/],
  ['viscose', /viscose|lyocell|modal|rayon/],
  ['polyester', /polyester|nylon|polyamide/],
]

/** `''` when the description names no fabric, which is ~20% of rows. */
export function materialFrom(detailDesc: string | null): string {
  if (!detailDesc) return ''
  const text = detailDesc.toLowerCase()
  for (const [slug, pattern] of MATERIALS) if (pattern.test(text)) return slug
  return ''
}

/**
 * Garment details named in `detail_desc`. Coverage is partial — a description mentions a neckline
 * on about 20% of rows — but a stated detail is a fact about the garment, and the ranking already
 * reads these columns.
 */
const NECKLINES: ReadonlyArray<readonly [string, RegExp]> = [
  ['v-neck', /v-neck|v neckline/],
  ['turtleneck', /turtleneck|polo neck|funnel neck/],
  ['collared', /\bcollar\b|collared/],
  ['hooded', /\bhood\b|hooded/],
  ['crew', /round neck|crew neck|round neckline/],
  ['scoop', /scoop neck|low-cut neckline/],
  ['square', /square neckline/],
  ['off-shoulder', /off-the-shoulder|off shoulder/],
  ['halter', /halterneck|halter neck/],
]

const SLEEVES: ReadonlyArray<readonly [string, RegExp]> = [
  ['sleeveless', /sleeveless|shoulder straps|strappy/],
  ['long', /long sleeves|long-sleeved/],
  ['short', /short sleeves|short-sleeved/],
  ['three-quarter', /3\/4 sleeves|three-quarter sleeves/],
  ['puff', /puff sleeves|balloon sleeves/],
]

const FITS: ReadonlyArray<readonly [string, RegExp]> = [
  ['oversized', /oversized|relaxed fit|loose fit/],
  ['slim', /slim fit|skinny|fitted/],
  ['regular', /regular fit|straight fit/],
]

const LENGTHS: ReadonlyArray<readonly [string, RegExp]> = [
  ['cropped', /cropped|crop top/],
  ['ankle', /ankle-length/],
  ['knee', /knee-length|above the knee/],
  ['midi', /calf-length|midi/],
  ['maxi', /ankle length|floor-length|maxi/],
]

const first = (text: string, table: ReadonlyArray<readonly [string, RegExp]>): string => {
  for (const [slug, pattern] of table) if (pattern.test(text)) return slug
  return ''
}

export interface GarmentDetails {
  neckline: string
  sleeve: string
  fit: string
  length: string
  /** Practical features a shopper filters on; the only use of `attributes` on an article. */
  attributes: Record<string, boolean>
}

export function garmentDetails(detailDesc: string | null): GarmentDetails {
  if (!detailDesc) return { neckline: '', sleeve: '', fit: '', length: '', attributes: {} }
  const text = detailDesc.toLowerCase()
  const attributes: Record<string, boolean> = {}
  if (/pockets?\b/.test(text)) attributes.pockets = true
  if (/\bhood\b|hooded/.test(text)) attributes.hood = true
  if (/\bzip\b|zipper/.test(text)) attributes.zip = true
  if (/elasticated waist|elastic waist|drawstring/.test(text)) attributes.elasticWaist = true
  if (/lined\b|lining/.test(text)) attributes.lined = true
  return {
    neckline: first(text, NECKLINES),
    sleeve: first(text, SLEEVES),
    fit: first(text, FITS),
    length: first(text, LENGTHS),
    attributes,
  }
}

/**
 * H&M's 20 `perceived_colour_master_name` values mapped onto the 12 colour families the style
 * vector and the intent parser share. `Khaki green` and `Bluish Green` are greens; `Metal` is the
 * metallic family; `Mole` is a grey-brown that reads as a neutral. `Unknown` and `undefined` have
 * no colour to map.
 */
const COLOUR_FAMILIES: Record<string, string> = {
  Black: 'black',
  White: 'white',
  Grey: 'grey',
  Beige: 'neutral',
  Mole: 'neutral',
  Brown: 'brown',
  Red: 'red',
  Pink: 'pink',
  Yellow: 'yellow-orange',
  Orange: 'yellow-orange',
  Green: 'green',
  'Khaki green': 'green',
  'Yellowish Green': 'green',
  'Bluish Green': 'green',
  Blue: 'blue',
  Turquoise: 'blue',
  'Lilac Purple': 'purple',
  Metal: 'multi-metallic',
}

/** `''` for the 790 rows whose colour is Unknown or undefined. */
/**
 * `perceived_colour_master_name` is blank on 789 articles, and those rows ended up with an
 * all-zero colour block: invisible to every colour swatch on the shop and to colour similarity.
 * H&M did record a colour for 657 of them, one column over in `colour_group_name`, which is the
 * finer name `COLOUR_HEX` already reads to pick a swatch.
 *
 * `Other` is not a colour and neither is a blank; those 132 stay empty, because a filter that
 * matches nothing is better than one that matches the wrong thing.
 */
const GROUP_FAMILIES: Record<string, string> = {
  Black: 'black',
  White: 'white',
  'Off White': 'white',
  Grey: 'grey',
  'Dark Grey': 'grey',
  'Light Grey': 'grey',
  'Dark Blue': 'blue',
}

export function colorFamilyOf(perceivedColourMaster: string, colourGroupName = ''): string {
  return COLOUR_FAMILIES[perceivedColourMaster] ?? GROUP_FAMILIES[colourGroupName] ?? ''
}

/**
 * The style-space axes, derived from what the dataset does say.
 *
 * `aesthetics` stays empty — nothing in the file names a style, and guessing one is exactly the
 * semantic pass this import does not do. The remaining axes are evidence: the shelf sets
 * formality, the fabric and the selling season set warmth, the price sets the tier, and how
 * recently an article still sold sets trendiness.
 */
export function styleAxes(input: {
  formality: number
  material: string
  seasons: readonly string[]
  price: number
  trendScore: number
}): Record<string, number> {
  const warmFabric = /wool|cashmere|fleece|corduroy|velvet/.test(input.material) ? 0.8 : 0.4
  const coolFabric = /linen|silk|lace/.test(input.material) ? 0.15 : warmFabric
  const winter = input.seasons.includes('winter') || input.seasons.includes('autumn')
  const summer = input.seasons.includes('summer')
  return {
    formality: input.formality,
    warmth: winter ? Math.max(0.65, coolFabric) : summer ? Math.min(0.3, coolFabric) : coolFabric,
    // H&M prices span NT$40 to NT$44 850 once `PRICE_SCALE` is applied; log scale, because the
    // mass still sits in the bottom fifth of that.
    'price-tier': Math.min(1, Math.log1p(input.price) / Math.log1p(9000 * PRICE_SCALE)),
    trendiness: input.trendScore,
    structure: input.formality * 0.8,
  }
}
