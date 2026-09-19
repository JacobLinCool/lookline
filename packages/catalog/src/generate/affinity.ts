/**
 * Aesthetic affinity (CATALOG_SPEC §3.2 scoring, §3.4 weight derivation, primary/secondary
 * selection and evidence). No random draw: the primary emerges from the attributes with a
 * home-brand bias.
 */
import { AESTHETICS, COLORS, FITS, MATERIALS, PATTERNS, findSubcategory } from '../taxonomy'
import {
  AESTHETIC_COLORS,
  AESTHETIC_DEPT_MULT,
  AFFINITY_TERM_WEIGHTS,
  COLOR_SLUG_FAMILY,
  HOME_BRAND_BIAS,
  NEIGHBOURS,
  SUBCATEGORY_GROUP,
  type AestheticSlug,
} from '../taxonomy/aesthetics'
import type { AestheticDef, CategoryGroup, ColorFamily, Department, GeneratedBrand } from '../types'
import { generateBrands } from './brands'

/** Seed used for the fallback brand list of `explainAesthetics` (home aesthetics do not depend on it). */
const DEFAULT_BRANDS_SEED = 20260918

export interface AffinityInput {
  subcategory: string
  /** Derived from the subcategory when omitted. */
  categoryGroup?: CategoryGroup | string | null
  /** Colour slug (`optic-white`) or display name (`Optic White`). */
  color: string
  /** Derived from the colour slug when omitted. */
  colorFamily?: ColorFamily | string | null
  material: string
  pattern: string
  fit?: string | null
  silhouette?: string | null
  department: Department
}

export interface AffinityBrand {
  name?: string
  homeAesthetics: readonly string[]
  /** Parallel to `homeAesthetics`; defaults to .6/.4 (two) or 1 (one). */
  homeWeights?: readonly number[]
}

/** The five affinity terms of one aesthetic plus its raw/home/score values. */
export interface AffinityTerms {
  slug: string
  cat: number
  col: number
  mat: number
  pat: number
  fit: number
  raw: number
  home: number
  deptMult: number
  score: number
}

export interface AestheticEvidence {
  slug: string
  weight: number
  evidence: string[]
}

