/**
 * Per-product attribute sampling (CATALOG_SPEC §1.4, §3.3 boosts, §7.4 step 1) and the secondary
 * colour rules (§7.6). Every draw comes from the `attrs` stream in the documented order.
 */
import {
  AESTHETIC_COLORS,
  COLORS,
  JEANS_WASH_BY_COLOR,
  attributeBoost,
  attributeOptions,
  extraOptions,
  findColor,
} from '../taxonomy'
import type { AestheticSlug } from '../taxonomy/aesthetics'
import type {
  AttributeColumnName,
  AttributeSchema,
  WeightedValue,
} from '../taxonomy/attribute-schemas'
import type { SubcategoryRow } from '../taxonomy/categories'
import type { ColorRow } from '../taxonomy/colors'
import type { PatternRow } from '../taxonomy/patterns'
import type { ColorFamily, Department, Rng } from '../types'

export interface SampledAttributes {
  fit: string | null
  silhouette: string | null
  length: string | null
  neckline: string | null
  sleeve: string | null
  closure: string | null
  /** Schema extras (`attributes` JSON). */
  extras: Record<string, string>
}

const SAMPLED_COLUMNS: readonly AttributeColumnName[] = [
  'silhouette',
  'length',
  'neckline',
  'sleeve',
  'closure',
]

function boosted(
  options: readonly WeightedValue[],
  key: string,
  primary: string,
): Array<readonly [string, number]> {
  return options.map(([v, w]) => [v, w * attributeBoost(primary, key, v)] as const)
}

function drawOption(rng: Rng, options: readonly WeightedValue[], key: string, primary: string) {
  if (options.length === 0) return null
  const items = boosted(options, key, primary)
  return items.some(([, w]) => w > 0) ? rng.weighted(items) : items[0]![0]
}

/** Highest-weight option that passes `allow` (ties → table order), or null. */
function bestOption(options: readonly WeightedValue[], allow: (v: string) => boolean) {
  let best: WeightedValue | undefined
  for (const o of options) if (allow(o[0]) && (!best || o[1] > best[1])) best = o
  return best?.[0] ?? null
}

export interface SampleInput {
  sub: SubcategoryRow
  schema: AttributeSchema
  department: Department
  /** Fixed by the combo (fit for fit schemas, silhouette for skirt/dress schemas). */
  fit: string | null
  silhouette: string | null
  colourSlug: string
  /** Provisional primary aesthetic for the §3.3 boosts. */
  primary: string
}

/** Draw order: silhouette (when not fixed), length, neckline, sleeve, closure, then extras. */
export function sampleAttributes(rng: Rng, input: SampleInput): SampledAttributes {
  const { sub, schema, department, primary } = input
  const columns: Record<AttributeColumnName, string | null> = {
    fit: input.fit,
    silhouette: input.silhouette,
    length: null,
    neckline: null,
    sleeve: null,
    closure: null,
  }
  for (const col of SAMPLED_COLUMNS) {
    if (col === 'silhouette' && input.silhouette !== null) continue
    if (!schema.columns[col]) continue
    columns[col] = drawOption(rng, attributeOptions(schema, col, sub.slug), col, primary)
  }
  const extras: Record<string, string> = {}
  for (const key of Object.keys(schema.extras)) {
    if (key === 'wash' && sub.slug === 'jeans') {
      extras.wash = JEANS_WASH_BY_COLOR[input.colourSlug] ?? 'mid-wash'
      continue
    }
    const value = drawOption(rng, extraOptions(schema, key, sub.slug), key, primary)
    if (value !== null) extras[key] = value
  }

  // Consistency rules (§1.4), in order.
  if (
    columns.sleeve === 'sleeveless' &&
    (columns.neckline === 'turtle' || columns.neckline === 'collar')
  ) {
    const remaining = attributeOptions(schema, 'neckline', sub.slug).filter(
      ([v]) => v !== 'turtle' && v !== 'collar',
    )
    columns.neckline = drawOption(rng, remaining, 'neckline', primary)
  }
  if (
    (columns.fit === 'compression' || columns.fit === 'fitted') &&
    columns.length === 'longline'
  ) {
    columns.length = bestOption(
      attributeOptions(schema, 'length', sub.slug),
      (v) => v !== 'longline',
    )
  }
  if (department === 'kids') {
    if (extras.heel === 'stiletto' || extras.heel === 'kitten') extras.heel = 'block'
    if (extras.rise === 'low') extras.rise = 'mid'
    if (extras.coverage === 'minimal') extras.coverage = 'moderate'
  }
  if (department === 'men') {
    columns.silhouette = null
    if (
      columns.neckline === 'sweetheart' ||
      columns.neckline === 'off-shoulder' ||
      columns.neckline === 'halter'
    ) {
      columns.neckline = bestOption(
        attributeOptions(schema, 'neckline', sub.slug),
        (v) => v !== 'sweetheart' && v !== 'off-shoulder' && v !== 'halter',
      )
    }
  }
  if (extras.hood !== undefined && extras.hood !== 'none') columns.neckline = null
  return { ...columns, extras }
}

