/**
 * Public types of @lookline/catalog. These are a cross-package contract (docs/CONTRACTS.md):
 * keep names and shapes stable; add fields, do not rename.
 */
import type { BrandTier, Department, NewBrand, NewProduct, SizeSystem } from '@lookline/db'

export type CategoryGroup =
  | 'tops'
  | 'bottoms'
  | 'dresses'
  | 'outerwear'
  | 'footwear'
  | 'bags'
  | 'accessories'
  | 'jewelry'
  | 'activewear'
  | 'swimwear'
  | 'loungewear'
  | 'tailoring'

export type ColorFamily =
  | 'black'
  | 'white'
  | 'grey'
  | 'neutral'
  | 'brown'
  | 'red'
  | 'pink'
  | 'yellow-orange'
  | 'green'
  | 'blue'
  | 'purple'
  | 'multi-metallic'

export type Axis =
  | 'formality'
  | 'warmth'
  | 'boldness'
  | 'structure'
  | 'price-tier'
  | 'coverage'
  | 'texture'
  | 'trendiness'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'all-season'

/** Every taxonomy entry is bilingual so the offline intent parser understands 中文 and English. */
export interface Lexical {
  /** Traditional Chinese label shown in the UI when the locale is zh-TW. */
  labelZh: string
  /** Lower-case search terms, English and 中文, including common misspellings/abbreviations. */
  synonyms: readonly string[]
}

export interface AestheticDef extends Lexical {
  slug: string
  name: string
  /** Position in the style vector (0–31). */
  index: number
  definition: string
  /** Affinity hints used by the generator; free-form but documented in CATALOG_SPEC.md. */
  favours: {
    categoryGroups: readonly CategoryGroup[]
    subcategories: readonly string[]
    colorFamilies: readonly ColorFamily[]
    materials: readonly string[]
    patterns: readonly string[]
    fits: readonly string[]
  }
  axes: Partial<Record<Axis, number>>
}

export interface ColorDef extends Lexical {
  name: string
  hex: string
  family: ColorFamily
}

export interface MaterialDef extends Lexical {
  slug: string
  name: string
  groups: readonly CategoryGroup[]
  warmth: number
  texture: number
}

export interface PatternDef extends Lexical {
  slug: string
  name: string
  boldness: number
}

export interface OccasionDef extends Lexical {
  slug: string
  name: string
  formality: number
}

export interface FitDef extends Lexical {
  slug: string
  name: string
  structure: number
}

export interface SubcategoryDef extends Lexical {
  slug: string
  name: string
  group: CategoryGroup
  category: string
  departments: readonly Department[]
  sizeSystem: SizeSystem
  silhouetteId: string
  /** Base values used by toStyleVector when the product itself has no override. */
  coverage: number
  formality: number
  /** Which optional attribute columns apply (length, neckline, sleeve, closure, fit, silhouette). */
  attributes: readonly ('fit' | 'silhouette' | 'length' | 'neckline' | 'sleeve' | 'closure')[]
}

export interface CategoryDef {
  slug: string
  name: string
  labelZh: string
  group: CategoryGroup
  subcategories: readonly string[]
}

export interface GeneratedBrand extends Omit<NewBrand, 'createdAt' | 'id'> {
  id: number
  tier: BrandTier
}

export interface GeneratedProduct extends Omit<NewProduct, 'createdAt' | 'id' | 'styleVector'> {
  id: number
  styleVector: number[]
}

export interface StyleVectorInput {
  /** aesthetic slug → weight in [0, 1] */
  aesthetics: Readonly<Record<string, number>>
  colorFamily: ColorFamily
  secondaryColorFamily?: ColorFamily | null
  axes: Partial<Record<Axis, number>>
  categoryGroup?: CategoryGroup | null
}

export interface VectorDescription {
  aesthetics: Array<{ slug: string; name: string; weight: number }>
  colorFamilies: Array<{ family: ColorFamily; weight: number }>
  axes: Record<Axis, number>
  categoryGroups: Array<{ group: CategoryGroup; weight: number }>
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
  float(min: number, max: number): number
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T
  shuffle<T>(items: readonly T[]): T[]
  normal(mean: number, sd: number): number
}

export interface ProductRenderInput {
  silhouetteId: string
  colorHex: string
  secondaryColorHex?: string | null
  pattern: string
  aesthetics: readonly string[]
  imageSeed: number
  categoryGroup: string
  name?: string
  brandName?: string
}

export interface LexEntry {
  value: string
  terms: readonly string[]
}

export interface Lexicon {
  departments: readonly LexEntry[]
  categoryGroups: readonly LexEntry[]
  subcategories: readonly LexEntry[]
  colors: readonly LexEntry[]
  colorFamilies: readonly LexEntry[]
  aesthetics: readonly LexEntry[]
  materials: readonly LexEntry[]
  patterns: readonly LexEntry[]
  occasions: readonly LexEntry[]
  seasons: readonly LexEntry[]
  fits: readonly LexEntry[]
}

export interface CatalogGenOptions {
  seed: number
  size: number
  brands?: readonly GeneratedBrand[]
}

export type { Department, SizeSystem, BrandTier }
