/**
 * Columns the recommender needs that `articles.csv` has no field for. Each one is a rule over
 * columns the dataset does ship — nothing here invents data the file does not support.
 */
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
