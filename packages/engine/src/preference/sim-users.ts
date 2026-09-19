/**
 * Synthetic users, intent templates and the click model of the evaluation harness
 * (ENGINE_SPEC §4.5). Archetypes are keyed by the catalog's aesthetic slugs.
 */
import {
  CATEGORY_GROUPS,
  COLOR_FAMILIES,
  STYLE_DIMENSIONS,
  aestheticDeptMult,
  aestheticIndex,
  axisIndex,
  categoryGroupIndex,
  colorFamilyIndex,
  createRng,
  hashSeed,
  logUniformInt,
  type Axis,
  type CategoryGroup,
  type ColorFamily,
  type Rng,
} from '@lookline/catalog'
import type { Department } from '@lookline/db'
import { AESTHETIC_AXIS_PRIOR, AESTHETIC_COLOR_PRIOR } from './aesthetic-tables'
import { EVAL_OCCASION_PRIORS, SEASON_AXES } from './occasions'
import { BLOCK, clamp01 } from './vector'

export interface Archetype {
  slug: string
  primaries: readonly [string, string]
}

/** Twelve fixed archetypes (§4.5, re-keyed to the catalog slugs). */
export const ARCHETYPES: readonly Archetype[] = [
  { slug: 'gorp-tech', primaries: ['gorpcore', 'techwear'] },
  { slug: 'quiet-lux', primaries: ['quiet-luxury', 'corporate-chic'] },
  { slug: 'street-y2k', primaries: ['streetwear', 'y2k'] },
  { slug: 'k-minimal', primaries: ['k-street', 'minimalist'] },
  { slug: 'romantic-cottage', primaries: ['romantic', 'cottagecore'] },
  { slug: 'academia-prep', primaries: ['preppy', 'dark-academia'] },
  { slug: 'glam-party', primaries: ['glam', 'avant-garde'] },
  { slug: 'boho-resort', primaries: ['boho', 'resort'] },
  { slug: 'scandi-clean', primaries: ['scandi', 'clean-girl'] },
  { slug: 'goth-punk', primaries: ['goth', 'punk'] },
  { slug: 'athleisure', primaries: ['athleisure', 'normcore'] },
  { slug: 'retro-western', primaries: ['retro-70s', 'western'] },
]

export interface SyntheticUser {
  index: number
  id: string
  archetype: string
  department: Department
  /** Hidden taste vector `h`. */
  hidden: Float64Array
  budgetMax: number
  /** Pickiness ρ of the click model. */
  pickiness: number
}

const DEPT_BASE: ReadonlyArray<readonly [Department, number]> = [
  ['women', 0.5],
  ['men', 0.4],
  ['unisex', 0.1],
]

export interface UserGenOptions {
  /** Group share per department for the hidden G block (default uniform). */
  groupShare?: Partial<Record<Department, ArrayLike<number>>>
  pickiness?: readonly [number, number]
  budget?: readonly [number, number]
}

