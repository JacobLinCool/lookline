/**
 * Engine-side aesthetic tables (ENGINE_SPEC §0.1–0.3), keyed by the CATALOG slugs.
 *
 * The catalog's 32 aesthetics differ from the list in ENGINE_SPEC §0.1, so nothing is retyped
 * from §0.2/§0.3: axis priors are derived from each catalog `AestheticDef` (its `axes` plus the
 * warmth/texture of its favoured materials, the structure of its favoured fits and the coverage
 * of its favoured subcategories) and colour priors come from the catalog's own
 * `AESTHETIC_COLOR_PRIOR` (favoured colours → family weights). `resolveAestheticTables` applies the
 * §0.1 re-keying rule: rows for unknown slugs are dropped and every catalog slug missing from a
 * table gets the neutral row.
 */
import {
  AESTHETICS,
  AESTHETIC_COLOR_PRIOR as CATALOG_COLOR_PRIOR,
  FITS,
  MATERIALS,
  SUBCATEGORIES,
} from '@lookline/catalog'
import type { AestheticDef, Axis, ColorFamily } from '@lookline/catalog'

/** Axes that carry an aesthetic prior (price-tier comes from budget only). */
export type PriorAxis = Exclude<Axis, 'price-tier'>

export const PRIOR_AXES: readonly PriorAxis[] = [
  'formality',
  'warmth',
  'boldness',
  'structure',
  'coverage',
  'texture',
  'trendiness',
]

export type AxisPriorRow = Readonly<Record<PriorAxis, number>>
export type ColorPriorRow = Readonly<Partial<Record<ColorFamily, number>>>

export interface AestheticTables {
  slugs: readonly string[]
  axisPrior: Readonly<Record<string, AxisPriorRow>>
  colorPrior: Readonly<Record<string, ColorPriorRow>>
}

/** §0.1 neutral row: every axis 0.5. */
export const NEUTRAL_AXIS_ROW: AxisPriorRow = {
  formality: 0.5,
  warmth: 0.5,
  boldness: 0.5,
  structure: 0.5,
  coverage: 0.5,
  texture: 0.5,
  trendiness: 0.5,
}

/** §0.1 neutral colour prior. */
export const NEUTRAL_COLOR_PRIOR: ColorPriorRow = { black: 0.4, white: 0.4, neutral: 0.4 }

/**
 * ENGINE_SPEC slugs that do not exist in the catalog → closest catalog slug. Used when re-keying
 * spec tables and when mapping LLM output.
 */
