/**
 * Aesthetic / colour / occasion lookups keyed by the CATALOG slugs (ENGINE_SPEC §0.1 re-keying
 * rule). Axis and colour priors are derived from the catalog `AestheticDef` instead of retyping
 * §0.2 / §0.3; `resolveAestheticTables` guarantees every catalog slug has a row.
 */
import {
  AESTHETICS,
  AESTHETIC_COLOR_PRIOR,
  AXES,
  COLOR_FAMILIES,
  COLOR_FAMILY_DEFS,
  LEXICON,
  findFit,
  SLEEVES,
  findMaterial,
  findPattern,
  findSubcategory,
} from '@lookline/catalog'
import type { AestheticDef, Axis, ColorFamily } from '@lookline/catalog'
import { garmentLabel } from './catalogue'

export interface AestheticRow {
  slug: string
  name: string
  labelZh: string
  index: number
  /** All eight axes; missing catalog axes default to the neutral 0.5. */
  axes: Record<Axis, number>
  /** Colour-family weights in [0, 1]; families the aesthetic never favours are 0. */
  colorPrior: Record<ColorFamily, number>
}

const NEUTRAL_COLOR_PRIOR: Readonly<Partial<Record<ColorFamily, number>>> = {
  black: 0.4,
  white: 0.4,
  neutral: 0.4,
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Catalog `AestheticDef.axes` carries `formality` as an *adjustment* (CATALOG_SPEC §8.2 `fAdj`,
 * centred on 0) and `boldness` / `trendiness` as absolute values; missing axes are neutral (0.5).
 */
function rowFor(a: AestheticDef): AestheticRow {
  const axes = Object.fromEntries(
    AXES.map((axis) => [
      axis,
      axis === 'formality' ? clamp01(0.5 + (a.axes.formality ?? 0)) : clamp01(a.axes[axis] ?? 0.5),
    ]),
  ) as Record<Axis, number>
  const prior =
    (AESTHETIC_COLOR_PRIOR as Readonly<Record<string, Partial<Record<ColorFamily, number>>>>)[
      a.slug
    ] ?? null
  const colorPrior = Object.fromEntries(
    COLOR_FAMILIES.map((f) => {
      const fromPrior = prior?.[f]
      if (fromPrior !== undefined && fromPrior > 0) return [f, fromPrior]
      if (a.favours.colorFamilies.includes(f)) return [f, 0.5]
      return [f, 0]
    }),
  ) as Record<ColorFamily, number>
  const anyColour = Object.values(colorPrior).some((x) => x > 0)
  if (!anyColour)
    for (const [f, w] of Object.entries(NEUTRAL_COLOR_PRIOR)) colorPrior[f as ColorFamily] = w
  return { slug: a.slug, name: a.name, labelZh: a.labelZh, index: a.index, axes, colorPrior }
}

/** One row per catalog aesthetic, in dim order; unknown slugs never appear. */
export function resolveAestheticTables(
  list: readonly AestheticDef[] = AESTHETICS,
): ReadonlyMap<string, AestheticRow> {
  return new Map(list.map((a) => [a.slug, rowFor(a)]))
}

export const AESTHETIC_TABLES: ReadonlyMap<string, AestheticRow> = resolveAestheticTables()

export function aestheticLabel(slug: string, locale: 'zh' | 'en'): string {
  const row = AESTHETIC_TABLES.get(slug)
  if (!row) return slug
  return locale === 'zh' ? row.labelZh : row.name
}

const COLOR_FAMILY_LABEL: ReadonlyMap<string, { en: string; zh: string }> = new Map(
  COLOR_FAMILY_DEFS.map((f) => [f.slug, { en: f.name.toLowerCase(), zh: f.labelZh }]),
)

export function colorFamilyLabel(family: string, locale: 'zh' | 'en'): string {
  const l = COLOR_FAMILY_LABEL.get(family)
  if (!l) return family
  return locale === 'zh' ? l.zh : l.en
}

export function subcategoryLabel(slug: string, locale: 'zh' | 'en'): string {
  const s = findSubcategory(slug)
  // An article carries H&M's `product_type_name`, not a slug, so this misses for everything the
  // catalogue stores and the Chinese copy read 「黑色Trousers」. `garmentLabel` names those.
  if (!s) return garmentLabel(slug, locale)
  return locale === 'zh' ? s.labelZh : s.name.toLowerCase()
}

export function materialLabel(slug: string, locale: 'zh' | 'en'): string {
  const m = findMaterial(slug)
  if (!m) return slug
  return locale === 'zh' ? m.labelZh : m.name.toLowerCase()
}

export function patternLabel(slug: string, locale: 'zh' | 'en'): string {
  const p = findPattern(slug)
  if (!p) return slug
  return locale === 'zh' ? p.labelZh : p.name.toLowerCase()
}

export function fitLabel(slug: string, locale: 'zh' | 'en'): string {
  const f = findFit(slug)
  if (!f) return slug
  return locale === 'zh' ? f.labelZh : f.name.toLowerCase()
}

export function sleeveLabel(slug: string, locale: 'zh' | 'en'): string {
  const s = SLEEVES.find((x) => x.slug === slug)
  if (!s) return slug
  return locale === 'zh' ? s.labelZh : `${s.name.toLowerCase()} sleeve`
}

const AXIS_LABEL: Readonly<Record<Axis, { en: string; zh: string }>> = {
  formality: { en: 'formality', zh: '正式度' },
  warmth: { en: 'warmth', zh: '保暖度' },
  boldness: { en: 'boldness', zh: '搶眼度' },
  structure: { en: 'structure', zh: '挺度' },
  'price-tier': { en: 'price tier', zh: '價位' },
  coverage: { en: 'coverage', zh: '包覆度' },
  texture: { en: 'texture', zh: '質感' },
  trendiness: { en: 'trendiness', zh: '流行度' },
}

export function axisLabel(axis: string, locale: 'zh' | 'en'): string {
  const l = AXIS_LABEL[axis as Axis]
  if (!l) return axis
  return locale === 'zh' ? l.zh : l.en
}

const SEASON_LABEL: Readonly<Record<string, { en: string; zh: string }>> = {
  spring: { en: 'spring', zh: '春天' },
  summer: { en: 'summer', zh: '夏天' },
  autumn: { en: 'autumn', zh: '秋天' },
  winter: { en: 'winter', zh: '冬天' },
  'all-season': { en: 'all year', zh: '四季' },
}

export function seasonLabel(season: string, locale: 'zh' | 'en'): string {
  const l = SEASON_LABEL[season]
  if (!l) return season
  return locale === 'zh' ? l.zh : l.en
}

// ---------------------------------------------------------------------------
// Occasions → outfit template (ENGINE_SPEC §0.5 slugs and the catalog §2.6 slugs both resolve)
// ---------------------------------------------------------------------------

export type TemplateKey =
  | 'formal'
  | 'work'
  | 'smart-casual'
  | 'party'
  | 'festival'
  | 'travel'
  | 'casual'
  | 'sport'
  | 'outdoor'
  | 'beach'

/** ENGINE_SPEC §0.5 (engine occasion slugs) and CATALOG_SPEC §2.6 (product occasion slugs). */
export const OCCASION_TEMPLATE: Readonly<Record<string, TemplateKey>> = {
  // engine slugs
  'wedding-guest': 'formal',
  office: 'work',
  interview: 'work',
  date: 'smart-casual',
  party: 'party',
  festival: 'festival',
  travel: 'travel',
  hiking: 'outdoor',
  gym: 'sport',
  beach: 'beach',
  'casual-daily': 'casual',
  graduation: 'formal',
  funeral: 'formal',
  school: 'casual',
  gala: 'formal',
  'lunar-new-year': 'smart-casual',
  concert: 'casual',
  'family-gathering': 'smart-casual',
  // catalog slugs
  everyday: 'casual',
  work: 'work',
  'date-night': 'smart-casual',
  workout: 'sport',
  brunch: 'smart-casual',
  formal: 'formal',
  lounge: 'casual',
}

/** Template key for a free occasion string (engine slug, catalog slug or a lexicon synonym). */
export function templateForOccasion(occasion: string | null | undefined): TemplateKey {
  if (!occasion) return 'casual'
  const key = occasion.trim().toLowerCase()
  const direct = OCCASION_TEMPLATE[key]
  if (direct) return direct
  for (const entry of LEXICON.occasions) {
    if (entry.terms.includes(key)) return OCCASION_TEMPLATE[entry.value] ?? 'casual'
  }
  if (/wedding|婚|gala|晚宴|formal|正式|interview|面試|funeral|告別/.test(key)) return 'formal'
  if (/office|work|上班|辦公|通勤/.test(key)) return 'work'
  if (/gym|run|健身|運動|workout/.test(key)) return 'sport'
  if (/hik|trail|camp|登山|爬山|露營|outdoor|戶外/.test(key)) return 'outdoor'
  if (/beach|pool|海|沙灘|泳/.test(key)) return 'beach'
  if (/party|club|派對|夜店/.test(key)) return 'party'
  if (/festival|音樂/.test(key)) return 'festival'
  if (/travel|trip|旅/.test(key)) return 'travel'
  if (/date|約會|brunch|dinner/.test(key)) return 'smart-casual'
  return 'casual'
}
