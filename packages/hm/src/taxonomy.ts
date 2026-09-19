/**
 * Lookup tables over the raw H&M `articles.csv` values. Every mapping here is a table lookup on a
 * column the dataset already ships — nothing is inferred by a model. Counts in the comments are
 * from the 105 542-row file and are what the tests assert against.
 *
 * H&M built this catalogue for its own merchandising, not for outfit building, so two columns need
 * combining: `product_group_name` says which part of the body an item covers, and for the upper
 * body only, `product_type_name` separates a layer you wear over another from the one underneath.
 */

/**
 * Which slot of an outfit an item occupies. `set` is already a whole outfit; `non-apparel` is not
 * clothing. A position, not a use: a running top is a `top` and a blazer is `outer`, so sportswear
 * and tailoring are read off `index_group_name` and `product_type_name` instead of a role.
 */
export type OutfitRole =
  | 'top'
  | 'bottom'
  | 'outer'
  | 'full-body'
  | 'set'
  | 'shoes'
  | 'bag'
  | 'accessory'
  | 'jewelry'
  | 'underwear'
  | 'nightwear'
  | 'swimwear'
  | 'socks'
  | 'non-apparel'

/** Roles a look is assembled from. The rest are sold, but never styled into an outfit. */
export const STYLEABLE_ROLES = [
  'top',
  'bottom',
  'outer',
  'full-body',
  'shoes',
  'bag',
  'accessory',
  'jewelry',
] as const satisfies readonly OutfitRole[]

/**
 * `Garment Upper body` holds both layers (42 741 items, 15 types). These five are worn over
 * something else; the other ten are the something else.
 */
const OUTER_TYPES = new Set([
  'Jacket', // 3940
  'Blazer', // 1110
  'Coat', // 460
  'Outdoor Waistcoat', // 154
  'Tailored Waistcoat', // 73
])

/**
 * Bags are shelved under `Accessories`, not under `Bags` — that group holds 25 items while
 * `Accessories` holds 1280 of type `Bag`. Matching on type catches both.
 */
const BAG_TYPES = new Set([
  'Bag',
  'Backpack',
  'Cross-body bag',
  'Tote bag',
  'Shoulder bag',
  'Bumbag',
  'Weekend/Gym bag',
])

/** Shelved under `Accessories` but worn as jewelry (2160 items across the four types). */
const JEWELRY_TYPES = new Set(['Earring', 'Necklace', 'Ring', 'Bracelet'])

/** Sold in the clothing catalogue but never part of an outfit. */
const NON_APPAREL_TYPES = new Set([
  'Soft Toys',
  'Waterbottle',
  'Dog Wear',
  'Giftbox',
  'Keychain',
  'Mobile case',
  'Wireless earphone case',
  'Toy',
])

/** Groups with no clothing in them at all (219 items across all seven). */
const NON_APPAREL_GROUPS = new Set([
  'Cosmetic',
  'Items',
  'Furniture',
  'Stationery',
  'Interior textile',
  'Fun',
  'Garment and Shoe care',
  'Unknown', // 121 items whose product_type_name is also `Unknown`
])

/** Groups that map to one role regardless of type. */
const GROUP_ROLES: Record<string, OutfitRole> = {
  'Garment Lower body': 'bottom',
  Shoes: 'shoes',
  Bags: 'bag',
  Accessories: 'accessory',
  Underwear: 'underwear',
  Nightwear: 'nightwear',
  'Underwear/nightwear': 'nightwear',
  Swimwear: 'swimwear',
  'Socks & Tights': 'socks',
}

/** `Garment Full body` (13 292) splits three ways; everything else in it covers the whole body. */
const FULL_BODY_OVERRIDES: Record<string, OutfitRole> = {
  'Garment Set': 'set', // 1320 — already a complete outfit, never styled with more
  'Outdoor overall': 'outer', // 64 — worn over clothes
}

/**
 * Resolve an item's outfit role from the two columns that carry the information.
 * Falls back to `non-apparel` so an unmapped group can never leak into a styled look.
 */
