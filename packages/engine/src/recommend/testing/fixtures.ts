/**
 * Deterministic in-memory fixtures for the recommend tests: a synthetic catalog built from the
 * catalog taxonomy with `createRng`/`hashSeed` (the catalog's `generateProduct` was still a stub
 * when these tests were written; the shapes follow CATALOG_SPEC §7–§8 loosely), intents and
 * rank contexts.
 */
import {
  AXES,
  AESTHETICS,
  AESTHETIC_DEPT_MULT,
  COLORS,
  FITS,
  NEIGHBOURS,
  OCCASIONS,
  SEASON_PRIOR,
  colorFamilyWeight,
  createRng,
  findSubcategory,
  hashSeed,
  materialsFor,
  axisIndex,
  neighboursOf,
  occasionFavours,
  patternsFor,
  subcategoriesFor,
  toStyleVector,
} from '@lookline/catalog'
import type { Axis, CategoryGroup, ColorFamily, Rng, Season } from '@lookline/catalog'
import type { Article, BrandTier, Department } from '@lookline/db'
import type { Intent } from '../../types'
import type { ContextInput } from '../context'
import type { RankContext } from '../factors'
import { fallbackIntentVector } from '../intent-vector'
import type { EngineIntent } from '../intent-view'
import type { Candidate, Channel, ProductRow } from '../retrieve'
import { clamp01 } from '../vector'
import { DEFAULT_WEIGHTS } from '../weights'

const CREATED_AT = new Date(Date.UTC(2026, 0, 1))
export const FIXTURE_NOW = new Date(Date.UTC(2026, 8, 18, 1, 0, 0))

const GROUP_WEIGHTS: ReadonlyArray<readonly [CategoryGroup, number]> = [
  ['tops', 22],
  ['bottoms', 14],
  ['dresses', 8],
  ['outerwear', 8],
  ['footwear', 12],
  ['bags', 7],
  ['accessories', 8],
  ['jewelry', 5],
  ['activewear', 6],
  ['swimwear', 3],
  ['loungewear', 3],
  ['tailoring', 4],
]

const DEPT_WEIGHTS: ReadonlyArray<readonly [Department, number]> = [
  ['women', 45],
  ['men', 30],
  ['unisex', 20],
  ['kids', 5],
]

const TIER_BASE: Readonly<Record<string, number>> = {
  budget: 0.1,
  mid: 0.35,
  premium: 0.65,
  luxury: 0.9,
}
const TIER_ADJ: Readonly<Record<string, number>> = {
  budget: -0.03,
  mid: 0,
  premium: 0.03,
  luxury: 0.06,
}

/**
 * Labels for the test catalogue. The real one is a single retailer, so these exist only here —
 * ranking factors that measure brand concentration need more than one to measure.
 */
export interface FixtureBrand {
  id: number
  slug: string
  name: string
  tier: BrandTier
  popularity: number
  trend: number
  size: number
  homeAesthetics: string[]
  homeDepartments: Department[]
  priceMultiplier: number
}

type BrandList = FixtureBrand[]

const TIER_SHAPE: Readonly<Record<BrandTier, { size: number; priceMultiplier: number }>> = {
  budget: { size: 1, priceMultiplier: 0.7 },
  mid: { size: 0.7, priceMultiplier: 1 },
  premium: { size: 0.35, priceMultiplier: 1.7 },
  luxury: { size: 0.15, priceMultiplier: 3 },
}

let cachedBrands: { seed: number; brands: BrandList } | null = null

