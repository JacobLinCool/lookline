/**
 * In-memory catalog subset for the evaluation harness (ENGINE_SPEC §4.5).
 *
 * `buildEvalCatalog` uses the catalog's `generateProduct(i, seed, brands)` when it is available and
 * falls back to a lightweight taxonomy-driven generator (`syntheticProduct`) otherwise — the
 * catalog generator was still a stub when this module was written. Both paths are pure functions
 * of `(index, seed, brands)`.
 */
import {
  AESTHETICS,
  AESTHETIC_COLORS,
  AESTHETIC_PRIOR,
  COLORS,
  FITS,
  MATERIALS,
  NEIGHBOURS,
  SUBCATEGORIES,
  aestheticDeptMult,
  createRng,
  generateBrands,
  generateProduct,
  hashSeed,
  toStyleVector,
  type AestheticSlug,
  type Axis,
  type CategoryGroup,
  type ColorFamily,
  type GeneratedProduct,
} from '@lookline/catalog'
import type { BrandTier, Department } from '@lookline/db'
import { clamp01 } from './vector'

export type EvalBrand = ReturnType<typeof generateBrands>[number]

export interface EvalProduct {
  id: number
  name: string
  brandId: number
  brandName: string
  department: Department
  categoryGroup: CategoryGroup
  subcategory: string
  price: number
  /** In [0, 100]. */
  popularity: number
  tier: BrandTier
  colorFamily: ColorFamily
  aesthetics: string[]
  vector: Float64Array
}

export type EvalCatalogSource = 'generated' | 'synthetic'

export interface EvalCatalog {
  products: EvalProduct[]
  brands: EvalBrand[]
  source: EvalCatalogSource
}

const TIER_BASE: Readonly<Record<BrandTier, number>> = {
  budget: 0.1,
  mid: 0.35,
  premium: 0.65,
  luxury: 0.9,
}
const TIER_FORMALITY: Readonly<Record<BrandTier, number>> = {
  budget: -0.03,
  mid: 0,
  premium: 0.03,
  luxury: 0.06,
}
const DEPT_PICK: Readonly<Record<Department, number>> = {
  women: 1,
  men: 1,
  unisex: 0.6,
  kids: 0.25,
}

const COLOR_BY_SLUG = new Map(COLORS.map((c) => [c.slug, c]))
const MATERIAL_BY_SLUG = new Map(MATERIALS.map((m) => [m.slug, m]))
const FIT_BY_SLUG = new Map(FITS.map((f) => [f.slug, f]))