export function outfitRole(productGroup: string, productType: string): OutfitRole {
  if (NON_APPAREL_GROUPS.has(productGroup) || NON_APPAREL_TYPES.has(productType)) {
    return 'non-apparel'
  }
  if (BAG_TYPES.has(productType)) return 'bag'
  if (JEWELRY_TYPES.has(productType)) return 'jewelry'
  if (productGroup === 'Garment Upper body') {
    return OUTER_TYPES.has(productType) ? 'outer' : 'top'
  }
  if (productGroup === 'Garment Full body') {
    return FULL_BODY_OVERRIDES[productType] ?? 'full-body'
  }
  return GROUP_ROLES[productGroup] ?? 'non-apparel'
}

export type Department = 'women' | 'men' | 'kids' | 'unisex'

/**
 * `index_group_name` is the only gender signal in the file (customers.csv has none).
 * `Divided` is H&M's younger womenswear line; `Sport` spans both, so it stays unisex.
 */
const DEPARTMENTS: Record<string, Department> = {
  Ladieswear: 'women', // 39 737
  'Baby/Children': 'kids', // 34 711
  Divided: 'women', // 15 149
  Menswear: 'men', // 12 553
  Sport: 'unisex', // 3392
}

export function department(indexGroup: string): Department {
  return DEPARTMENTS[indexGroup] ?? 'unisex'
}

/**
 * Three `product_type_name` values differ only by spelling or plural. Merging them keeps the
 * facet counts honest; the larger spelling wins.
 */
export const TYPE_ALIASES: Record<string, string> = {
  Earrings: 'Earring', // 11 → 1159
  'Flat shoes': 'Flat shoe', // 10 → 165
  'Dog wear': 'Dog Wear', // 7 → 20
}

export function canonicalType(productType: string): string {
  return TYPE_ALIASES[productType] ?? productType
}

/**
 * Hex for each of the 50 `colour_group_name` values — the dataset ships colour names only, and a
 * swatch needs a colour. Hand-picked to read correctly next to the garment photo.
 */
export const COLOUR_HEX: Record<string, string> = {
  Black: '#1C1C1C',
  'Dark Blue': '#1F2E4D',
  White: '#FFFFFF',
  'Light Pink': '#F5D0DA',
  Grey: '#8C8C8C',
  'Light Beige': '#E8DCC8',
  Blue: '#2F5FA8',
  Red: '#C1272D',
  'Light Blue': '#A8C8E8',
  'Greenish Khaki': '#7A7A52',
  'Dark Grey': '#4A4A4A',
  'Off White': '#F5F2EA',
  Beige: '#D9C7A8',
  'Dark Red': '#7A1F27',
  'Dark Green': '#1F4030',
  'Light Grey': '#C8C8C8',
  Pink: '#E8879E',
  Yellow: '#F0C838',
  'Light Orange': '#F5B87A',
  'Yellowish Brown': '#8A6B3D',
  Gold: '#C9A227',
  'Dark Beige': '#B8A180',
  'Light Turquoise': '#A8DCD9',
  'Light Yellow': '#F5E8A8',
  'Dark Orange': '#C25A1A',
  'Dark Pink': '#C2427A',
  Green: '#3D7A47',
  Orange: '#E8752A',
  'Other Pink': '#DB7FA0',
  Silver: '#C0C0C0',
  'Light Green': '#A8D4A0',
  'Dark Yellow': '#C9A21A',
  'Light Purple': '#C4A8DC',
  'Dark Turquoise': '#1A7A7A',
  Turquoise: '#40B5B0',
  'Dark Purple': '#5A2D6B',
  'Light Red': '#E8737A',
  'Greyish Beige': '#B5A99A',
  'Other Yellow': '#E8D060',
  Purple: '#7A3D96',
  'Other Orange': '#E88A45',
  'Other Green': '#5A9455',
  'Other Red': '#B54049',
  Other: '#9E9E9E',
  'Bronze/Copper': '#A86B3D',
  'Other Blue': '#4A78B5',
  'Other Purple': '#8F5FAD',
  Transparent: '#EDEDED',
  Unknown: '#9E9E9E',
  'Other Turquoise': '#5FBFBA',
}

/** Values that mean "no value" in the colour and pattern columns. */
export const MISSING = new Set(['Unknown', 'undefined', 'Undefined', ''])

/** Normalise a column that uses several spellings of "missing" into `null`. */
export function orNull(value: string): string | null {
  return MISSING.has(value) ? null : value
}