export function fixtureBrands(seed = 42): BrandList {
  if (cachedBrands?.seed === seed) return cachedBrands.brands
  const rng = createRng(hashSeed('fixture-brands', seed))
  const tiers: readonly BrandTier[] = ['budget', 'mid', 'premium', 'luxury']
  const brands: BrandList = Array.from({ length: 12 }, (_, i) => {
    const tier = tiers[i % tiers.length] as BrandTier
    return {
      id: i + 1,
      slug: `label-${i + 1}`,
      name: `Label ${String.fromCharCode(65 + i)}`,
      tier,
      popularity: rng.float(0.2, 1),
      trend: rng.float(0, 1),
      size: TIER_SHAPE[tier].size,
      homeAesthetics: [rng.pick(AESTHETICS).slug, rng.pick(AESTHETICS).slug],
      homeDepartments: ['women', 'men'],
      priceMultiplier: TIER_SHAPE[tier].priceMultiplier,
    }
  })
  cachedBrands = { seed, brands }
  return brands
}

/** The outfit slot each category group occupies, for the fixture catalogue. */
const OUTFIT_ROLE_BY_GROUP: Record<CategoryGroup, Article['outfitRole']> = {
  tops: 'top',
  bottoms: 'bottom',
  dresses: 'full-body',
  outerwear: 'outer',
  footwear: 'shoes',
  bags: 'bag',
  accessories: 'accessory',
  jewelry: 'jewelry',
  activewear: 'top',
  swimwear: 'swimwear',
  loungewear: 'nightwear',
  tailoring: 'outer',
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function pickSeasons(rng: Rng, code: 'A' | 'S' | 'W' | 'T' | 'Y'): Season[] {
  const prior = SEASON_PRIOR[code]
  const first = rng.weighted(Object.entries(prior).map(([s, w]) => [s as Season, w] as const))
  const out: Season[] = [first]
  if (first !== 'all-season' && rng.chance(0.35)) {
    const adjacent: Record<string, Season> = {
      spring: 'summer',
      summer: 'spring',
      autumn: 'winter',
      winter: 'autumn',
    }
    const second = adjacent[first]
    if (second) out.push(second)
  }
  return out
}

interface AffinityScore {
  slug: string
  raw: number
  score: number
  cat: number
}

export function makeProduct(
  i: number,
  seed = 42,
  brandList: BrandList = fixtureBrands(seed),
): ProductRow {
  const rng = createRng(hashSeed(seed, 'fixture', i))
  let department = rng.weighted(DEPT_WEIGHTS)
  let group = rng.weighted(GROUP_WEIGHTS)
  let subs = subcategoriesFor(group, department)
  let guard = 0
  while (subs.length === 0 && guard++ < 10) {
    department = rng.weighted(DEPT_WEIGHTS)
    group = rng.weighted(GROUP_WEIGHTS)
    subs = subcategoriesFor(group, department)
  }
  if (subs.length === 0) {
    department = 'women'
    group = 'tops'
    subs = subcategoriesFor(group, department)
  }
  const sub = rng.weighted(subs.map((s) => [s, s.weight] as const))
  const eligibleBrands = brandList.filter(
    (b) => (b.homeDepartments as string[]).includes(department) || department === 'unisex',
  )
  const brand = rng.pick(eligibleBrands.length > 0 ? eligibleBrands : brandList)
  const family = rng.weighted(
    (
      [
        'black',
        'white',
        'grey',
        'neutral',
        'brown',
        'red',
        'pink',
        'yellow-orange',
        'green',
        'blue',
        'purple',
        'multi-metallic',
      ] as ColorFamily[]
    ).map((f) => [f, Math.max(0.01, colorFamilyWeight(group, department, f))] as const),
  )
  const colour = rng.pick(COLORS.filter((c) => c.family === family))
  const materialOptions = materialsFor(sub.slug, department)
  const material =
    materialOptions.length > 0
      ? rng.weighted(materialOptions.map(([m, w]) => [m, w] as const))
      : null
  const patterns = patternsFor(group, material?.slug ?? null)
  const pattern =
    patterns.length > 0 ? rng.weighted(patterns.map((p) => [p, p.prior] as const)) : null
  const fit = sub.attributes.includes('fit') ? rng.pick(FITS).slug : null

  // Affinity (CATALOG_SPEC §3.2/§3.4, simplified): primary needs a category term > 0.
  const homes = new Set(brand.homeAesthetics as string[])
  const scored: AffinityScore[] = AESTHETICS.map((a) => {
    const cat = a.favours.subcategories.includes(sub.slug)
      ? 1
      : a.favours.categoryGroups.includes(group)
        ? 0.5
        : 0
    const col = a.favours.colorFamilies.includes(family) ? 0.7 : 0
    const mat = material && a.favours.materials.includes(material.slug) ? 1 : 0.25
    const pat =
      pattern && a.favours.patterns.includes(pattern.slug) ? 1 : pattern?.slug === 'solid' ? 0.5 : 0
    const ft = fit && a.favours.fits.includes(fit) ? 1 : 0.4
    const raw = 0.45 * cat + 0.2 * col + 0.15 * mat + 0.1 * pat + 0.1 * ft
    const dept = AESTHETIC_DEPT_MULT[a.slug as keyof typeof AESTHETIC_DEPT_MULT]?.[department] ?? 0
    return { slug: a.slug, raw, cat, score: raw * (homes.has(a.slug) ? 1 : 0.6) * dept }
  })
  const withCat = scored.filter((s) => s.cat > 0 && s.score > 0)
  const primary = (withCat.length > 0 ? withCat : scored).reduce((best, s) =>
    s.score > best.score ? s : best,
  )
  const neighbourSlugs = neighboursOf(primary.slug)
  const secondary = scored
    .filter(
      (s) =>
        neighbourSlugs.includes(s.slug as (typeof NEIGHBOURS)[keyof typeof NEIGHBOURS][number]) &&
        s.raw >= 0.3,
    )
    .toSorted((a, b) => b.raw - a.raw)[0]
  const aestheticWeights: Record<string, number> = { [primary.slug]: 0.85 }
  if (secondary) aestheticWeights[secondary.slug] = 0.55
  for (const s of scored) {
    if (aestheticWeights[s.slug] !== undefined) continue
    const w = Math.round(s.raw * 100) / 100
    if (w >= 0.3 && Object.keys(aestheticWeights).length < 4)
      aestheticWeights[s.slug] = Math.min(0.5, w)
  }
  const priceMul = brand.priceMultiplier * Math.exp(rng.normal(0, sub.sigma))
  const price = Math.max(100, Math.round((sub.basePrice * priceMul) / 10) * 10)
  const seasons = pickSeasons(rng, sub.seasonCode)
  const seasonAdj = seasons.includes('winter')
    ? 0.15
    : seasons.includes('autumn')
      ? 0.05
      : seasons.includes('summer')
        ? -0.15
        : seasons.includes('spring')
          ? -0.05
          : 0
  const aestheticDef = AESTHETICS.find((a) => a.slug === primary.slug)!
  const base = sub.basePrice
  const axes: Partial<Record<Axis, number>> = {
    formality: clamp01(
      sub.formality +
        (material?.formalityAdj ?? 0) +
        (pattern?.formalityAdj ?? 0) +
        colour.formalityAdj +
        (aestheticDef.axes.formality ?? 0) +
        (TIER_ADJ[brand.tier] ?? 0),
    ),
    warmth: clamp01(
      sub.coverage > 0
        ? 0.6 * (material?.warmth ?? 0.4) + 0.25 * sub.coverage + seasonAdj
        : 0.5 * (material?.warmth ?? 0.4) + 0.1,
    ),
    boldness: clamp01(
      0.45 * colour.boldness +
        0.35 * (pattern?.boldness ?? 0) +
        0.2 * (aestheticDef.axes.boldness ?? 0.3),
    ),
    structure: clamp01(0.6 * sub.structure + 0.4 * (material?.structure ?? 0.3)),
    'price-tier': clamp01(
      0.5 * (TIER_BASE[brand.tier] ?? 0.35) +
        0.5 *
          clamp01(
            (Math.log(price) - Math.log(0.3 * base)) / (Math.log(40 * base) - Math.log(0.3 * base)),
          ),
    ),
    coverage: clamp01(sub.coverage),
    texture: clamp01(0.7 * (material?.texture ?? 0.3) + 0.3 * (pattern?.texture ?? 0)),
    trendiness: clamp01(
      0.55 * (aestheticDef.axes.trendiness ?? 0.5) +
        0.2 * brand.trend +
        0.15 * 0.6 +
        0.1 * (pattern?.trend ?? 0.5),
    ),
  }
  const secondaryColour =
    pattern && pattern.secondary !== 'none'
      ? rng.pick(COLORS.filter((c) => c.family !== family))
      : null
  const styleVector = toStyleVector({
    aesthetics: aestheticWeights,
    colorFamily: family,
    secondaryColorFamily: secondaryColour?.family ?? null,
    axes,
    categoryGroup: group,
  })
  const favouring = OCCASIONS.filter((o) => occasionFavours(o, sub.slug))
  const occasionPool =
    favouring.length > 0
      ? favouring
      : [...OCCASIONS]
          .toSorted(
            (a, b) =>
              Math.abs(a.formality - (axes.formality ?? 0.5)) -
              Math.abs(b.formality - (axes.formality ?? 0.5)),
          )
          .slice(0, 3)
  const occasions = [rng.pick(occasionPool).slug]
  if (rng.chance(0.4)) {
    const extra = rng.pick(occasionPool).slug
    if (!occasions.includes(extra)) occasions.push(extra)
  }
  const attributes: Record<string, string | number | boolean> = {}
  if ((group === 'outerwear' || group === 'bottoms') && rng.chance(0.5)) attributes.pockets = true
  if (sub.slug === 'hoodie' || sub.slug === 'parka' || sub.slug === 'windbreaker')
    attributes.hood = true
  if ((sub.slug === 'windbreaker' || sub.slug === 'parka') && rng.chance(0.6))
    attributes.waterproof = true
  const name = `${brand.name} ${colour.name} ${material?.adj ?? ''} ${sub.noun} ${i}`
    .replace(/\s+/g, ' ')
    .trim()
  const description = `${sub.name} by ${brand.name} in ${material?.name ?? 'mixed fibres'}, ${colour.name.toLowerCase()}, ${pattern?.name.toLowerCase() ?? 'solid'}. ${aestheticDef.definition}`
  const row: Article = {
    id: String(i).padStart(10, '0'),
    slug: `p-${i}-${slugify(name)}`,
    brandId: brand.id,
    productCode: String(i).padStart(7, '0'),
    name,
    description,
    department,
    categoryGroup: group,
    outfitRole: OUTFIT_ROLE_BY_GROUP[group],
    category: sub.category,
    subcategory: sub.slug,
    productGroup: sub.category,
    section: 'Womens Everyday Collection',
    indexName: department === 'kids' ? 'Children Sizes 92-140' : 'Ladieswear',
    indexGroupName: department === 'men' ? 'Menswear' : 'Ladieswear',
    colorName: colour.name,
    colorHex: colour.hex,
    // Never came through the H&M import, so there is no perceived master behind the family.
    colorMaster: '',
    colorFamily: family,
    colorValue: 'Dark',
    pattern: pattern?.slug ?? 'solid',
    material: material?.slug ?? 'cotton-jersey',
    fit: fit ?? '',
    length: '',
    neckline: '',
    sleeve: '',
    closure: '',
    aesthetics: Object.entries(aestheticWeights)
      .toSorted((a, b) => b[1] - a[1])
      .map(([slug]) => slug),
    silhouette: '',
    printSubject: '',
    styleCaption: '',
    occasions,
    seasons,
    attributes,
    styleVector,
    price,
    tier: brand.tier,
    salesCount: rng.int(0, 5000),
    firstSoldAt: CREATED_AT,
    lastSoldAt: CREATED_AT,
    onlineRatio: rng.float(0, 1),
    popularity: Math.round(rng.float(0, 1) ** 2 * 1000) / 1000,
    trendScore: Math.round(rng.float(0, 1) * 1000) / 1000,
    imagePath: null,
    createdAt: CREATED_AT,
  }
  return { ...row, brandName: brand.name }
}

let cachedCatalog: { key: string; rows: ProductRow[] } | null = null

/** `n` synthetic articles (ids 1..n); memoised per (n, seed). */
export function makeCatalog(n: number, seed = 42): ProductRow[] {
  const key = `${n}:${seed}`
  if (cachedCatalog && cachedCatalog.key === key) return cachedCatalog.rows
  const brandList = fixtureBrands(seed)
  const rows: ProductRow[] = []
  for (let i = 1; i <= n; i++) rows.push(makeProduct(i, seed, brandList))
  cachedCatalog = { key, rows }
  return rows
}

/** One product with explicit overrides (for targeted factor tests). */
export function product(
  overrides: Partial<Omit<ProductRow, 'id'>> & { id: number; aesthetics?: string[] },
): ProductRow {
  const base = makeProduct(overrides.id, 42)
  const merged: ProductRow = { ...base, ...overrides, id: String(overrides.id).padStart(10, '0') }
  const styleTags = overrides.aesthetics
  if (
    overrides.styleVector === undefined &&
    (styleTags || overrides.colorFamily || overrides.categoryGroup)
  ) {
    // The vector has to agree with the columns the caller overrode, so it is rebuilt from them:
    // the style tags at the weights `makeProduct` gives a primary, secondary and third tag, and
    // the generated axes carried over unchanged.
    const aesthetics: Record<string, number> = {}
    ;(styleTags ?? merged.aesthetics).forEach((slug, i) => {
      aesthetics[slug] = i === 0 ? 0.85 : i === 1 ? 0.55 : 0.3
    })
    const axes: Partial<Record<Axis, number>> = {}
    for (const axis of AXES) axes[axis] = base.styleVector[axisIndex(axis)] ?? 0.5
    merged.styleVector = toStyleVector({
      aesthetics,
      colorFamily: merged.colorFamily as ColorFamily,
      axes,
      categoryGroup: merged.categoryGroup as CategoryGroup,
    })
  }
  return merged
}

export function makeIntent(overrides: Partial<EngineIntent> = {}): EngineIntent {
  const intent: Intent = {
    utterance: overrides.utterance ?? '',
    locale: 'en',
    mode: 'single',
    categoryGroups: [],
    subcategories: [],
    colors: [],
    colorFamilies: [],
    aesthetics: [],
    materials: [],
    patterns: [],
    fits: [],
    recipient: { kind: 'self' },
    mustHave: [],
    mustAvoid: [],
    assumptions: [],
    clarifications: [],
    confidence: 1,
  }
  return { ...intent, ...overrides }
}

export function makeContext(overrides: Partial<ContextInput> = {}): ContextInput {
  return {
    user: null,
    trend: new Map(),
    trendChannel: null,
    popularityMax: 1,
    now: FIXTURE_NOW,
    brandIds: new Map(),
    ...overrides,
  }
}

/** A `RankContext` for tests: no user, no trend, fixed clock. */
export function makeRankContext(
  intent: EngineIntent,
  overrides: Partial<RankContext> = {},
): RankContext {
  return {
    intent,
    intentVector: fallbackIntentVector(intent),
    now: FIXTURE_NOW,
    seed: 1,
    user: null,
    trend: new Map(),
    popularityMax: 1,
    weights: { ...DEFAULT_WEIGHTS },
    ...overrides,
  }
}

/** A `Candidate` wrapper for a fixture product. */
export function candidate(row: ProductRow, cos = 0.8, channels: Channel[] = ['vector']): Candidate {
  const { brandName, ...rest } = row
  return {
    product: rest,
    brandName,
    cos,
    channels: new Set(channels),
    socialEvidence: [],
    trendEvidence: null,
  }
}

export { findSubcategory }
