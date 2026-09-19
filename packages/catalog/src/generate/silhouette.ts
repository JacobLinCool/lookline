/**
 * Resolved silhouette key stored in `products.silhouette_id` (CATALOG_SPEC §9.2): the
 * subcategory's base id plus the attribute-dependent variants. The renderer owns the paths; this
 * only picks the key.
 */
import type { SubcategoryRow } from '../taxonomy/categories'

export interface SilhouetteColumns {
  fit?: string | null
  length?: string | null
  sleeve?: string | null
}

/** §9.2 `silhouetteFor`: base id from the taxonomy row, variants from sleeve / fit / length / height. */
export function resolveSilhouetteId(
  sub: SubcategoryRow,
  columns: SilhouetteColumns,
  extras: Readonly<Record<string, string | number | boolean>>,
): string {
  const base = sub.silhouetteId
  switch (sub.slug) {
    case 'tee':
      return columns.sleeve === 'long' ? 'tee-long' : base
    case 'jeans':
    case 'chinos':
    case 'tailored-trousers':
      return columns.fit === 'wide' || columns.fit === 'flared' ? 'pants-wide' : base
    case 'pleated-skirt':
      return columns.length === 'mini' ? 'skirt-mini' : base
    case 'sneaker':
      return extras.height === 'high' ? 'sneaker-high' : base
    default:
      return base
  }
}