/** `n` synthetic users; pure in `(n, seed)`. Archetypes are assigned round-robin. */
export function makeSyntheticUsers(
  n: number,
  seed: number,
  opts: UserGenOptions = {},
): SyntheticUser[] {
  const users: SyntheticUser[] = []
  const [rhoLo, rhoHi] = opts.pickiness ?? [0.4, 0.7]
  const [budgetLo, budgetHi] = opts.budget ?? [1500, 12000]
  for (let u = 0; u < n; u++) {
    const rng = createRng(hashSeed(seed, 'eval-user', u))
    const archetype = ARCHETYPES[u % ARCHETYPES.length]!
    const [a1, a2] = archetype.primaries
    const deptWeights = DEPT_BASE.map(
      ([d, w]) =>
        [d, w * Math.max(aestheticDeptMult(a1, d) * aestheticDeptMult(a2, d), 1e-3)] as const,
    )
    const department = rng.weighted(deptWeights)
    // The archetype's aesthetics no longer have dimensions of their own; the taste they imply
    // shows up in the colour and axis priors below, which is all the style space still carries.
    const h = new Float64Array(STYLE_DIMENSIONS)
    for (const slug of [a1, a2]) {
      const row = AESTHETIC_COLOR_PRIOR[slug] ?? {}
      for (const [family, w] of Object.entries(row)) {
        const i = colorFamilyIndex(family as ColorFamily)
        if (i >= BLOCK.C[0] && w !== undefined) h[i] = Math.max(h[i] ?? 0, w)
      }
    }
    const randomFamily = rng.pick(COLOR_FAMILIES)
    const fi = colorFamilyIndex(randomFamily)
    h[fi] = Math.max(h[fi] ?? 0, 0.4)
    const axisRows = [AESTHETIC_AXIS_PRIOR[a1], AESTHETIC_AXIS_PRIOR[a2]]
    for (let k = BLOCK.X[0]; k < BLOCK.X[1]; k++) {
      const axis = axisName(k)
      const mean = axisRows.reduce((s, row) => s + (row?.[axis] ?? 0.5), 0) / axisRows.length
      h[k] = clamp01(mean + rng.normal(0, 0.08))
    }
    const share = opts.groupShare?.[department]
    for (let g = 0; g < CATEGORY_GROUPS.length; g++) {
      h[BLOCK.G[0] + g] = share ? (share[g] ?? 0) : 1 / CATEGORY_GROUPS.length
    }
    const budgetMax = logUniformInt(rng, budgetLo, budgetHi)
    const pickiness = rng.float(rhoLo, rhoHi)
    users.push({
      index: u,
      id: `sim_${String(u + 1).padStart(4, '0')}`,
      archetype: archetype.slug,
      department,
      hidden: h,
      budgetMax,
      pickiness,
    })
  }
  return users
}

const AXIS_ORDER: readonly Axis[] = [
  'formality',
  'warmth',
  'boldness',
  'structure',
  'price-tier',
  'coverage',
  'texture',
  'trendiness',
]

function axisName(dim: number): Axis {
  return AXIS_ORDER[dim - BLOCK.X[0]] ?? 'formality'
}

// ---------------------------------------------------------------------------
// Intent templates
// ---------------------------------------------------------------------------

export interface IntentTemplate {
  key: string
  utterance: string
  categoryGroups: readonly CategoryGroup[]
  occasion?: string
  colorFamily?: ColorFamily
  aesthetics?: readonly string[]
  season?: 'spring' | 'summer' | 'autumn' | 'winter'
}

const WOMEN: readonly IntentTemplate[] = [
  {
    key: 'w-office-top',
    utterance: 'a top for the office',
    categoryGroups: ['tops'],
    occasion: 'work',
  },
  {
    key: 'w-black-coat',
    utterance: 'a black coat for winter',
    categoryGroups: ['outerwear'],
    colorFamily: 'black',
    season: 'winter',
  },
  {
    key: 'w-wedding-dress',
    utterance: 'a dress for a wedding',
    categoryGroups: ['dresses'],
    occasion: 'wedding-guest',
  },
  {
    key: 'w-weekend-sneakers',
    utterance: 'comfortable sneakers for the weekend',
    categoryGroups: ['footwear'],
    occasion: 'everyday',
  },
  {
    key: 'w-date-night',
    utterance: 'something for a date night',
    categoryGroups: ['dresses', 'tops'],
    occasion: 'date-night',
  },
  {
    key: 'w-travel-bag',
    utterance: 'a bag for travelling',
    categoryGroups: ['bags'],
    occasion: 'travel',
  },
  { key: 'w-gym', utterance: 'gym leggings', categoryGroups: ['activewear'], occasion: 'workout' },
  {
    key: 'w-beach',
    utterance: 'a swimsuit for the beach',
    categoryGroups: ['swimwear'],
    occasion: 'beach',
  },
  {
    key: 'w-brunch-knit',
    utterance: 'a knit for brunch',
    categoryGroups: ['tops'],
    occasion: 'brunch',
  },
  {
    key: 'w-party-heels',
    utterance: 'heels for a party',
    categoryGroups: ['footwear'],
    occasion: 'party',
  },
  {
    key: 'w-gold-earrings',
    utterance: 'gold earrings',
    categoryGroups: ['jewelry'],
    colorFamily: 'multi-metallic',
  },
  {
    key: 'w-blue-jeans',
    utterance: 'blue jeans for everyday',
    categoryGroups: ['bottoms'],
    colorFamily: 'blue',
    occasion: 'everyday',
  },
]

