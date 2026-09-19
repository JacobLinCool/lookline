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