export interface AffinityResult {
  primary: string
  secondary: string | null
  /** Kept aesthetics (1–5) → weight in [0.15, 1]. */
  weights: Record<string, number>
  /** Kept slugs: primary first, then by weight desc (ties → lower dim). */
  aesthetics: string[]
  /** Evidence strings per kept aesthetic (every kept aesthetic has ≥ 1). */
  evidence: Record<string, string[]>
  /** All 32 term rows in dim order. */
  terms: AffinityTerms[]
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const round3 = (x: number): number => Math.round(x * 1000) / 1000

export function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Home weight per aesthetic slug for a brand (§4.1/§4.3 defaults when `homeWeights` is absent). */
export function homeWeightsOf(brand: AffinityBrand): Map<string, number> {
  const out = new Map<string, number>()
  const n = brand.homeAesthetics.length
  brand.homeAesthetics.forEach((slug, i) => {
    const w = brand.homeWeights?.[i] ?? (n === 2 ? (i === 0 ? 0.6 : 0.4) : n > 0 ? 1 / n : 0)
    out.set(slug, w)
  })
  return out
}

/** §3.2 term scores of one aesthetic for a product. */
export function affinityTerms(a: AestheticDef, input: AffinityInput, home = 0): AffinityTerms {
  const group = (input.categoryGroup ??
    SUBCATEGORY_GROUP[input.subcategory] ??
    null) as CategoryGroup | null
  const colorSlug = toSlug(input.color)
  const family = (input.colorFamily ?? COLOR_SLUG_FAMILY[colorSlug] ?? null) as ColorFamily | null
  const f = a.favours
  const cat = f.subcategories.includes(input.subcategory)
    ? 1
    : group && f.categoryGroups.includes(group)
      ? 0.5
      : 0
  const favouredColours = AESTHETIC_COLORS[a.slug as AestheticSlug] ?? []
  const col = favouredColours.includes(colorSlug)
    ? 1
    : family && f.colorFamilies.includes(family)
      ? 0.5
      : 0
  const mat = f.materials.includes(input.material) ? 1 : 0.25
  const pat = f.patterns.includes(input.pattern) ? 1 : input.pattern === 'solid' ? 0.5 : 0
  const fit =
    (input.fit && f.fits.includes(input.fit)) ||
    (input.silhouette && f.fits.includes(input.silhouette))
      ? 1
      : 0.4
  const W = AFFINITY_TERM_WEIGHTS
  const raw = W.category * cat + W.colour * col + W.material * mat + W.pattern * pat + W.fit * fit
  const deptMult = AESTHETIC_DEPT_MULT[a.slug as AestheticSlug]?.[input.department] ?? 0
  const score = raw * (home > 0 ? HOME_BRAND_BIAS.home : HOME_BRAND_BIAS.other) * deptMult
  return { slug: a.slug, cat, col, mat, pat, fit, raw, home, deptMult, score }
}

const SILHOUETTE_NAMES: Readonly<Record<string, string>> = {
  'a-line': 'A-Line',
  bodycon: 'Bodycon',
  shift: 'Shift',
  'fit-and-flare': 'Fit-and-Flare',
  wrap: 'Wrap',
  slip: 'Slip',
  column: 'Column',
  tiered: 'Tiered',
  pencil: 'Pencil',
  pleated: 'Pleated',
}

const titleCase = (slug: string): string =>
  slug
    .split('-')
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ')

function subcategoryName(slug: string): string {
  return findSubcategory(slug)?.name ?? titleCase(slug)
}
function colorName(input: string): string {
  const slug = toSlug(input)
  const found = COLORS.find((c) => toSlug(c.name) === slug)
  return found?.name ?? (input === slug ? titleCase(slug) : input)
}
function materialName(slug: string): string {
  return MATERIALS.find((m) => m.slug === slug)?.name ?? titleCase(slug)
}
function patternName(slug: string): string {
  return PATTERNS.find((p) => p.slug === slug)?.name ?? titleCase(slug)
}
function fitName(slug: string): string {
  return FITS.find((f) => f.slug === slug)?.name ?? SILHOUETTE_NAMES[slug] ?? titleCase(slug)
}

/** Evidence strings (§3.4): terms whose weighted contribution ≥ 0.10, plus the brand when home > 0. */
export function evidenceFor(t: AffinityTerms, input: AffinityInput, brandName?: string): string[] {
  const W = AFFINITY_TERM_WEIGHTS
  const out: string[] = []
  if (W.category * t.cat >= 0.1) out.push(`${subcategoryName(input.subcategory)} (category)`)
  if (W.colour * t.col >= 0.1) out.push(`${colorName(input.color)} (colour)`)
  if (W.material * t.mat >= 0.1) out.push(`${materialName(input.material)} (material)`)
  if (W.pattern * t.pat >= 0.1) out.push(`${patternName(input.pattern)} (pattern)`)
  if (W.fit * t.fit >= 0.1) {
    const fit = input.fit ?? input.silhouette
    if (fit) out.push(`${fitName(fit)} (fit)`)
  }
  if (t.home > 0) out.push(`${brandName ?? 'Home brand'} (brand)`)
  return out
}

/** §3.4: weights, primary, secondary and evidence for a product at a brand. */
export function aestheticWeights(input: AffinityInput, brand: AffinityBrand): AffinityResult {
  const homes = homeWeightsOf(brand)
  const terms = AESTHETICS.map((a) => affinityTerms(a, input, homes.get(a.slug) ?? 0))
  const bySlug = new Map(terms.map((t) => [t.slug, t]))

  // Primary: argmax score (ties → lower dim), requiring S_cat > 0, with the two fallbacks.
  let primary: AffinityTerms | undefined
  for (const t of terms) if (!primary || t.score > primary.score) primary = t
  if (!primary || primary.cat <= 0) {
    let best: AffinityTerms | undefined
    for (const slug of brand.homeAesthetics) {
      const t = bySlug.get(slug)
      if (t && t.cat > 0 && (!best || t.score > best.score)) best = t
    }
    primary = best ?? bySlug.get(brand.homeAesthetics[0] ?? '') ?? terms[0]!
  }

  // Secondary: argmax raw over the neighbours (ties → neighbour order), raw ≥ .30, deptMult > 0.
  let secondary: AffinityTerms | null = null
  for (const slug of NEIGHBOURS[primary.slug as AestheticSlug] ?? []) {
    const t = bySlug.get(slug)
    if (t && (!secondary || t.raw > secondary.raw)) secondary = t
  }
  if (secondary && !(secondary.raw >= 0.3 && secondary.deptMult > 0)) secondary = null

  // Weights: raw + .15·home, floors for primary/secondary, drop < .15, keep the top 5. Weights
  // are rounded to 3 dp and every non-primary weight is capped just below the primary so the
  // primary is the strict argmax of dims 0–31 (§14 vector.test.ts) even when a non-home
  // aesthetic has a higher raw affinity.
  const weighted = terms.map((t, dim) => {
    let w = clamp01(t.raw + HOME_BRAND_BIAS.homeWeightBonus * t.home)
    if (t.slug === primary!.slug) w = Math.max(w, 0.85)
    if (secondary && t.slug === secondary.slug) w = Math.max(w, 0.55)
    return { t, dim, w: round3(w) }
  })
  const primaryW = weighted.find((x) => x.t.slug === primary!.slug)?.w ?? 0.85
  for (const x of weighted) {
    if (x.t.slug !== primary.slug && x.w >= primaryW) x.w = round3(primaryW - 0.01)
    if (x.w < 0.15) x.w = 0
  }
  const kept = weighted
    .filter((x) => x.w > 0)
    .toSorted((a, b) => b.w - a.w || a.dim - b.dim)
    .slice(0, 5)
  const primaryIndex = kept.findIndex((x) => x.t.slug === primary!.slug)
  if (primaryIndex > 0) kept.unshift(...kept.splice(primaryIndex, 1))
  if (primaryIndex < 0) kept.unshift({ t: primary, dim: -1, w: 0.85 })

  const weights: Record<string, number> = {}
  const evidence: Record<string, string[]> = {}
  for (const { t, w } of kept) {
    weights[t.slug] = w
    evidence[t.slug] = evidenceFor(t, input, brand.name)
  }
  return {
    primary: primary.slug,
    secondary: secondary?.slug ?? null,
    weights,
    aesthetics: kept.map((x) => x.t.slug),
    evidence,
    terms,
  }
}

export type ExplainableProduct = {
  subcategory: string
  categoryGroup?: string | null
  colorName: string
  colorFamily?: string | null
  material: string
  pattern: string
  fit?: string | null
  silhouette?: string | null
  brandId: number
  department: Department
  styleVector?: readonly number[] | null
}

let defaultBrands: GeneratedBrand[] | undefined

/**
 * `explainAesthetics(product, brands?)`: for each non-zero aesthetic of the product, its weight
 * (from `styleVector` dims 0–31 when present, else recomputed) and the evidence strings of §3.4.
 */
export function explainAesthetics(
  p: ExplainableProduct,
  brands?: readonly GeneratedBrand[],
): AestheticEvidence[] {
  const list = brands ?? (defaultBrands ??= generateBrands(DEFAULT_BRANDS_SEED))
  const brand = list.find((b) => b.id === p.brandId)
  const affinityBrand: AffinityBrand = brand
    ? {
        name: brand.name,
        homeAesthetics: brand.homeAesthetics ?? [],
        homeWeights: (brand as Partial<{ homeWeights: number[] }>).homeWeights,
      }
    : { homeAesthetics: [] }
  const result = aestheticWeights(
    {
      subcategory: p.subcategory,
      categoryGroup: p.categoryGroup ?? null,
      color: p.colorName,
      colorFamily: p.colorFamily ?? null,
      material: p.material,
      pattern: p.pattern,
      fit: p.fit ?? null,
      silhouette: p.silhouette ?? null,
      department: p.department,
    },
    affinityBrand,
  )
  const v = p.styleVector && p.styleVector.length >= 32 ? p.styleVector : null
  return result.aesthetics.map((slug) => {
    const index = AESTHETICS.find((a) => a.slug === slug)?.index ?? -1
    const stored = v && index >= 0 ? (v[index] ?? 0) : 0
    return {
      slug,
      weight: stored > 0 ? stored : result.weights[slug]!,
      evidence: result.evidence[slug] ?? [],
    }
  })
}