const MEN: readonly IntentTemplate[] = [
  {
    key: 'm-work-shirt',
    utterance: 'a shirt for work',
    categoryGroups: ['tops'],
    occasion: 'work',
  },
  {
    key: 'm-black-jacket',
    utterance: 'a black jacket for autumn',
    categoryGroups: ['outerwear'],
    colorFamily: 'black',
    season: 'autumn',
  },
  {
    key: 'm-wedding-suit',
    utterance: 'a suit for a wedding',
    categoryGroups: ['tailoring'],
    occasion: 'wedding-guest',
  },
  {
    key: 'm-white-sneakers',
    utterance: 'white sneakers',
    categoryGroups: ['footwear'],
    colorFamily: 'white',
  },
  {
    key: 'm-date-top',
    utterance: 'a nice top for a dinner date',
    categoryGroups: ['tops'],
    occasion: 'date-night',
  },
  {
    key: 'm-travel-backpack',
    utterance: 'a backpack for travel',
    categoryGroups: ['bags'],
    occasion: 'travel',
  },
  {
    key: 'm-workout',
    utterance: 'workout shorts and a tee',
    categoryGroups: ['activewear'],
    occasion: 'workout',
  },
  {
    key: 'm-beach',
    utterance: 'swim trunks for the beach',
    categoryGroups: ['swimwear'],
    occasion: 'beach',
  },
  {
    key: 'm-everyday-chinos',
    utterance: 'chinos for everyday',
    categoryGroups: ['bottoms'],
    occasion: 'everyday',
  },
  {
    key: 'm-festival',
    utterance: 'something for a music festival',
    categoryGroups: ['tops', 'bottoms'],
    occasion: 'festival',
  },
  { key: 'm-watch', utterance: 'a watch', categoryGroups: ['accessories'] },
  {
    key: 'm-lounge-hoodie',
    utterance: 'a cosy hoodie for home',
    categoryGroups: ['loungewear', 'tops'],
    occasion: 'lounge',
  },
]

const UNISEX: readonly IntentTemplate[] = [
  {
    key: 'u-office-layer',
    utterance: 'a layer for the office',
    categoryGroups: ['tops', 'outerwear'],
    occasion: 'work',
  },
  {
    key: 'u-black-outer',
    utterance: 'a black outer layer for winter',
    categoryGroups: ['outerwear'],
    colorFamily: 'black',
    season: 'winter',
  },
  {
    key: 'u-wedding',
    utterance: 'something to wear to a wedding',
    categoryGroups: ['tailoring', 'dresses'],
    occasion: 'wedding-guest',
  },
  {
    key: 'u-sneakers',
    utterance: 'everyday sneakers',
    categoryGroups: ['footwear'],
    occasion: 'everyday',
  },
  {
    key: 'u-date',
    utterance: 'an outfit top for a date',
    categoryGroups: ['tops'],
    occasion: 'date-night',
  },
  {
    key: 'u-travel-bag',
    utterance: 'a carry-on bag',
    categoryGroups: ['bags'],
    occasion: 'travel',
  },
  { key: 'u-gym', utterance: 'gym clothes', categoryGroups: ['activewear'], occasion: 'workout' },
  {
    key: 'u-beach',
    utterance: 'swimwear for a beach trip',
    categoryGroups: ['swimwear'],
    occasion: 'beach',
  },
  {
    key: 'u-green-bottoms',
    utterance: 'green trousers',
    categoryGroups: ['bottoms'],
    colorFamily: 'green',
  },
  {
    key: 'u-festival',
    utterance: 'a festival look',
    categoryGroups: ['tops', 'accessories'],
    occasion: 'festival',
  },
  {
    key: 'u-jewelry',
    utterance: 'a silver necklace',
    categoryGroups: ['jewelry'],
    colorFamily: 'multi-metallic',
  },
  {
    key: 'u-lounge',
    utterance: 'loungewear for home',
    categoryGroups: ['loungewear'],
    occasion: 'lounge',
  },
]

export const INTENT_TEMPLATES: Readonly<Record<Department, readonly IntentTemplate[]>> = {
  women: WOMEN,
  men: MEN,
  unisex: UNISEX,
  kids: UNISEX,
}

export function templatesFor(department: Department): readonly IntentTemplate[] {
  return INTENT_TEMPLATES[department] ?? UNISEX
}

