import {
  AESTHETICS,
  CATEGORIES,
  CATEGORY_GROUP_DEFS,
  CLOSURES,
  COLOR_FAMILY_DEFS,
  COLORS,
  DEPARTMENT_DEFS,
  DESIGN_DETAILS,
  FITS,
  GARMENT_DETAILS,
  LENGTHS,
  MATERIALS,
  NECKLINES,
  OCCASIONS,
  PATTERNS,
  PRINT_SUBJECTS,
  SEASON_DEFS,
  SILHOUETTE_VALUES,
  SLEEVES,
  SUBCATEGORIES,
  findSearchFacet,
  type SearchFacet,
  type SearchFacetId,
} from '@lookline/catalog'
import { findEngineOccasion } from '@lookline/engine/occasions'
import { humanize } from '@/server/format'
import type { Locale } from './config'

/**
 * Catalog nouns in the reader's language. The taxonomy already carries a Traditional Chinese
 * label for every department, group, category, subcategory, colour, aesthetic, occasion, season,
 * material, pattern, fit, length, neckline, sleeve and closure, so nothing here is a translation
 * of our own: `@lookline/catalog` owns these words, `@/i18n/messages` owns the interface.
 */

interface Labelled {
  slug: string
  name: string
  labelZh: string
}

const label = (locale: Locale, def: Labelled | undefined, slug: string): string =>
  def ? (locale === 'zh-TW' ? def.labelZh : def.name) : humanize(slug)

const bySlug = (rows: readonly Labelled[]): ReadonlyMap<string, Labelled> =>
  new Map(rows.map((row) => [row.slug, row]))

const departments = bySlug(DEPARTMENT_DEFS)
const groups = bySlug(CATEGORY_GROUP_DEFS)
const categories = bySlug(CATEGORIES)
const subcategories = bySlug(SUBCATEGORIES)
const colorFamilies = bySlug(COLOR_FAMILY_DEFS)
const colors = bySlug(COLORS)
const aesthetics = bySlug(AESTHETICS)
const occasions = bySlug(OCCASIONS)
const seasons = bySlug(SEASON_DEFS)
const attributes = bySlug([
  ...MATERIALS,
  ...PATTERNS,
  ...FITS,
  ...LENGTHS,
  ...NECKLINES,
  ...SLEEVES,
  ...CLOSURES,
  ...SILHOUETTE_VALUES,
  ...PRINT_SUBJECTS,
  ...DESIGN_DETAILS,
  ...GARMENT_DETAILS,
])

export const departmentLabel = (locale: Locale, slug: string) =>
  label(locale, departments.get(slug), slug)
export const categoryGroupLabel = (locale: Locale, slug: string) =>
  label(locale, groups.get(slug), slug)
export const categoryLabel = (locale: Locale, slug: string) =>
  label(locale, categories.get(slug) ?? subcategories.get(slug), slug)
export const subcategoryLabel = (locale: Locale, slug: string) =>
  label(locale, subcategories.get(slug) ?? categories.get(slug), slug)
export const colorFamilyLabel = (locale: Locale, slug: string) =>
  label(locale, colorFamilies.get(slug), slug)
export const colorLabel = (locale: Locale, slug: string) =>
  label(locale, colors.get(slug) ?? colorFamilies.get(slug), slug)
/**
 * `products.color_name` is the catalog's own colour name ("Jet Black"), not a slug; its slug is
 * that name lower-cased and hyphenated, which round-trips for all 48 catalog colours.
 */
export const colorNameLabel = (locale: Locale, colorName: string) =>
  colorLabel(locale, colorName.toLowerCase().replaceAll(/\s+/gu, '-'))

export const aestheticLabel = (locale: Locale, slug: string) =>
  label(locale, aesthetics.get(slug), slug)
/**
 * Two vocabularies reach this one helper. An article's `occasions` are catalog slugs
 * (`everyday`, `work`); `intent.occasion` is the engine's own (`casual-daily`, `office`), which
 * the catalog table does not know — and `humanize()` then printed an English word into a
 * Traditional Chinese sentence. The engine names its own occasions, so it answers for them.
 */
export const occasionLabel = (locale: Locale, slug: string): string => {
  const def = occasions.get(slug)
  if (def) return label(locale, def, slug)
  const engine = findEngineOccasion(slug)
  if (engine) return locale === 'zh-TW' ? engine.labelZh : engine.labelEn
  return humanize(slug)
}
export const seasonLabel = (locale: Locale, slug: string) => label(locale, seasons.get(slug), slug)

/** Every table in one lookup, for slugs whose facet is not known at the call site. */
const anyTable: readonly ReadonlyMap<string, Labelled>[] = [
  aesthetics,
  colorFamilies,
  colors,
  groups,
  categories,
  subcategories,
  occasions,
  seasons,
  departments,
  attributes,
]

/**
 * Best effort for a mixed slug (an intent tag, a `mustAvoid` token). Tables are searched in a
 * fixed order so the same slug always reads the same way; an unknown slug stays `humanize`d.
 */
export function facetLabel(locale: Locale, slug: string): string {
  const value = slug.includes(':') ? slug.slice(slug.indexOf(':') + 1) : slug
  for (const table of anyTable) {
    const def = table.get(value)
    if (def) return locale === 'zh-TW' ? def.labelZh : def.name
  }
  return humanize(value)
}

/**
 * A value of one search facet, read from that facet's own vocabulary. The mixed lookup above
 * cannot tell a `short` sleeve from a `short` length or a `crew` neck from a `crew` sock, so a
 * chip or a rail row that knows its facet asks here.
 */
export function facetValueLabel(
  locale: Locale,
  facet: SearchFacet | SearchFacetId,
  slug: string,
): string {
  const def = typeof facet === 'string' ? findSearchFacet(facet) : facet
  return label(
    locale,
    def?.values.find((v) => v.slug === slug),
    slug,
  )
}
