/**
 * Engine tables keyed by the catalog's 32 aesthetic slugs (ENGINE_SPEC §0.1–§0.3, re-keyed).
 *
 * The catalog list differs from the slugs written in ENGINE_SPEC §0.1, so instead of retyping the
 * spec's tables the axis and colour priors are derived from `AestheticDef` (`axes`,
 * `favours.colorFamilies`, and the catalog's own `AESTHETIC_COLOR_PRIOR`). `resolveAestheticTables`
 * implements the re-keying rule: rows for unknown slugs are dropped and every catalog slug missing
 * from a table gets the neutral row (axes all 0.5, colour prior `{black .4, white .4, neutral .4}`).
 */
import {
  AESTHETICS,
  AESTHETIC_COLOR_PRIOR as CATALOG_COLOR_PRIOR,
  AXES,
  type AestheticDef,
  type Axis,
  type ColorFamily,
} from '@lookline/catalog'
import { clamp01 } from './vector'

export type AxisPriorRow = Record<Axis, number>
export type ColorPriorRow = Partial<Record<ColorFamily, number>>

export interface AestheticTables {
  /** Catalog slugs in vector order. */
  slugs: string[]
  axes: Record<string, AxisPriorRow>
  colors: Record<string, ColorPriorRow>
}

export interface AestheticTableOverrides {
  axes?: Record<string, Partial<AxisPriorRow>>
  colors?: Record<string, ColorPriorRow>
}

export function neutralAxisRow(): AxisPriorRow {
  return Object.fromEntries(AXES.map((axis) => [axis, 0.5])) as AxisPriorRow
}

export function neutralColorRow(): ColorPriorRow {
  return { black: 0.4, white: 0.4, neutral: 0.4 }
}

/**
 * Axis prior of an aesthetic from the catalog definition. The catalog stores `formality` as an
 * adjustment (`fAdj` ∈ [−0.2, 0.2]); values with |x| ≤ 0.25 are therefore read as offsets from the
 * neutral 0.5, larger ones as absolute targets. `price-tier` has no aesthetic prior (0.5).
 */
export function axisRowFromDef(def: AestheticDef): AxisPriorRow {
  const row = neutralAxisRow()
  for (const axis of AXES) {
    if (axis === 'price-tier') continue
    const value = def.axes[axis]
    if (value === undefined) continue
    row[axis] =
      axis === 'formality' && Math.abs(value) <= 0.25 ? clamp01(0.5 + value) : clamp01(value)
  }
  return row
}

/** Colour prior from the catalog's favoured colours; `favours.colorFamilies` at 0.5 as fallback. */
export function colorRowFromDef(def: AestheticDef): ColorPriorRow {
  const fromCatalog = (CATALOG_COLOR_PRIOR as Record<string, ColorPriorRow | undefined>)[def.slug]
  if (fromCatalog && Object.keys(fromCatalog).length > 0) return { ...fromCatalog }
  if (def.favours.colorFamilies.length > 0) {
    return Object.fromEntries(def.favours.colorFamilies.map((f) => [f, 0.5])) as ColorPriorRow
  }
  return neutralColorRow()
}

/**
 * Build the engine tables for a catalog aesthetic list. Every slug of `aesthetics` is guaranteed
 * a row in both tables; override rows for slugs outside the list are dropped.
 */
export function resolveAestheticTables(
  aesthetics: readonly AestheticDef[] = AESTHETICS,
  overrides: AestheticTableOverrides = {},
): AestheticTables {
  const slugs = aesthetics.map((a) => a.slug)
  const known = new Set(slugs)
  const axes: Record<string, AxisPriorRow> = {}
  const colors: Record<string, ColorPriorRow> = {}
  for (const def of aesthetics) {
    axes[def.slug] = axisRowFromDef(def)
    colors[def.slug] = colorRowFromDef(def)
  }
  for (const [slug, row] of Object.entries(overrides.axes ?? {})) {
    if (!known.has(slug)) continue
    const target = axes[slug] ?? neutralAxisRow()
    for (const axis of AXES) {
      const value = row[axis]
      if (value !== undefined) target[axis] = clamp01(value)
    }
    axes[slug] = target
  }
  for (const [slug, row] of Object.entries(overrides.colors ?? {})) {
    if (!known.has(slug)) continue
    colors[slug] = { ...row }
  }
  for (const slug of slugs) {
    axes[slug] ??= neutralAxisRow()
    colors[slug] ??= neutralColorRow()
  }
  return { slugs, axes, colors }
}

/** Tables resolved against the catalog at module load. */
export const AESTHETIC_TABLES: AestheticTables = resolveAestheticTables(AESTHETICS)

/** Axis prior per catalog aesthetic slug (§0.2, derived). */
export const AESTHETIC_AXIS_PRIOR: Readonly<Record<string, AxisPriorRow>> = AESTHETIC_TABLES.axes
/** Colour-family prior per catalog aesthetic slug (§0.3, derived). */
export const AESTHETIC_COLOR_PRIOR: Readonly<Record<string, ColorPriorRow>> =
  AESTHETIC_TABLES.colors