/** Axis targets a template specifies (used by attribute matching). */
export function templateAxisTargets(t: IntentTemplate): Partial<Record<Axis, number>> {
  const out: Partial<Record<Axis, number>> = {}
  const occ = t.occasion ? EVAL_OCCASION_PRIORS[t.occasion] : undefined
  if (occ) {
    out.formality = occ.formality
    out.coverage = occ.coverage
    out.boldness = occ.boldness
  }
  const season = t.season ? SEASON_AXES[t.season] : undefined
  if (season) {
    out.warmth = season.warmth
    out.coverage =
      out.coverage === undefined ? season.coverage : (out.coverage + season.coverage) / 2
  }
  return out
}

/** Intent style vector of a template (aesthetics/colours from the template and occasion priors). */
export function intentVectorFor(t: IntentTemplate): Float64Array {
  const v = new Float64Array(STYLE_DIMENSIONS)
  const occ = t.occasion ? EVAL_OCCASION_PRIORS[t.occasion] : undefined
  for (const slug of t.aesthetics ?? []) {
    const i = aestheticIndex(slug)
    if (i >= 0) v[i] = 1
  }
  if (occ) {
    for (const [slug, w] of Object.entries(occ.aesthetics)) {
      const i = aestheticIndex(slug)
      if (i >= 0) v[i] = Math.max(v[i] ?? 0, 0.5 * w)
    }
    for (const [family, w] of Object.entries(occ.colors)) {
      const i = colorFamilyIndex(family as ColorFamily)
      if (i >= BLOCK.C[0] && w !== undefined) v[i] = Math.max(v[i] ?? 0, 0.7 * w)
    }
    for (const family of occ.avoid ?? []) v[colorFamilyIndex(family)] = 0
  }
  if (t.colorFamily) v[colorFamilyIndex(t.colorFamily)] = 1
  for (let k = BLOCK.X[0]; k < BLOCK.X[1]; k++) v[k] = 0.5
  for (const [axis, value] of Object.entries(templateAxisTargets(t))) {
    if (value !== undefined) v[axisIndex(axis as Axis)] = value
  }
  for (const g of t.categoryGroups) v[categoryGroupIndex(g)] = 1
  return v
}

// ---------------------------------------------------------------------------
// Click model
// ---------------------------------------------------------------------------

export const CLICK_MODEL = {
  clickSlope: 12,
  saveSlope: 10,
  saveShift: 0.05,
  purchaseSlope: 10,
  purchaseShift: 0.12,
  purchaseBudgetSlack: 1.2,
  dismissScale: 0.1,
  dismissSlope: 10,
} as const

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

export interface ClickDecision {
  examined: boolean
  click: boolean
  save: boolean
  purchase: boolean
  dismiss: boolean
}

/**
 * One slate item (§4.5). Always consumes seven draws so that decisions for a product are
 * comparable across conditions regardless of which branch is taken.
 */
export function clickModel(
  rng: Rng,
  rel: number,
  pickiness: number,
  position: number,
  priceWithinSlack: boolean,
  canPurchase: boolean,
  noise: number,
): ClickDecision {
  const uExamine = rng.next()
  const uClick = rng.next()
  const uFlipClick = rng.next()
  const uSave = rng.next()
  const uPurchase = rng.next()
  const uDismiss = rng.next()
  const uFlipDismiss = rng.next()
  const examined = uExamine < 1 / Math.log2(position + 2)
  if (!examined) return { examined, click: false, save: false, purchase: false, dismiss: false }
  let click = uClick < sigmoid(CLICK_MODEL.clickSlope * (rel - pickiness))
  if (uFlipClick < noise) click = !click
  if (click) {
    const save = uSave < sigmoid(CLICK_MODEL.saveSlope * (rel - pickiness - CLICK_MODEL.saveShift))
    const purchase =
      save &&
      canPurchase &&
      priceWithinSlack &&
      uPurchase < sigmoid(CLICK_MODEL.purchaseSlope * (rel - pickiness - CLICK_MODEL.purchaseShift))
    return { examined, click, save, purchase, dismiss: false }
  }
  let dismiss =
    uDismiss < CLICK_MODEL.dismissScale * sigmoid(CLICK_MODEL.dismissSlope * (pickiness - rel))
  if (uFlipDismiss < noise) dismiss = !dismiss
  return { examined, click: false, save: false, purchase: false, dismiss }
}
