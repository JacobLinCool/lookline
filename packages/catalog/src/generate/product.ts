/**
 * `generateProduct(i, seed, brands, size?)` (CATALOG_SPEC §7.4, §11.1): a pure function of its
 * arguments. Step 0 resolves the plan cell and the cell's combo; steps 1–7 draw from one RNG
 * stream per concern (`attrs`, `season`, `sizes`, `price`, `stock`, `rating`, `text`), each seeded
 * by `hashSeed(seed, label, i)` so adding a draw to one stream never shifts another.
 */
import { createRng, hashSeed } from '../rng'
import {
  ADJACENT_SEASON,
  ATTRIBUTE_SCHEMAS,
  COLORS,
  DEPARTMENTS,
  OCCASIONS,
  SEASONS,
  findAesthetic,
  findSeason,
  occasionScore,
  seasonPriorFor,
} from '../taxonomy'
import type { OccasionRow } from '../taxonomy/occasions'
import type { GeneratedBrand, GeneratedProduct, Season } from '../types'
import { toStyleVector } from '../vectors'
import { aestheticWeights, type AffinityBrand, type AffinityInput } from './affinity'
import { sampleAttributes, secondaryColorFor } from './attributes'
import { computeAxes } from './axes'
import { cellSelection } from './cell'
import { DEFAULT_CATALOG_SIZE } from './constants'
import { drawRating, drawSizes, drawStock } from './inventory'
import { drawProductDescription, drawProductName, productSlug } from './names'
import { createPlan, indexToCell, planSizeFor, slotOf } from './plan'
import { computePrice } from './pricing'
import { resolveSilhouetteId } from './silhouette'

export interface ProductRow {
  product: GeneratedProduct
  /** Release date (§5.5); stored by the seed script, not on `GeneratedProduct`. */
  createdAt: Date
}

const DROP_YEARS: ReadonlyArray<readonly [number, number]> = [
  [2024, 20],
  [2025, 35],
  [2026, 45],
]

/** Launch month (0-based) per season; all-season alternates January / July by product parity. */
function launchMonth(season: Season, i: number): number {
  switch (season) {
    case 'spring':
      return 1
    case 'summer':
      return 4
    case 'autumn':
      return 7
    case 'winter':
      return 10
    default:
      return i % 2 === 0 ? 0 : 6
  }
}

function collectionCode(season: Season, dropYear: number): string {
  const yy = String(dropYear % 100).padStart(2, '0')
  if (season === 'spring' || season === 'summer') return `SS${yy}`
  if (season === 'autumn' || season === 'winter') return `AW${yy}`
  return `CORE${yy}`
}

const DAY_MS = 86_400_000

