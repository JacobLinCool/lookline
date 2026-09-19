/**
 * Occasions (§2.6, 12) and seasons (§2.7) of docs/specs/CATALOG_SPEC.md.
 * Seasons live here because the taxonomy folder has no separate seasons module.
 */
import type { OccasionDef, Season } from '../types'
import type { SeasonCode } from './categories'
import { findSubcategory, splitSynonyms } from './categories'

/** `OccasionDef` plus the favoured subcategories/groups of §2.6. */
export interface OccasionRow extends OccasionDef {
  /** Subcategory slugs, or a group slug meaning every subcategory of that group. */
  favoured: readonly string[]
}

type OccasionTuple = readonly [
  slug: string,
  name: string,
  labelZh: string,
  synonyms: string,
  formality: number,
  favoured: string,
]

// prettier-ignore
const OCCASION_ROWS: readonly OccasionTuple[] = [
  ['everyday', 'Everyday', '日常', 'daily, casual, 平日, 休閒', 0.25, 'tee, jeans, sneaker, tote, hoodie, chinos, crossbody, polo-shirt, sweatshirt, baseball-cap, backpack, socks'],
  ['work', 'Work', '上班', 'office, business, 辦公室, 通勤', 0.65, 'blazer, tailored-trousers, button-down-shirt, loafer, tote, midi-skirt, sheath-dress, dress-shirt, pencil-skirt, turtleneck, watch'],
  ['date-night', 'Date Night', '約會', 'date, dinner, 晚餐, 約會夜', 0.60, 'slip-dress, mini-dress, heeled-sandal, biker-jacket, blouse, earrings, bodysuit, mini-bag, pump'],
  ['wedding-guest', 'Wedding Guest', '婚禮賓客', 'wedding, 婚禮, 喜宴', 0.85, 'midi-dress, maxi-dress, evening-gown, pump, clutch, two-piece-suit, tie, sheath-dress, heeled-sandal'],
  ['party', 'Party', '派對', 'night out, club, 夜店, 聚會', 0.55, 'mini-dress, pump, clutch, earrings, bodysuit, crop-top, heeled-sandal, mini-bag'],
  ['travel', 'Travel', '旅行', 'trip, vacation, airport, 出國, 旅遊', 0.30, 'duffle, backpack, sneaker, wide-leg-trousers, cardigan, windbreaker, belt-bag, joggers, sunglasses'],
  ['workout', 'Workout', '運動', 'gym, training, run, 健身, 跑步', 0.05, 'activewear, running-shoe'],
  ['beach', 'Beach', '海邊', 'pool, seaside, 海灘, 泳池, 度假', 0.10, 'swimwear, slide, flat-sandal, bucket-hat, sunglasses, linen-shirt'],
  ['festival', 'Festival', '音樂節', 'concert, 演唱會, 戶外活動', 0.20, 'crop-top, casual-shorts, combat-boot, belt-bag, sunglasses, bucket-hat, denim-jacket, hair-clip'],
  ['brunch', 'Weekend Brunch', '週末早午餐', 'weekend, cafe, 週末, 下午茶', 0.40, 'midi-dress, linen-shirt, ballet-flat, cardigan, mini-bag, blouse, wide-leg-trousers, loafer'],
  ['formal', 'Formal Event', '正式場合', 'black tie, gala, ceremony, 正式, 晚宴, 典禮', 0.95, 'tuxedo, evening-gown, two-piece-suit, pump, derby, brooch, tie, clutch, watch'],
  ['lounge', 'Lounge', '居家', 'home, sleep, cozy, 在家, 睡覺', 0.05, 'loungewear, sweatpants, slipper, hoodie, socks'],
]

/** §2.6 — 12 occasions in spec order. */
export const OCCASIONS: readonly OccasionRow[] = OCCASION_ROWS.map(
  ([slug, name, labelZh, synonyms, formality, favoured]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
    formality,
    favoured: splitSynonyms(favoured),
  }),
)

const OCCASION_BY_SLUG: ReadonlyMap<string, OccasionRow> = new Map(
  OCCASIONS.map((o) => [o.slug, o]),
)

export function findOccasion(slug: string): OccasionRow | undefined {
  return OCCASION_BY_SLUG.get(slug)
}

