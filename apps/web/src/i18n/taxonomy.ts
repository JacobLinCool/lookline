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
 * H&M writes a colour as a modifier and a hue — `Dark Blue`, `Greenish Khaki`, `Other Pink` —
 * where the catalogue answers only for whole names. The round-trip that held for its own 48
 * colours does not hold for that vocabulary: `Black` found the family and read 黑, `Dark Blue`
 * found nothing and `humanize()` printed "Dark blue" into a Traditional Chinese page, as it did
 * for 51 734 of the 105 220 articles. Splitting the modifier off leaves a hue the catalogue does
 * know, so the two halves can be read separately and put back together.
 *
 * These words are this file's own, which the rest of it is careful not to be. H&M's vocabulary
 * is `@lookline/hm`'s, and the web app does not depend on that package; the catalogue's nouns
 * stay where they are.
 */
const MODIFIER_ZH: Record<string, string> = {
  light: '淺',
  dark: '深',
  other: '其他',
  greenish: '偏綠',
  yellowish: '偏黃',
  greyish: '偏灰',
}
/** Hues H&M names that are neither one of the 48 colours nor one of the 12 families. */
const EXTRA_HUE_ZH: Record<string, string> = {
  yellow: '黃',
  orange: '橘',
  khaki: '卡其',
  turquoise: '綠松',
}
/** Names that are not a modifier and a hue at all. */
const WHOLE_NAME_ZH: Record<string, string> = {
  'bronze/copper': '古銅',
  other: '其他',
  transparent: '透明',
}

const hueZh = (slug: string): string | undefined =>
  EXTRA_HUE_ZH[slug] ?? colors.get(slug)?.labelZh ?? colorFamilies.get(slug)?.labelZh

export const colorNameLabel = (locale: Locale, colorName: string): string => {
  const slug = colorName.trim().toLowerCase().replaceAll(/\s+/gu, '-')
  if (slug === '') return colorName
  const known = colors.get(slug) ?? colorFamilies.get(slug)
  if (known) return label(locale, known, slug)
  // H&M's own name is already the English one, correctly cased.
  if (locale !== 'zh-TW') return colorName
  const whole = WHOLE_NAME_ZH[slug] ?? EXTRA_HUE_ZH[slug]
  if (whole) return whole
  const cut = slug.indexOf('-')
  const modifier = cut > 0 ? MODIFIER_ZH[slug.slice(0, cut)] : undefined
  const hue = cut > 0 ? hueZh(slug.slice(cut + 1)) : undefined
  return modifier && hue ? modifier + hue : humanize(slug)
}

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
