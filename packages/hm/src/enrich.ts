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
