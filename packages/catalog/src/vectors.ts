/**
 * Style-vector construction and helpers (CATALOG_SPEC §8.1, §8.3) plus the outfit-compatibility
 * data the engine's outfit solver imports (§8.4). Layout: docs/ARCHITECTURE.md.
 */
import { AESTHETICS, AXES, CATEGORY_GROUPS, COLOR_FAMILIES } from './taxonomy'
import type { Axis, CategoryGroup, ColorFamily, StyleVectorInput, VectorDescription } from './types'

export const STYLE_DIMENSIONS = 64

export type StyleBlock = 'aesthetics' | 'colors' | 'axes' | 'groups'

/** Half-open `[start, end)` ranges of the four blocks. */
export const STYLE_BLOCKS: Readonly<Record<StyleBlock, readonly [number, number]>> = {
  aesthetics: [0, 32],
  colors: [32, 44],
  axes: [44, 52],
  groups: [52, 64],
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

const AESTHETIC_INDEX: ReadonlyMap<string, number> = new Map(
  AESTHETICS.map((a) => [a.slug, a.index]),
)

export function aestheticIndex(slug: string): number {
  return AESTHETIC_INDEX.get(slug) ?? -1
}
export function colorFamilyIndex(family: ColorFamily): number {
  return 32 + COLOR_FAMILIES.indexOf(family)
}
export function axisIndex(axis: Axis): number {
  return 44 + AXES.indexOf(axis)
}
export function categoryGroupIndex(group: CategoryGroup): number {
  return 52 + CATEGORY_GROUPS.indexOf(group)
}
export function zeroVector(): number[] {
  return Array.from({ length: STYLE_DIMENSIONS }, () => 0)
}

/** §8.1: sparse aesthetic block, colour block (primary 1.0 / secondary ≥ 0.4), 8 axes, group one-hot. */
export function toStyleVector(input: StyleVectorInput): number[] {
  const v = zeroVector()
  for (const [slug, weight] of Object.entries(input.aesthetics)) {
    const i = aestheticIndex(slug)
    if (i >= 0) v[i] = clamp01(weight)
  }
  const primary = colorFamilyIndex(input.colorFamily)
  if (primary >= 32) v[primary] = 1
  if (input.secondaryColorFamily && input.secondaryColorFamily !== input.colorFamily) {
    const secondary = colorFamilyIndex(input.secondaryColorFamily)
    if (secondary >= 32) v[secondary] = Math.max(v[secondary] ?? 0, 0.4)
  }
  for (const axis of AXES) v[axisIndex(axis)] = clamp01(input.axes[axis] ?? 0)
  if (input.categoryGroup) {
    const g = categoryGroupIndex(input.categoryGroup)
    if (g >= 52) v[g] = 1
  }
  return v
}

/** Unit L2 vector; the zero vector stays zero. */
export function normalizeVector(v: readonly number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  if (sum === 0) return v.slice()
  const inv = 1 / Math.sqrt(sum)
  return v.map((x) => x * inv)
}

/** Cosine over `[from, to)`; 0 when either sub-norm is 0. */
export function cosineRange(
  a: readonly number[],
  b: readonly number[],
  from: number,
  to: number,
): number {
  let dot = 0
  let na = 0
  let nb = 0
  const end = Math.min(to, a.length, b.length)
  for (let i = from; i < end; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

/** dot / (‖a‖‖b‖); 0 when either vector is zero. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  return cosineRange(a, b, 0, Math.max(a.length, b.length))
}

/** Weighted mean (equal weights by default) then `clamp01` per dim. Empty input ⇒ zero vector. */
export function blendVectors(
  vectors: ReadonlyArray<readonly number[]>,
  weights?: readonly number[],
): number[] {
  const out = zeroVector()
  if (vectors.length === 0) return out
  const w = vectors.map((_, i) => weights?.[i] ?? 1)
  let total = 0
  for (const x of w) total += x
  if (total === 0) return out
  for (let k = 0; k < vectors.length; k++) {
    const v = vectors[k]!
    const wk = w[k]! / total
    for (let i = 0; i < STYLE_DIMENSIONS; i++) out[i] = (out[i] ?? 0) + wk * (v[i] ?? 0)
  }
  for (let i = 0; i < STYLE_DIMENSIONS; i++) out[i] = clamp01(out[i] ?? 0)
  return out
}

/** Top-5 aesthetics with names, non-zero colour families, the 8 axes, non-zero groups. */
export function describeVector(v: readonly number[]): VectorDescription {
  const aesthetics = AESTHETICS.map((a) => ({
    slug: a.slug,
    name: a.name,
    weight: v[a.index] ?? 0,
  }))
    .filter((a) => a.weight > 0)
    .toSorted((x, y) => y.weight - x.weight || aestheticIndex(x.slug) - aestheticIndex(y.slug))
    .slice(0, 5)
  const colorFamilies = COLOR_FAMILIES.map((family) => ({
    family,
    weight: v[colorFamilyIndex(family)] ?? 0,
  }))
    .filter((c) => c.weight > 0)
    .toSorted((x, y) => y.weight - x.weight)
  const axes = Object.fromEntries(AXES.map((axis) => [axis, v[axisIndex(axis)] ?? 0])) as Record<
    Axis,
    number
  >
  const categoryGroups = CATEGORY_GROUPS.map((group) => ({
    group,
    weight: v[categoryGroupIndex(group)] ?? 0,
  }))
    .filter((g) => g.weight > 0)
    .toSorted((x, y) => y.weight - x.weight)
  return { aesthetics, colorFamilies, axes, categoryGroups }
}

/**
 * Scale each block by a weight (missing = 1). An in-process rerank helper only — pgvector cosine
 * runs on the raw stored vector.
 */
export function weightStyleVector(
  v: readonly number[],
  w: Partial<Record<StyleBlock, number>>,
): number[] {
  const out = v.slice(0, STYLE_DIMENSIONS)
  while (out.length < STYLE_DIMENSIONS) out.push(0)
  for (const block of Object.keys(STYLE_BLOCKS) as StyleBlock[]) {
    const weight = w[block] ?? 1
    if (weight === 1) continue
    const [from, to] = STYLE_BLOCKS[block]
    for (let i = from; i < to; i++) out[i] = (out[i] ?? 0) * weight
  }
  return out
}

/**
 * Rebuild the `StyleVectorInput` of a product from its stored vector and columns, so that
 * `toStyleVector(productStyleInput(p))` deep-equals `p.styleVector` for generated articles.
 */
export function productStyleInput(p: {
  styleVector: readonly number[]
  colorFamily: string
  categoryGroup?: string | null
}): StyleVectorInput {
  const v = p.styleVector
  const aesthetics: Record<string, number> = {}
  for (const a of AESTHETICS) {
    const w = v[a.index] ?? 0
    if (w > 0) aesthetics[a.slug] = w
  }
  const colorFamily = p.colorFamily as ColorFamily
  let secondaryColorFamily: ColorFamily | null = null
  for (const family of COLOR_FAMILIES) {
    if (family === colorFamily) continue
    if ((v[colorFamilyIndex(family)] ?? 0) > 0) {
      secondaryColorFamily = family
      break
    }
  }
  const axes: Partial<Record<Axis, number>> = {}
  for (const axis of AXES) axes[axis] = v[axisIndex(axis)] ?? 0
  const categoryGroup = CATEGORY_GROUPS.includes(p.categoryGroup as CategoryGroup)
    ? (p.categoryGroup as CategoryGroup)
    : null
  return { aesthetics, colorFamily, secondaryColorFamily, axes, categoryGroup }
}

// ---------------------------------------------------------------------------
// §8.4 outfit compatibility data
// ---------------------------------------------------------------------------

/** `COLOR_HARMONY[i][j]` for colour families in `COLOR_FAMILIES` order; symmetric. */
export const COLOR_HARMONY: ReadonlyArray<readonly number[]> = [
  [0.8, 0.9, 0.9, 0.85, 0.7, 0.85, 0.75, 0.7, 0.75, 0.85, 0.75, 0.8],
  [0.9, 0.7, 0.85, 0.9, 0.8, 0.8, 0.85, 0.8, 0.8, 0.9, 0.75, 0.8],
  [0.9, 0.85, 0.7, 0.8, 0.6, 0.7, 0.75, 0.6, 0.65, 0.85, 0.7, 0.7],
  [0.85, 0.9, 0.8, 0.75, 0.85, 0.65, 0.8, 0.7, 0.8, 0.8, 0.65, 0.7],
  [0.7, 0.8, 0.6, 0.85, 0.65, 0.55, 0.6, 0.75, 0.75, 0.7, 0.5, 0.7],
  [0.85, 0.8, 0.7, 0.65, 0.55, 0.4, 0.5, 0.5, 0.45, 0.7, 0.45, 0.6],
  [0.75, 0.85, 0.75, 0.8, 0.6, 0.5, 0.55, 0.5, 0.6, 0.65, 0.7, 0.7],
  [0.7, 0.8, 0.6, 0.7, 0.75, 0.5, 0.5, 0.4, 0.6, 0.75, 0.45, 0.6],
  [0.75, 0.8, 0.65, 0.8, 0.75, 0.45, 0.6, 0.6, 0.5, 0.6, 0.5, 0.6],
  [0.85, 0.9, 0.85, 0.8, 0.7, 0.7, 0.65, 0.75, 0.6, 0.7, 0.6, 0.7],
  [0.75, 0.75, 0.7, 0.65, 0.5, 0.45, 0.7, 0.45, 0.5, 0.6, 0.5, 0.65],
  [0.8, 0.8, 0.7, 0.7, 0.7, 0.6, 0.7, 0.6, 0.6, 0.7, 0.65, 0.5],
]

export const FORMALITY_TOLERANCE = 0.25

/** Harmony of two colour families (0.5 for unknown families). */
export function colorHarmony(a: ColorFamily | string, b: ColorFamily | string): number {
  const i = COLOR_FAMILIES.indexOf(a as ColorFamily)
  const j = COLOR_FAMILIES.indexOf(b as ColorFamily)
  if (i < 0 || j < 0) return 0.5
  return COLOR_HARMONY[i]?.[j] ?? 0.5
}

export type SlotRole =
  | 'top'
  | 'bottom'
  | 'one-piece'
  | 'outer'
  | 'shoes'
  | 'bag'
  | 'jewelry'
  | 'accessory'

export interface SlotSpec {
  role: SlotRole
  required: boolean
  /** Category groups the slot draws from. */
  groups: readonly CategoryGroup[]
  /** Optional subcategory restriction (alternatives). */
  subcategories?: readonly string[]
}

/** Slot templates of §8.4. `required: false` slots are the parenthesised optional ones. */
export const SLOT_SETS: Readonly<Record<string, readonly SlotSpec[]>> = {
  casual: [
    { role: 'top', required: true, groups: ['tops'] },
    { role: 'bottom', required: true, groups: ['bottoms'] },
    { role: 'shoes', required: true, groups: ['footwear'] },
    { role: 'outer', required: false, groups: ['outerwear'] },
    { role: 'bag', required: false, groups: ['bags'] },
  ],
  dress: [
    { role: 'one-piece', required: true, groups: ['dresses'] },
    { role: 'shoes', required: true, groups: ['footwear'] },
    { role: 'outer', required: false, groups: ['outerwear'] },
    { role: 'bag', required: false, groups: ['bags'] },
    { role: 'jewelry', required: false, groups: ['jewelry'] },
  ],
  tailored: [
    { role: 'outer', required: true, groups: ['tailoring'], subcategories: ['blazer'] },
    { role: 'top', required: true, groups: ['tailoring'], subcategories: ['dress-shirt'] },
    {
      role: 'bottom',
      required: true,
      groups: ['tailoring'],
      subcategories: ['tailored-trousers', 'pencil-skirt'],
    },
    {
      role: 'shoes',
      required: true,
      groups: ['footwear'],
      subcategories: ['derby', 'pump', 'loafer'],
    },
  ],
  gym: [
    {
      role: 'top',
      required: true,
      groups: ['activewear'],
      subcategories: ['sports-bra', 'performance-tee'],
    },
    {
      role: 'bottom',
      required: true,
      groups: ['activewear'],
      subcategories: ['training-tights', 'running-shorts', 'bike-shorts', 'joggers'],
    },
    { role: 'shoes', required: true, groups: ['footwear'], subcategories: ['running-shoe'] },
  ],
  beach: [
    {
      role: 'top',
      required: true,
      groups: ['swimwear'],
      subcategories: ['bikini-top', 'one-piece'],
    },
    {
      role: 'bottom',
      required: true,
      groups: ['swimwear'],
      subcategories: ['bikini-bottom', 'swim-trunks'],
    },
    { role: 'outer', required: true, groups: ['swimwear'], subcategories: ['cover-up'] },
    {
      role: 'shoes',
      required: true,
      groups: ['footwear'],
      subcategories: ['flat-sandal', 'slide'],
    },
  ],
}

const SUBCATEGORY_ROLE: Readonly<Record<string, SlotRole>> = {
  'sports-bra': 'top',
  'performance-tee': 'top',
  'training-tights': 'bottom',
  'running-shorts': 'bottom',
  'bike-shorts': 'bottom',
  joggers: 'bottom',
  'track-jacket': 'outer',
  'tailored-trousers': 'bottom',
  'pencil-skirt': 'bottom',
  'sheath-dress': 'one-piece',
  jumpsuit: 'one-piece',
  blazer: 'outer',
  waistcoat: 'top',
  'dress-shirt': 'top',
  'two-piece-suit': 'one-piece',
  tuxedo: 'one-piece',
  slipper: 'shoes',
  'bikini-top': 'top',
  'rash-guard': 'top',
  'bikini-bottom': 'bottom',
  'swim-trunks': 'bottom',
  'one-piece': 'one-piece',
  'cover-up': 'outer',
  'pajama-set': 'one-piece',
  nightgown: 'one-piece',
  robe: 'outer',
  sweatpants: 'bottom',
  'lounge-shorts': 'bottom',
}

const GROUP_ROLE: Partial<Record<CategoryGroup, SlotRole>> = {
  tops: 'top',
  bottoms: 'bottom',
  dresses: 'one-piece',
  outerwear: 'outer',
  footwear: 'shoes',
  bags: 'bag',
  jewelry: 'jewelry',
  accessories: 'accessory',
}

/** Slot role of a product (§8.4 role list); `null` when the group has no role. */
export function slotRoleOf(group: CategoryGroup | string, subcategory?: string): SlotRole | null {
  if (subcategory && SUBCATEGORY_ROLE[subcategory]) return SUBCATEGORY_ROLE[subcategory]!
  return GROUP_ROLE[group as CategoryGroup] ?? null
}

export interface PairScoreInput {
  styleVector: readonly number[]
  colorFamily: string
}

/**
 * `0.5·COLOR_HARMONY + 0.3·(1 − min(1, |Δformality| / FORMALITY_TOLERANCE)) + 0.2·aestheticOverlap`
 * where the overlap is the cosine over dims 0–31.
 */
export function pairScore(a: PairScoreInput, b: PairScoreInput): number {
  const f = axisIndex('formality')
  const formA = a.styleVector[f] ?? 0
  const formB = b.styleVector[f] ?? 0
  const formality = 1 - Math.min(1, Math.abs(formA - formB) / FORMALITY_TOLERANCE)
  const overlap = cosineRange(a.styleVector, b.styleVector, 0, 32)
  return 0.5 * colorHarmony(a.colorFamily, b.colorFamily) + 0.3 * formality + 0.2 * overlap
}