/** Taxonomy-driven stand-in for `generateProduct` (same signature, same purity). */
export function syntheticProduct(
  index: number,
  seed: number,
  brands: readonly EvalBrand[],
): EvalProduct {
  const rng = createRng(hashSeed(seed, 'eval-product', index))
  const brand = rng.weighted(brands.map((b) => [b, b.size] as const))
  const sub = rng.pick(SUBCATEGORIES)
  const department = rng.weighted(sub.departments.map((d) => [d, DEPT_PICK[d]] as const))

  // Primary aesthetic: favours the subcategory (or its group), the department and the brand's home.
  const home = new Set(brand.homeAesthetics)
  const weights = AESTHETICS.map((a) => {
    const cat = a.favours.subcategories.includes(sub.slug)
      ? 1
      : a.favours.categoryGroups.includes(sub.group)
        ? 0.45
        : 0.05
    const prior = (AESTHETIC_PRIOR[a.slug as AestheticSlug] ?? 1 / 32) * 32
    return [
      a,
      cat * aestheticDeptMult(a.slug, department) * (home.has(a.slug) ? 1 : 0.6) * prior,
    ] as const
  })
  const total = weights.reduce((s, [, w]) => s + w, 0)
  const primary =
    total > 0
      ? rng.weighted(weights)
      : (AESTHETICS.find((a) => a.slug === 'normcore') ?? AESTHETICS[0]!)
  const aesthetics: Record<string, number> = { [primary.slug]: rng.float(0.85, 1) }
  const neighbours = (NEIGHBOURS[primary.slug as AestheticSlug] ?? []).filter(
    (n) => aestheticDeptMult(n, department) > 0,
  )
  const hasSecondary = rng.chance(0.65)
  const secondary = neighbours.length > 0 ? rng.pick(neighbours) : null
  if (hasSecondary && secondary) aesthetics[secondary] = rng.float(0.55, 0.72)
  const third = rng.pick(AESTHETICS)
  const hasThird = rng.chance(0.3)
  if (hasThird && !aesthetics[third.slug] && aestheticDeptMult(third.slug, department) > 0) {
    aesthetics[third.slug] = rng.float(0.15, 0.3)
  }

  // Colour, material, fit
  const favouredColours = (AESTHETIC_COLORS[primary.slug as AestheticSlug] ?? [])
    .map((slug) => COLOR_BY_SLUG.get(slug))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
  const useFavouredColour = rng.chance(0.65)
  const colour =
    useFavouredColour && favouredColours.length > 0 ? rng.pick(favouredColours) : rng.pick(COLORS)
  const secondaryColour = rng.pick(COLORS)
  const hasSecondaryColour = rng.chance(0.35) && secondaryColour.family !== colour.family
  const favouredMaterials = primary.favours.materials
    .map((slug) => MATERIAL_BY_SLUG.get(slug))
    .filter((m): m is NonNullable<typeof m> => m !== undefined)
  const useFavouredMaterial = rng.chance(0.7)
  const material =
    useFavouredMaterial && favouredMaterials.length > 0
      ? rng.pick(favouredMaterials)
      : rng.pick(MATERIALS)
  const favouredFits = primary.favours.fits
    .map((slug) => FIT_BY_SLUG.get(slug))
    .filter((f): f is NonNullable<typeof f> => f !== undefined)
  const useFavouredFit = rng.chance(0.6)
  const fit = useFavouredFit && favouredFits.length > 0 ? rng.pick(favouredFits) : rng.pick(FITS)

  // Price and popularity
  const price = Math.max(
    50,
    Math.round((sub.basePrice * brand.priceMultiplier * Math.exp(rng.normal(0, sub.sigma))) / 10) *
      10,
  )
  const popularity = clamp01(rng.float(0, 1) ** 2 * (0.5 + 0.5 * brand.popularity)) * 100

  // Axes (CATALOG_SPEC §8.2, simplified)
  const fAdj = primary.axes.formality ?? 0
  const bold = primary.axes.boldness ?? 0.4
  const trend = primary.axes.trendiness ?? 0.5
  const lnBase = Math.log(0.3 * sub.basePrice)
  const lnTop = Math.log(40 * sub.basePrice)
  const axes: Partial<Record<Axis, number>> = {
    formality: clamp01(
      sub.formality + fAdj + colour.formalityAdj + TIER_FORMALITY[brand.tier] + rng.normal(0, 0.04),
    ),
    warmth: clamp01(0.6 * material.warmth + 0.25 * sub.coverage + rng.normal(0, 0.05)),
    boldness: clamp01(0.45 * colour.boldness + 0.2 * bold + 0.35 * rng.float(0, 1)),
    structure: clamp01(0.6 * sub.structure + 0.4 * fit.structure),
    'price-tier': clamp01(
      0.5 * TIER_BASE[brand.tier] + 0.5 * clamp01((Math.log(price) - lnBase) / (lnTop - lnBase)),
    ),
    coverage: clamp01(sub.coverage + rng.normal(0, 0.05)),
    texture: clamp01(0.7 * material.texture + 0.3 * rng.float(0, 1)),
    trendiness: clamp01(0.55 * trend + 0.2 * brand.trend + 0.25 * rng.float(0, 1)),
  }

  const vector = toStyleVector({
    aesthetics,
    colorFamily: colour.family,
    secondaryColorFamily: hasSecondaryColour ? secondaryColour.family : null,
    axes,
    categoryGroup: sub.group,
  })
  const tags = Object.entries(aesthetics)
    .toSorted((a, b) => b[1] - a[1])
    .map(([slug]) => slug)
  return {
    id: index,
    name: `${brand.name} ${colour.name} ${sub.name}`,
    brandId: brand.id,
    brandName: brand.name,
    department,
    categoryGroup: sub.group,
    subcategory: sub.slug,
    price,
    popularity,
    tier: brand.tier,
    colorFamily: colour.family,
    aesthetics: tags,
    vector: Float64Array.from(vector),
  }
}

function fromGenerated(p: GeneratedProduct, brandName: string): EvalProduct {
  return {
    id: p.id,
    name: p.name,
    brandId: p.brandId,
    brandName,
    department: p.department,
    categoryGroup: p.categoryGroup as CategoryGroup,
    subcategory: p.subcategory,
    price: p.price,
    popularity: Math.max(0, p.popularity ?? 0),
    tier: p.tier,
    colorFamily: p.colorFamily as ColorFamily,
    aesthetics: p.aesthetics ?? [],
    vector: Float64Array.from(p.styleVector),
  }
}

/** True when the catalog's `generateProduct` is implemented (probe on index 1). */
function probeGenerator(seed: number, brands: readonly EvalBrand[]): GeneratedProduct | null {
  try {
    return generateProduct(1, seed, brands)
  } catch {
    return null
  }
}

/** Build `size` products for `seed`; `source` says which generator produced them. */
export function buildEvalCatalog(
  size: number,
  seed: number,
  source: 'auto' | EvalCatalogSource = 'auto',
): EvalCatalog {
  const brands = generateBrands(seed)
  const brandName = new Map(brands.map((b) => [b.id, b.name]))
  const products: EvalProduct[] = []
  let first: GeneratedProduct | null = null
  if (source === 'generated' || source === 'auto') first = probeGenerator(seed, brands)
  if (source === 'generated' && !first) {
    throw new Error(
      '@lookline/engine: generateProduct is not available for catalogSource "generated"',
    )
  }
  if (first) {
    products.push(fromGenerated(first, brandName.get(first.brandId) ?? `Brand ${first.brandId}`))
    for (let i = 2; i <= size; i++) {
      const p = generateProduct(i, seed, brands)
      products.push(fromGenerated(p, brandName.get(p.brandId) ?? `Brand ${p.brandId}`))
    }
    return { products, brands, source: 'generated' }
  }
  for (let i = 1; i <= size; i++) products.push(syntheticProduct(i, seed, brands))
  return { products, brands, source: 'synthetic' }
}