/** Pure: `{ product, createdAt }` for the 1-based product index `i` (id = i). */
export function generateProductRow(
  i: number,
  seed: number,
  brands: readonly GeneratedBrand[],
  size: number = DEFAULT_CATALOG_SIZE,
): ProductRow {
  if (!Number.isInteger(i) || i < 1 || i > size) {
    throw new RangeError(`@lookline/catalog: product index ${i} outside [1, ${size}]`)
  }
  const planSize = planSizeFor(size)
  const plan = createPlan(seed, planSize, brands)
  const { cell, ordinal } = indexToCell(plan, slotOf(i - 1, planSize))
  const sel = cellSelection(plan, cell)
  const sub = cell.subcategory
  const brand = cell.brand
  const schema = ATTRIBUTE_SCHEMAS[sub.schema]!
  const department = DEPARTMENTS[sel.department[ordinal] ?? 0]!
  const colour = COLORS[sel.colour[ordinal] ?? 0]!
  const material = sel.materials[sel.material[ordinal] ?? 0]!
  const pattern = sel.patterns[sel.pattern[ordinal] ?? 0]!
  const fitIndex = sel.fit[ordinal] ?? -1
  const fitValue = fitIndex >= 0 ? (sel.fitValues[fitIndex] ?? null) : null
  const comboFit = sel.fitIsSilhouette ? null : fitValue
  const comboSilhouette = sel.fitIsSilhouette ? fitValue : null
  const edition = sel.edition[ordinal] ?? 1

  // Step 0/1: provisional primary from the combo, attributes with boosts, final aesthetics.
  const affinityBrand: AffinityBrand = {
    name: brand.name,
    homeAesthetics: brand.homeAesthetics,
    homeWeights: brand.homeWeights,
  }
  const affinityInput: AffinityInput = {
    subcategory: sub.slug,
    categoryGroup: sub.group,
    color: colour.slug,
    colorFamily: colour.family,
    material: material.slug,
    pattern: pattern.slug,
    fit: comboFit,
    silhouette: comboSilhouette,
    department,
  }
  let affinity = aestheticWeights(affinityInput, affinityBrand)
  const attrsRng = createRng(hashSeed(seed, 'attrs', i))
  const sampled = sampleAttributes(attrsRng, {
    sub,
    schema,
    department,
    fit: comboFit,
    silhouette: comboSilhouette,
    colourSlug: colour.slug,
    primary: affinity.primary,
  })
  if (sampled.silhouette !== comboSilhouette || sampled.fit !== comboFit) {
    affinity = aestheticWeights(
      { ...affinityInput, fit: sampled.fit, silhouette: sampled.silhouette },
      affinityBrand,
    )
  }
  const secondary = secondaryColorFor(attrsRng, pattern, colour, sub.group, affinity.primary)

  // Step 2: season, drop year, release offset.
  const seasonRng = createRng(hashSeed(seed, 'season', i))
  const prior = seasonPriorFor(sub.seasonCode, material.warmth)
  const primarySeason = seasonRng.weighted(SEASONS.map((s) => [s, prior[s]] as const))
  const adjacent = seasonRng.chance(0.35) ? ADJACENT_SEASON[primarySeason] : undefined
  const seasons: Season[] = adjacent ? [primarySeason, adjacent] : [primarySeason]
  const dropYear = seasonRng.weighted(DROP_YEARS)
  const offsetDays = seasonRng.int(0, 60)
  const createdAt = new Date(
    Date.UTC(dropYear, launchMonth(primarySeason, i), 1) + offsetDays * DAY_MS,
  )

  // Step 3: sizes.
  const sizesRng = createRng(hashSeed(seed, 'sizes', i))
  const { sizeSystem, sizes } = drawSizes(sizesRng, sub, department)

  // Step 4: price and sale.
  const priceRng = createRng(hashSeed(seed, 'price', i))
  const priced = computePrice(priceRng, {
    basePrice: sub.basePrice,
    sigma: sub.sigma,
    tier: brand.tier,
    group: sub.group,
    subcategory: sub.slug,
    department,
    brandMultiplier: brand.priceMultiplier,
    material,
    columns: { length: sampled.length },
    extras: sampled.extras,
    dropYear,
  })

  // Step 5: stock and sold-out sizes.
  const stockRng = createRng(hashSeed(seed, 'stock', i))
  const { stock, soldOutSizes } = drawStock(stockRng, sub, department, sizes)

  // Step 6: rating, reviews, popularity.
  const ratingRng = createRng(hashSeed(seed, 'rating', i))
  const { rating, reviewCount, popularity } = drawRating(ratingRng, {
    sub,
    tier: brand.tier,
    brandPopularity: brand.popularity,
    dropYear,
  })

  // Attributes JSON (§11.1).
  const attributes: Record<string, string | number | boolean> = {
    primaryAesthetic: affinity.primary,
    secondaryAesthetic: affinity.secondary ?? '',
    dropYear,
    collection: collectionCode(primarySeason, dropYear),
    soldOutSizes,
    colorSlug: colour.slug,
  }
  if (priced.compareAtPrice !== null) attributes.compareAtPrice = priced.compareAtPrice
  if (secondary.secondary) attributes.secondaryColorSlug = secondary.secondary.slug
  if (secondary.base !== colour) attributes.renderColorSlug = secondary.base.slug
  if (edition > 1) attributes.edition = edition
  for (const [k, v] of Object.entries(sampled.extras)) attributes[k] = v

  // Step 8 (part): axes need the columns; occasions need the formality axis.
  const secondaryColorHex = secondary.secondary?.hex ?? null
  const axes = computeAxes(
    {
      subcategory: sub.slug,
      material: material.slug,
      pattern: pattern.slug,
      colorName: colour.name,
      fit: sampled.fit,
      silhouette: sampled.silhouette,
      length: sampled.length,
      sleeve: sampled.sleeve,
      attributes,
      seasons,
      price: priced.price,
      tier: brand.tier,
      secondaryColorHex,
    },
    brand,
  )
  let first: OccasionRow = OCCASIONS[0]!
  let bestScore = Number.NEGATIVE_INFINITY
  for (const occ of OCCASIONS) {
    const s = occasionScore(occ, sub.slug, axes.formality)
    if (s > bestScore) {
      bestScore = s
      first = occ
    }
  }

  // Step 7: name, description, then the extra occasion draws.
  const textRng = createRng(hashSeed(seed, 'text', i))
  const nameInput = {
    brand,
    ordinal,
    sub,
    colour,
    material,
    fit: sampled.fit,
    silhouette: sampled.silhouette,
    length: sampled.length,
    extras: sampled.extras,
  }
  const name = drawProductName(textRng, nameInput)
  const description = drawProductDescription(textRng, {
    ...nameInput,
    neckline: sampled.neckline,
    sleeve: sampled.sleeve,
    closure: sampled.closure,
    occasionSlug: first.slug,
    occasionName: first.name,
    aestheticName: findAesthetic(affinity.primary)?.name ?? affinity.primary,
    seasonName: `${findSeason(primarySeason)?.name ?? 'All Season'} ${dropYear}`,
  })
  const occasions: string[] = [first.slug]
  const candidates = () =>
    OCCASIONS.filter(
      (o) => !occasions.includes(o.slug) && Math.abs(o.formality - axes.formality) <= 0.3,
    )
  if (textRng.chance(0.6)) {
    const c = candidates()
    if (c.length > 0) occasions.push(textRng.pick(c).slug)
  }
  if (textRng.chance(0.3)) {
    const c = candidates()
    if (c.length > 0) occasions.push(textRng.pick(c).slug)
  }

  const styleVector = toStyleVector({
    aesthetics: affinity.weights,
    colorFamily: colour.family,
    secondaryColorFamily: secondary.secondary?.family ?? null,
    axes,
    categoryGroup: sub.group,
  })

  const product: GeneratedProduct = {
    id: i,
    slug: productSlug(name, i),
    brandId: brand.id,
    name,
    description,
    department,
    categoryGroup: sub.group,
    category: sub.category,
    subcategory: sub.slug,
    silhouetteId: resolveSilhouetteId(sub, sampled, sampled.extras),
    colorName: colour.name,
    colorHex: colour.hex,
    colorFamily: colour.family,
    secondaryColorHex,
    pattern: pattern.slug,
    material: material.slug,
    fit: sampled.fit,
    silhouette: sampled.silhouette,
    length: sampled.length,
    neckline: sampled.neckline,
    sleeve: sampled.sleeve,
    closure: sampled.closure,
    occasions,
    seasons,
    aesthetics: affinity.aesthetics,
    attributes,
    styleVector,
    price: priced.price,
    tier: brand.tier,
    sizeSystem,
    sizes,
    stock,
    rating,
    reviewCount,
    popularity,
    trendScore: 0,
    heroImageUrl: null,
    imageSeed: hashSeed(seed, 'image', i) & 0x7fffffff,
  }
  return { product, createdAt }
}

/** Pure function of (index, seed, brands, size): order-independent, parallelisable. */
export function generateProduct(
  i: number,
  seed: number,
  brands: readonly GeneratedBrand[],
  size: number = DEFAULT_CATALOG_SIZE,
): GeneratedProduct {
  return generateProductRow(i, seed, brands, size).product
}

/**
 * §7.5 duplicate key — unique across a catalog by construction (weighted sampling without
 * replacement inside disjoint `(subcategory, brand)` cells; department and edition included).
 */
export function duplicateKey(
  p: Pick<
    GeneratedProduct,
    | 'brandId'
    | 'subcategory'
    | 'department'
    | 'colorName'
    | 'material'
    | 'pattern'
    | 'fit'
    | 'silhouette'
  > & { attributes?: Readonly<Record<string, string | number | boolean>> },
): string {
  const edition = p.attributes?.edition
  return [
    p.brandId,
    p.subcategory,
    p.department,
    p.colorName,
    p.material,
    p.pattern,
    p.fit ?? p.silhouette ?? '-',
    typeof edition === 'number' ? edition : 1,
  ].join('|')
}
