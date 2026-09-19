/**
 * Columns the recommender needs that `articles.csv` has no field for. Each one is a rule over
 * columns the dataset does ship — nothing here invents data the file does not support.
 */
import type { CategoryGroup } from '@lookline/db'
import type { OutfitRole } from './taxonomy'

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
/**
 * H&M's `price` column is normalised to an undisclosed unit, and the figures it produces read an
 * order of magnitude below what H&M Taiwan actually charges — a tee at NT$99, a coat at NT$574.
 * Everything downstream is relative, so one factor applied at the source keeps the catalogue's
 * shape and only moves the numbers: the tier thresholds and the style vector's price axis scale
 * with it, and a budget an intent names in TWD finally means the same thing to both sides.
 */
export const PRICE_SCALE = 5

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
  return (min + (Number(articleId) % (steps + 1)) * 100) * PRICE_SCALE
}

/** Price tier, so the brand-tier factors keep working on a catalogue with one brand. */
export function tierFor(price: number): 'budget' | 'mid' | 'premium' | 'luxury' {
  if (price < 500 * PRICE_SCALE) return 'budget'
  if (price < 1200 * PRICE_SCALE) return 'mid'
  if (price < 2500 * PRICE_SCALE) return 'premium'
  return 'luxury'
}

/**
 * A product name fit to print. H&M's are merchandising strings: `Tilly (1)` is the second cut of
 * a style, `RICHIE HOOD` is shouted, `Henry polo.` has a stray full stop. 17 417 of the 104 780
 * carry at least one of those.
 *
 * What it does not touch is as important. A bracket holding a word is a print or a colour —
 * `Fiona Ch Hipster(Poppy)4pk` keeps its Poppy — and a word of two letters or fewer inside an
 * all-caps name is a code rather than a word, so `SWEATSHIRT OC` becomes `Sweatshirt OC` and not
 * `Sweatshirt Oc`. Trailing codes like `LATE`, `TVP` and `TRS` are left alone entirely: some are
 * internal and some are the garment (`TEE`, `HOOD`, `DRESS`), and telling them apart needs a
 * table someone has to write by hand.
 *
 * `prod_name` keeps H&M's string verbatim; this is the derived one, beside it.
 */
export function displayNameFor(prodName: string): string {
  let s = prodName.replace(/\s*\((\d+|[A-Za-z])\)\s*/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/\.$/, '').trim()
  if (s && s === s.toUpperCase() && /\p{L}/u.test(s)) {
    s = s
      .split(' ')
      .map((w) => (w.length <= 2 || !/^\p{L}+$/u.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
      .join(' ')
  }
  return s || prodName
}
