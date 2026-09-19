/**
 * Columns the recommender needs that `articles.csv` has no field for. Each one is a rule over
 * columns the dataset does ship — nothing here invents data the file does not support.
 */
import type { CategoryGroup } from '@lookline/db'
import type { OutfitRole } from './taxonomy'

export type SizeSystem = 'alpha' | 'numeric-waist' | 'eu-shoe' | 'one-size'

/**
 * Which size chart an article is sold on, decided by the slot it occupies.
 *
 * ponytail: the dataset carries no size column at all, so `sizes` stays empty and only the system
 * is derived. `index_name` ("Children Sizes 92-140") is the one place real sizes hide — parse it
 * when a size filter actually needs to work.
 */
export function sizeSystemFor(role: OutfitRole): SizeSystem {
  if (role === 'shoes') return 'eu-shoe'
  if (role === 'bag' || role === 'jewelry' || role === 'accessory' || role === 'socks') {
    return 'one-size'
  }
  return 'alpha'
}

/** `strap-top-0108775015` — readable, and unique because the article id is. */
export function slugFor(prodName: string, articleId: string): string {
  const base = prodName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || 'article'}-${articleId}`
}

/**
 * The intent parser's vocabulary (12 groups, each with a Chinese label) as opposed to the outfit
 * role (where a garment sits). "運動服" and "西裝" only reach the catalogue through this column,
 * and H&M files both under groups that name the body part instead: sportswear lives in
 * `index_group_name`, tailoring in `product_type_name`.
 *
 * Sport only overrides the upper-body and lower-body roles — a running shoe is still footwear, or
 * an outfit could never be given shoes.
 */
const TAILORING_TYPES = new Set(['Blazer', 'Tailored Waistcoat'])

const ROLE_GROUPS: Record<Exclude<OutfitRole, 'non-apparel'>, CategoryGroup> = {
  top: 'tops',
  bottom: 'bottoms',
  'full-body': 'dresses',
  set: 'dresses',
  outer: 'outerwear',
  shoes: 'footwear',
  bag: 'bags',
  accessory: 'accessories',
  socks: 'accessories',
  jewelry: 'jewelry',
  underwear: 'loungewear',
  nightwear: 'loungewear',
  swimwear: 'swimwear',
}

/** `null` for the 322 non-apparel rows, which never enter the catalogue. */
export function categoryGroupFor(
  role: OutfitRole,
  indexGroup: string,
  productType: string,
): CategoryGroup | null {
  if (role === 'non-apparel') return null
  if (TAILORING_TYPES.has(productType)) return 'tailoring'
  if (indexGroup === 'Sport' && (role === 'top' || role === 'bottom' || role === 'full-body')) {
    return 'activewear'
  }
  return ROLE_GROUPS[role]
}

/**
 * H&M's `price` column is normalised to an undisclosed unit, and the transaction file it comes
 * from is 31.8M rows processed offline — so until that aggregate exists, a budget like "3,000 元"
 * has nothing to filter on.
 *
 * ponytail: a band per category group, taken from what H&M Taiwan actually charges, with the
 * article id choosing a step inside it. Stable across imports and right on the relative ordering
 * (a coat costs more than a tee), which is what a budget constraint needs. Replace with the
 * per-product-type quantiles of the real transaction prices once those are aggregated.
 */
const PRICE_BANDS: Record<CategoryGroup, readonly [number, number]> = {
  tops: [299, 799],
  bottoms: [499, 1299],
  dresses: [599, 1499],
  outerwear: [999, 2999],
  footwear: [799, 1999],
  bags: [399, 1299],
  accessories: [99, 499],
  jewelry: [199, 699],
  activewear: [399, 999],
  swimwear: [399, 899],
  loungewear: [199, 699],
  tailoring: [1299, 2999],
}

export function placeholderPrice(categoryGroup: CategoryGroup, articleId: string): number {
  const [min, max] = PRICE_BANDS[categoryGroup]
  const steps = Math.floor((max - min) / 100)
  return min + (Number(articleId) % (steps + 1)) * 100
}

/** Price tier, so the brand-tier factors keep working on a catalogue with one brand. */
export function tierFor(price: number): 'budget' | 'mid' | 'premium' | 'luxury' {
  if (price < 500) return 'budget'
  if (price < 1200) return 'mid'
  if (price < 2500) return 'premium'
  return 'luxury'
}