// ---------------------------------------------------------------------------
// §7.6 secondary colour
// ---------------------------------------------------------------------------

const RING: readonly ColorFamily[] = [
  'black',
  'grey',
  'white',
  'neutral',
  'brown',
  'red',
  'pink',
  'yellow-orange',
  'green',
  'blue',
  'purple',
]

const LEOPARD_BASES = ['camel', 'tan', 'mustard'] as const

const colour = (slug: string): ColorRow => {
  const c = findColor(slug)
  if (!c) throw new Error(`@lookline/catalog: unknown colour ${slug}`)
  return c
}

export interface SecondaryColorResult {
  secondary: ColorRow | null
  /** Leopard forces the rendered base colour; the dupKey keeps the selected one. */
  base: ColorRow
}

/**
 * Draws (stream `attrs`, after the extras): one `chance(.2)` for solid footwear/bags; one `pick`
 * for `harmony` patterns with candidates. Everything else is rule-based.
 */
export function secondaryColorFor(
  rng: Rng,
  pattern: PatternRow,
  primary: ColorRow,
  group: string,
  primaryAesthetic: string,
): SecondaryColorResult {
  const L = primary.lightness
  switch (pattern.secondary) {
    case 'none': {
      if ((group === 'footwear' || group === 'bags') && rng.chance(0.2)) {
        return { secondary: colour(L === 'D' ? 'ivory' : 'jet-black'), base: primary }
      }
      return { secondary: null, base: primary }
    }
    case 'contrast': {
      if (L === 'D') return { secondary: colour('optic-white'), base: primary }
      if (L === 'L') {
        const navy = primaryAesthetic === 'preppy' || primaryAesthetic === 'coastal'
        return { secondary: colour(navy ? 'navy' : 'jet-black'), base: primary }
      }
      return { secondary: colour('ivory'), base: primary }
    }
    case 'contrast-soft': {
      if (L === 'D') return { secondary: colour('ivory'), base: primary }
      if (L === 'L') return { secondary: colour('charcoal'), base: primary }
      return { secondary: colour('oatmeal'), base: primary }
    }
    case 'white':
      return { secondary: colour('optic-white'), base: primary }
    case 'harmony': {
      const favoured = (AESTHETIC_COLORS[primaryAesthetic as AestheticSlug] ?? [])
        .map((s) => findColor(s))
        .filter((c): c is ColorRow => c !== undefined && c.family !== primary.family)
      if (favoured.length > 0) return { secondary: rng.pick(favoured), base: primary }
      const at = RING.indexOf(primary.family)
      const next = RING[(at + 1) % RING.length]!
      const first = COLORS.find((c) => c.family === next)!
      return { secondary: first, base: primary }
    }
    case 'leopard': {
      const at = COLORS.indexOf(primary)
      let best = colour(LEOPARD_BASES[0])
      let bestDist = Number.POSITIVE_INFINITY
      for (const slug of LEOPARD_BASES) {
        const c = colour(slug)
        const dist = Math.abs(COLORS.indexOf(c) - at)
        if (dist < bestDist) {
          best = c
          bestDist = dist
        }
      }
      return { secondary: colour('jet-black'), base: best }
    }
    case 'camo':
      return { secondary: colour('olive'), base: primary }
    default:
      return { secondary: null, base: primary }
  }
}