/** True when the occasion favours the subcategory directly or through its group (§2.6). */
export function occasionFavours(occasion: OccasionRow | string, subcategory: string): boolean {
  const occ = typeof occasion === 'string' ? findOccasion(occasion) : occasion
  if (!occ) return false
  if (occ.favoured.includes(subcategory)) return true
  const sub = findSubcategory(subcategory)
  return sub !== undefined && occ.favoured.includes(sub.group)
}

/**
 * Occasion score used by the §7.8 assignment: 1 when favoured, else
 * `0.4 − |occasion.formality − formality|`.
 */
export function occasionScore(
  occasion: OccasionRow,
  subcategory: string,
  formality: number,
): number {
  return occasionFavours(occasion, subcategory) ? 1 : 0.4 - Math.abs(occasion.formality - formality)
}

// ---------------------------------------------------------------------------
// Seasons (§2.7)
// ---------------------------------------------------------------------------

export const SEASONS = ['spring', 'summer', 'autumn', 'winter', 'all-season'] as const

export interface SeasonDef {
  slug: Season
  name: string
  labelZh: string
  synonyms: readonly string[]
}

/** Season labels and synonyms (§12 seasons row), in `SEASONS` order. */
export const SEASON_DEFS: readonly SeasonDef[] = [
  { slug: 'spring', name: 'Spring', labelZh: '春', synonyms: ['春天', '春季'] },
  { slug: 'summer', name: 'Summer', labelZh: '夏', synonyms: ['夏天', '夏季'] },
  { slug: 'autumn', name: 'Autumn', labelZh: '秋', synonyms: ['秋天', '秋季', 'fall'] },
  { slug: 'winter', name: 'Winter', labelZh: '冬', synonyms: ['冬天', '冬季'] },
  {
    slug: 'all-season',
    name: 'All Season',
    labelZh: '四季',
    synonyms: ['全年', 'all year', 'year round'],
  },
]

export function findSeason(slug: string): SeasonDef | undefined {
  return SEASON_DEFS.find((s) => s.slug === slug)
}

/** `SEASON_PRIOR[code][season]` — prior mass by subcategory season code (§2.7). */
export const SEASON_PRIOR: Readonly<Record<SeasonCode, Readonly<Record<Season, number>>>> = {
  A: { 'all-season': 0.45, spring: 0.15, summer: 0.15, autumn: 0.15, winter: 0.1 },
  S: { 'all-season': 0.15, spring: 0.25, summer: 0.55, autumn: 0.05, winter: 0 },
  W: { 'all-season': 0.15, spring: 0.05, summer: 0, autumn: 0.3, winter: 0.5 },
  T: { 'all-season': 0.25, spring: 0.3, summer: 0.1, autumn: 0.3, winter: 0.05 },
  Y: { 'all-season': 0.3, spring: 0.175, summer: 0.175, autumn: 0.175, winter: 0.175 },
}

/** Adjacent season used for the optional second season (`all-season` has none). */
export const ADJACENT_SEASON: Readonly<Partial<Record<Season, Season>>> = {
  spring: 'summer',
  summer: 'spring',
  autumn: 'winter',
  winter: 'autumn',
}

/**
 * Season prior for a subcategory code after the material warmth override (§2.7): `warmth ≥ .75`
 * moves .20 of mass from (spring, summer) to (autumn, winter) pro rata; `warmth ≤ .20` the reverse.
 */
export function seasonPriorFor(code: SeasonCode, materialWarmth?: number): Record<Season, number> {
  const prior: Record<Season, number> = { ...SEASON_PRIOR[code] }
  if (materialWarmth === undefined) return prior
  const shift = (from: readonly Season[], to: readonly Season[]): void => {
    const fromMass = from.reduce((s, k) => s + prior[k], 0)
    const toMass = to.reduce((s, k) => s + prior[k], 0)
    const amount = Math.min(0.2, fromMass)
    if (amount <= 0) return
    for (const k of from) prior[k] -= (amount * prior[k]) / fromMass
    if (toMass > 0) for (const k of to) prior[k] += (amount * prior[k]) / toMass
    else for (const k of to) prior[k] += amount / to.length
  }
  if (materialWarmth >= 0.75) shift(['spring', 'summer'], ['autumn', 'winter'])
  else if (materialWarmth <= 0.2) shift(['autumn', 'winter'], ['spring', 'summer'])
  return prior
}
