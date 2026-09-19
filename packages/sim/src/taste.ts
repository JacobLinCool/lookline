/**
 * Hidden taste vectors: aesthetics from a cluster archetype (plus a neighbour and a stray tag),
 * colour families from the catalog colour prior of the primaries, axes from the engine's axis
 * prior with persona noise. The group block carries the persona's category propensity (never
 * used for similarity). Also the block-weighted cosine used to match articles to a taste.
 */
import {
  AESTHETICS,
  AESTHETIC_COLOR_PRIOR,
  AXES,
  CATEGORY_GROUPS,
  COLOR_FAMILIES,
  STYLE_DIMENSIONS,
  axisIndex,
  categoryGroupIndex,
  colorFamilyIndex,
  neighboursOf,
  zeroVector,
  type Axis,
  type CategoryGroup,
  type ColorFamily,
  type Rng,
} from '@lookline/catalog'
import type { Department } from '@lookline/db'

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Axis prior per aesthetic: the catalog's `AestheticDef.axes` (trendiness / formality / boldness)
 * with 0.5 for the other axes. The engine keeps a richer table in `src/constants`, which the
 * engine barrel does not export (see REQUESTS.md).
 */
export const AESTHETIC_AXIS_PRIOR: Readonly<Record<string, Readonly<Record<Axis, number>>>> =
  Object.fromEntries(
    AESTHETICS.map((a) => [
      a.slug,
      Object.fromEntries(AXES.map((axis) => [axis, clamp01(a.axes[axis] ?? 0.5)])) as Record<
        Axis,
        number
      >,
    ]),
  )

/** Block weights of the taste cosine (colours carry it, axes soften, groups ignored). */
export const TASTE_BLOCK_WEIGHTS: Readonly<Record<'colors' | 'axes', number>> = {
  colors: 1,
  axes: 0.6,
}

/** Category-group propensity per department (sums to 1), used for purchase group choice. */
export const GROUP_PRIOR: Readonly<Record<Department, Partial<Record<CategoryGroup, number>>>> = {
  women: {
    tops: 0.22,
    bottoms: 0.14,
    dresses: 0.12,
    outerwear: 0.1,
    footwear: 0.12,
    bags: 0.08,
    accessories: 0.07,
    jewelry: 0.06,
    activewear: 0.04,
    swimwear: 0.01,
    loungewear: 0.02,
    tailoring: 0.02,
  },
  men: {
    tops: 0.26,
    bottoms: 0.18,
    outerwear: 0.13,
    footwear: 0.16,
    bags: 0.06,
    accessories: 0.08,
    jewelry: 0.02,
    activewear: 0.06,
    swimwear: 0.01,
    loungewear: 0.02,
    tailoring: 0.02,
  },
  unisex: {
    tops: 0.26,
    bottoms: 0.16,
    outerwear: 0.13,
    footwear: 0.15,
    bags: 0.08,
    accessories: 0.09,
    jewelry: 0.03,
    activewear: 0.06,
    swimwear: 0.01,
    loungewear: 0.02,
    tailoring: 0.01,
  },
  kids: {
    tops: 0.3,
    bottoms: 0.2,
    dresses: 0.08,
    outerwear: 0.12,
    footwear: 0.15,
    accessories: 0.05,
    activewear: 0.06,
    swimwear: 0.02,
    loungewear: 0.02,
  },
}

export interface TasteInput {
  primaries: readonly [string, string]
  department: Department
  rng: Rng
  /** Extra aesthetic to push (trend carriers), weight 0.5. */
  extra?: string | null
}

/** Build a hidden taste vector. Consumes a fixed number of rng draws (12 + 8 + 1). */
export function buildTasteVector(input: TasteInput): number[] {
  const { rng, department } = input
  const [a1, a2] = input.primaries
  const v = zeroVector()

  // colours: max-merged prior of the primaries, a neighbour and the extra, one stray family
  const neighbours = neighboursOf(a1)
  const nb = neighbours.length > 0 ? rng.pick(neighbours) : a2
  const merge = (slug: string, scale: number): void => {
    const prior = AESTHETIC_COLOR_PRIOR[slug as keyof typeof AESTHETIC_COLOR_PRIOR]
    if (!prior) return
    for (const [family, w] of Object.entries(prior)) {
      const i = colorFamilyIndex(family as ColorFamily)
      if (i >= 0 && typeof w === 'number') v[i] = Math.max(v[i] ?? 0, clamp01(w * scale))
    }
  }
  merge(a1, 1)
  merge(a2, rng.float(0.55, 0.8))
  merge(nb, rng.float(0.25, 0.45))
  if (input.extra) merge(input.extra, 0.55)
  const strayFamily = COLOR_FAMILIES[rng.int(0, COLOR_FAMILIES.length - 1)]!
  const fi = colorFamilyIndex(strayFamily)
  v[fi] = Math.max(v[fi] ?? 0, rng.float(0.2, 0.4))

  // axes: mean of the primaries' prior + N(0, .08) (8 draws)
  for (const axis of AXES) {
    const p1 = AESTHETIC_AXIS_PRIOR[a1]?.[axis] ?? 0.5
    const p2 = AESTHETIC_AXIS_PRIOR[a2]?.[axis] ?? 0.5
    v[axisIndex(axis)] = clamp01((p1 + p2) / 2 + rng.normal(0, 0.08))
  }

  // groups: department propensity
  const prior = GROUP_PRIOR[department]
  for (const group of CATEGORY_GROUPS) v[categoryGroupIndex(group)] = prior[group] ?? 0
  return v
}

/** Weighted copy of the colour and axis blocks (dims [0, 20)), L2-normalised. */
const TASTE_DIMS = 20
export function tasteKey(v: readonly number[]): Float64Array {
  const out = new Float64Array(TASTE_DIMS)
  let norm = 0
  for (let i = 0; i < TASTE_DIMS; i++) {
    const w = i < 12 ? TASTE_BLOCK_WEIGHTS.colors : TASTE_BLOCK_WEIGHTS.axes
    const x = (v[i] ?? 0) * w
    out[i] = x
    norm += x * x
  }
  if (norm > 0) {
    const inv = 1 / Math.sqrt(norm)
    for (let i = 0; i < TASTE_DIMS; i++) out[i] = (out[i] ?? 0) * inv
  }
  return out
}

/** Cosine of two `tasteKey` vectors. */
export function keyDot(a: Float64Array, b: Float64Array): number {
  let s = 0
  for (let i = 0; i < TASTE_DIMS; i++) s += (a[i] ?? 0) * (b[i] ?? 0)
  return s
}

/** Block-weighted cosine between two style vectors (colours and axes only). */
export function tasteSimilarity(a: readonly number[], b: readonly number[]): number {
  return keyDot(tasteKey(a), tasteKey(b))
}

export { STYLE_DIMENSIONS }
