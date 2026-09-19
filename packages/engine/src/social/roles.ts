/**
 * Slot roles for `look_products.role` (docs/DATA_MODEL.md: top, bottom, one-piece, outer, shoes,
 * bag, jewelry, accessory) inferred from category group and subcategory via the catalog's
 * `slotRoleOf`, with fallbacks for the groups it leaves unassigned.
 */
import { slotRoleOf, type CategoryGroup } from '@lookline/catalog'

export type LookRole =
  | 'top'
  | 'bottom'
  | 'one-piece'
  | 'outer'
  | 'shoes'
  | 'bag'
  | 'jewelry'
  | 'accessory'

const GROUP_FALLBACK: Readonly<Record<CategoryGroup, LookRole>> = {
  tops: 'top',
  bottoms: 'bottom',
  dresses: 'one-piece',
  outerwear: 'outer',
  footwear: 'shoes',
  bags: 'bag',
  accessories: 'accessory',
  jewelry: 'jewelry',
  activewear: 'top',
  swimwear: 'one-piece',
  loungewear: 'top',
  tailoring: 'outer',
}

const SUBCATEGORY_HINTS: ReadonlyArray<readonly [RegExp, LookRole]> = [
  [/bottom|short|tights|jogger|sweatpant|trunks|trouser|pant|skirt/, 'bottom'],
  [/bra|tee|top|shirt|rash-guard|pajama|hoodie/, 'top'],
  [/one-piece|jumpsuit|dress|gown|suit|tuxedo|nightgown/, 'one-piece'],
  [/jacket|blazer|coat|cover-up|robe|cardigan/, 'outer'],
]

export function inferRole(product: { categoryGroup: string; subcategory: string }): LookRole {
  const fromCatalog = slotRoleOf(product.categoryGroup, product.subcategory)
  if (fromCatalog) return fromCatalog
  for (const [pattern, role] of SUBCATEGORY_HINTS) {
    if (pattern.test(product.subcategory)) return role
  }
  return GROUP_FALLBACK[product.categoryGroup as CategoryGroup] ?? 'accessory'
}

/** Roles in input order; the first item of each role keeps the plain role, later ones get `-2`, `-3`, … */
export function inferRoles(
  products: ReadonlyArray<{ categoryGroup: string; subcategory: string }>,
): string[] {
  const counts = new Map<LookRole, number>()
  return products.map((p) => {
    const role = inferRole(p)
    const n = (counts.get(role) ?? 0) + 1
    counts.set(role, n)
    return n === 1 ? role : `${role}-${n}`
  })
}
