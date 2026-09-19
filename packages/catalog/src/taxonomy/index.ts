/**
 * Taxonomy constants. Ordered lists define the style-vector layout (docs/ARCHITECTURE.md).
 * Files: categories.ts, attribute-schemas.ts, colors.ts, materials.ts, patterns.ts, fits.ts,
 * sizes.ts, occasions.ts, lexicon.ts (taxonomy owner) and aesthetics.ts (aesthetics owner).
 * This barrel re-exports every table and lookup; the contract names of docs/CONTRACTS.md are
 * `AESTHETICS`, `COLOR_FAMILIES`, `AXES`, `CATEGORY_GROUPS`, `CATEGORIES`, `SUBCATEGORIES`,
 * `COLORS`, `MATERIALS`, `PATTERNS`, `OCCASIONS`, `FITS`, `SEASONS`, `DEPARTMENTS`, `LEXICON`,
 * `findSubcategory`, `findAesthetic`, `findColor`.
 */
import type { AestheticDef, Axis } from '../types'
import { AESTHETICS } from './aesthetics'

export * from './aesthetics'
export * from './categories'
export * from './attribute-schemas'
export * from './colors'
export * from './materials'
export * from './patterns'
export * from './fits'
export * from './sizes'
export * from './occasions'
export * from './lexicon'

/** Contract order = style-vector dims 44–51 (docs/ARCHITECTURE.md). */
export const AXES: readonly Axis[] = [
  'formality',
  'warmth',
  'boldness',
  'structure',
  'price-tier',
  'coverage',
  'texture',
  'trendiness',
]

export function findAesthetic(slug: string): AestheticDef | undefined {
  return AESTHETICS.find((a) => a.slug === slug)
}