export const SPEC_AESTHETIC_ALIASES: Readonly<Record<string, string>> = {
  'old-money': 'quiet-luxury',
  classic: 'quiet-luxury',
  'korean-minimal': 'k-street',
  military: 'workwear',
  bohemian: 'boho',
  'vintage-retro': 'retro-70s',
  gothic: 'goth',
  harajuku: 'city-boy',
  'artsy-eclectic': 'avant-garde',
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const round3 = (x: number): number => Math.round(x * 1000) / 1000

const mean = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((s, x) => s + x, 0) / values.length

const MATERIAL_BY_SLUG = new Map(MATERIALS.map((m) => [m.slug, m]))
const FIT_BY_SLUG = new Map(FITS.map((f) => [f.slug, f]))
const SUBCATEGORY_BY_SLUG = new Map(SUBCATEGORIES.map((s) => [s.slug, s]))

/** Axis prior of one catalog aesthetic, derived from its definition (see file header). */
export function deriveAxisPrior(a: AestheticDef): AxisPriorRow {
  const materials = a.favours.materials
    .map((m) => MATERIAL_BY_SLUG.get(m))
    .filter((m): m is NonNullable<typeof m> => m !== undefined)
  const fits = a.favours.fits
    .map((f) => FIT_BY_SLUG.get(f))
    .filter((f): f is NonNullable<typeof f> => f !== undefined)
  const subs = a.favours.subcategories
    .map((s) => SUBCATEGORY_BY_SLUG.get(s))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
  return {
    formality: round3(clamp(0.45 + 2.5 * (a.axes.formality ?? 0), 0.05, 0.95)),
    warmth: round3(mean(materials.map((m) => m.warmth)) ?? 0.5),
    boldness: round3(clamp(a.axes.boldness ?? 0.5, 0, 1)),
    structure: round3(mean(fits.map((f) => f.structure)) ?? 0.5),
    coverage: round3(mean(subs.map((s) => s.coverage)) ?? 0.5),
    texture: round3(mean(materials.map((m) => m.texture)) ?? 0.5),
    trendiness: round3(clamp(a.axes.trendiness ?? 0.5, 0, 1)),
  }
}

/** Colour prior of one catalog aesthetic: catalog `AESTHETIC_COLOR_PRIOR`, else equal weights over `favours.colorFamilies`. */
export function deriveColorPrior(a: AestheticDef): ColorPriorRow {
  const fromCatalog = (CATALOG_COLOR_PRIOR as Readonly<Record<string, ColorPriorRow | undefined>>)[
    a.slug
  ]
  if (fromCatalog && Object.keys(fromCatalog).length > 0) return fromCatalog
  if (a.favours.colorFamilies.length > 0) {
    const row: Partial<Record<ColorFamily, number>> = {}
    for (const f of a.favours.colorFamilies) row[f] = 0.5
    return row
  }
  return NEUTRAL_COLOR_PRIOR
}

/**
 * §0.1 re-keying: build the engine tables for exactly the given aesthetics. Optional overrides
 * (keyed by spec or catalog slug) are re-keyed through `SPEC_AESTHETIC_ALIASES`; rows whose slug
 * is unknown are dropped and every slug without a row gets the neutral row.
 */
export function resolveAestheticTables(
  aesthetics: readonly AestheticDef[] = AESTHETICS,
  overrides: {
    axisPrior?: Readonly<Record<string, Partial<AxisPriorRow>>>
    colorPrior?: Readonly<Record<string, ColorPriorRow>>
  } = {},
): AestheticTables {
  const slugs = aesthetics.map((a) => a.slug)
  const known = new Set(slugs)
  const canonical = (slug: string): string | undefined => {
    if (known.has(slug)) return slug
    const alias = SPEC_AESTHETIC_ALIASES[slug]
    return alias && known.has(alias) ? alias : undefined
  }
  const axisPrior: Record<string, AxisPriorRow> = {}
  const colorPrior: Record<string, ColorPriorRow> = {}
  for (const a of aesthetics) {
    axisPrior[a.slug] = a.favours ? deriveAxisPrior(a) : NEUTRAL_AXIS_ROW
    colorPrior[a.slug] = a.favours ? deriveColorPrior(a) : NEUTRAL_COLOR_PRIOR
  }
  for (const [slug, row] of Object.entries(overrides.axisPrior ?? {})) {
    const key = canonical(slug)
    if (!key) continue
    axisPrior[key] = { ...(axisPrior[key] ?? NEUTRAL_AXIS_ROW), ...row }
  }
  for (const [slug, row] of Object.entries(overrides.colorPrior ?? {})) {
    const key = canonical(slug)
    if (!key) continue
    const merged: Partial<Record<ColorFamily, number>> = { ...colorPrior[key] }
    for (const [family, w] of Object.entries(row) as Array<[ColorFamily, number]>) {
      merged[family] = Math.max(merged[family] ?? 0, w)
    }
    colorPrior[key] = merged
  }
  for (const slug of slugs) {
    if (!axisPrior[slug]) axisPrior[slug] = NEUTRAL_AXIS_ROW
    if (!colorPrior[slug]) colorPrior[slug] = NEUTRAL_COLOR_PRIOR
  }
  return { slugs, axisPrior, colorPrior }
}

export const AESTHETIC_TABLES: AestheticTables = resolveAestheticTables(AESTHETICS)

/** The 32 catalog slugs in style-vector order. */
export const AESTHETIC_SLUGS: readonly string[] = AESTHETIC_TABLES.slugs
/** Axis prior per catalog slug (§0.2 equivalent). */
export const AESTHETIC_AXIS_PRIOR = AESTHETIC_TABLES.axisPrior
/** Colour-family prior per catalog slug (§0.3 equivalent). */
export const AESTHETIC_COLOR_PRIOR = AESTHETIC_TABLES.colorPrior

const KNOWN = new Set(AESTHETIC_SLUGS)

/** Catalog slug for a catalog or spec slug; undefined when neither. */
export function canonicalAesthetic(slug: string): string | undefined {
  const s = slug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
  if (KNOWN.has(s)) return s
  const alias = SPEC_AESTHETIC_ALIASES[s]
  return alias && KNOWN.has(alias) ? alias : undefined
}
