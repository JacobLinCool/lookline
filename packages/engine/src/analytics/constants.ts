/**
 * Aesthetic tables used by the analytics module (ENGINE_SPEC §0.1 re-keying rule). The engine
 * never retypes the spec's §0.2/§0.3 tables: axis and colour priors are derived from the catalog
 * `AestheticDef` (`axes`, `favours.colorFamilies`) and every catalog slug is guaranteed a row.
 * A private copy lives here until `constants/aesthetics.ts` lands (see REQUESTS.md).
 */
import {
  AESTHETICS,
  AXES,
  CATEGORY_GROUP_DEFS,
  COLOR_FAMILY_DEFS,
  type AestheticDef,
  type Axis,
  type ColorFamily,
} from '@lookline/catalog'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

export interface AestheticRow {
  slug: string
  name: string
  labelZh: string
  index: number
  /** All 8 axes, 0.5 where the catalog gives no prior. */
  axes: Record<Axis, number>
  /** Colour-family prior: 1 for favoured families; the neutral row otherwise. */
  colors: Partial<Record<ColorFamily, number>>
}

export const NEUTRAL_COLOR_PRIOR: Readonly<Partial<Record<ColorFamily, number>>> = {
  black: 0.4,
  white: 0.4,
  neutral: 0.4,
}

function rowFor(def: AestheticDef): AestheticRow {
  // Catalog `axes.formality` is an adjustment around the neutral 0.5; the others are absolute.
  const axes = Object.fromEntries(
    AXES.map((axis) => {
      const raw = def.axes[axis]
      if (raw === undefined) return [axis, 0.5]
      return [axis, clamp01(axis === 'formality' ? 0.5 + raw : raw)]
    }),
  ) as Record<Axis, number>
  const colors: Partial<Record<ColorFamily, number>> = {}
  for (const family of def.favours.colorFamilies) colors[family] = 1
  return {
    slug: def.slug,
    name: def.name,
    labelZh: def.labelZh,
    index: def.index,
    axes,
    colors: Object.keys(colors).length > 0 ? colors : { ...NEUTRAL_COLOR_PRIOR },
  }
}

/**
 * One row per catalog aesthetic, keyed by the catalog slug. Extra rows in `overrides` whose slug
 * is not in the catalog are dropped; catalog slugs without an override get the derived row.
 */
export function resolveAestheticTables(
  catalog: readonly AestheticDef[] = AESTHETICS,
  overrides: Readonly<Record<string, Partial<AestheticRow>>> = {},
): ReadonlyMap<string, AestheticRow> {
  const out = new Map<string, AestheticRow>()
  for (const def of catalog) {
    const base = rowFor(def)
    const override = overrides[def.slug]
    out.set(def.slug, override ? { ...base, ...override, slug: def.slug } : base)
  }
  return out
}

export const AESTHETIC_TABLE: ReadonlyMap<string, AestheticRow> = resolveAestheticTables()

export function aestheticName(slug: string): string {
  return AESTHETIC_TABLE.get(slug)?.name ?? humanizeSlug(slug)
}

const GROUP_NAME: ReadonlyMap<string, string> = new Map(
  CATEGORY_GROUP_DEFS.map((g) => [g.slug, g.name]),
)
const COLOR_NAME: ReadonlyMap<string, string> = new Map(
  COLOR_FAMILY_DEFS.map((c) => [c.slug, c.name]),
)

export function categoryGroupName(slug: string): string {
  return GROUP_NAME.get(slug) ?? humanizeSlug(slug)
}

export function colorFamilyName(slug: string): string {
  return COLOR_NAME.get(slug) ?? humanizeSlug(slug)
}

/** `quiet-luxury` → `Quiet luxury`. */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
