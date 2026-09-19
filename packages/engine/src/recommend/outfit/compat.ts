/**
 * Pairwise compatibility (ENGINE_SPEC §3.2): colour harmony from hex → HSL, aesthetic overlap,
 * formality distance and season match.
 */
import { STYLE_DIMENSIONS, axisIndex, cosineRange, findColor } from '@lookline/catalog'
import type { Season } from '@lookline/catalog'
import type { Article } from '@lookline/db'
import { NEUTRAL_FAMILIES, clamp01, colorHsl } from '../vector'
import type { Hsl } from '../vector'

export type ColourRelation =
  | 'both-neutral'
  | 'one-neutral'
  | 'metallic'
  | 'same-family'
  | 'analogous'
  | 'complementary'
  | 'triadic'
  | 'clash'

export interface ColourResult {
  score: number
  relation: ColourRelation
  loud: boolean
}

export interface ColourInput {
  colorHex: string
  colorFamily: string
  secondaryColorHex?: string | null
}

export function isNeutral(hsl: Hsl, family: string): boolean {
  return NEUTRAL_FAMILIES.has(family) || hsl.s < 0.12
}

function primaryHarmony(
  a: { hsl: Hsl; family: string },
  b: { hsl: Hsl; family: string },
): ColourResult {
  const na = isNeutral(a.hsl, a.family)
  const nb = isNeutral(b.hsl, b.family)
  const ma = a.family === 'multi-metallic'
  const mb = b.family === 'multi-metallic'
  if (ma || mb) {
    if (ma && mb) return { score: 0.3, relation: 'metallic', loud: false }
    const other = ma ? nb : na
    return { score: other ? 0.8 : 0.5, relation: 'metallic', loud: false }
  }
  if (na && nb) {
    if (a.family === 'black' && b.family === 'black')
      return { score: 0.7, relation: 'both-neutral', loud: false }
    const dl = Math.abs(a.hsl.l - b.hsl.l)
    return { score: 0.85 + (dl >= 0.25 ? 0.05 : 0), relation: 'both-neutral', loud: false }
  }
  if (na || nb) return { score: 0.9, relation: 'one-neutral', loud: false }
  const loud = a.hsl.s > 0.7 && b.hsl.s > 0.7
  const penalty = loud ? 0.1 : 0
  if (a.family === b.family) {
    const dl = Math.abs(a.hsl.l - b.hsl.l)
    return { score: (dl < 0.1 ? 0.7 : 0.8) - penalty, relation: 'same-family', loud }
  }
  const raw = Math.abs(a.hsl.h - b.hsl.h)
  const dh = Math.min(raw, 360 - raw)
  if (dh <= 40) return { score: 0.8 - penalty, relation: 'analogous', loud }
  if (dh >= 150 && dh <= 210) return { score: 0.75 - penalty, relation: 'complementary', loud }
  if (dh >= 100 && dh < 150) return { score: 0.65 - penalty, relation: 'triadic', loud }
  return { score: 0.45 - penalty, relation: 'clash', loud }
}

/** §3.2 colour term; secondary colours blend 0.7·primary + 0.3·max(secondary pairings). */
export function colourHarmony(a: ColourInput, b: ColourInput): ColourResult {
  const pa = { hsl: colorHsl(a.colorHex, a.colorFamily), family: a.colorFamily }
  const pb = { hsl: colorHsl(b.colorHex, b.colorFamily), family: b.colorFamily }
  const primary = primaryHarmony(pa, pb)
  const secondaries: number[] = []
  const sa = a.secondaryColorHex
    ? { hsl: colorHsl(a.secondaryColorHex, 'grey'), family: familyGuess(a.secondaryColorHex) }
    : null
  const sb = b.secondaryColorHex
    ? { hsl: colorHsl(b.secondaryColorHex, 'grey'), family: familyGuess(b.secondaryColorHex) }
    : null
  if (sa) secondaries.push(primaryHarmony(sa, pb).score)
  if (sb) secondaries.push(primaryHarmony(pa, sb).score)
  if (sa && sb) secondaries.push(primaryHarmony(sa, sb).score)
  if (secondaries.length === 0) return { ...primary, score: clamp01(primary.score) }
  const score = 0.7 * primary.score + 0.3 * Math.max(...secondaries)
  return { ...primary, score: clamp01(score) }
}

function familyGuess(hex: string): string {
  const c = findColor(hex)
  if (c) return c.family
  const hsl = colorHsl(hex, 'grey')
  if (hsl.s < 0.12) return hsl.l < 0.2 ? 'black' : hsl.l > 0.9 ? 'white' : 'grey'
  return 'chromatic'
}

/**
 * Cosine over the whole style vector — colour, axes and category group. It was over the aesthetic
 * block, plus a bonus for a shared tag; the catalogue names no aesthetic, so this is what is left
 * to measure two pieces against each other with.
 */
export function aestheticCompat(a: Article, b: Article): number {
  return clamp01(cosineRange(a.styleVector, b.styleVector, 0, STYLE_DIMENSIONS))
}

const FORMALITY = axisIndex('formality')
const BOLDNESS = axisIndex('boldness')

/** `1 − |Δformality|`, ×0.8 when both are statement pieces (boldness > 0.7). */
export function formalityCompat(a: Article, b: Article): number {
  const fa = a.styleVector[FORMALITY] ?? 0.5
  const fb = b.styleVector[FORMALITY] ?? 0.5
  let v = 1 - Math.abs(fa - fb)
  if ((a.styleVector[BOLDNESS] ?? 0) > 0.7 && (b.styleVector[BOLDNESS] ?? 0) > 0.7) v *= 0.8
  return clamp01(v)
}

const ADJACENT: ReadonlyArray<readonly [Season, Season]> = [
  ['spring', 'summer'],
  ['summer', 'autumn'],
  ['autumn', 'winter'],
  ['winter', 'spring'],
]

function adjacentSeasons(a: readonly string[], b: readonly string[]): boolean {
  return ADJACENT.some(
    ([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)),
  )
}

/** 1 when seasons intersect or either is all-season; 0.5 adjacent; 0.3 otherwise; intent season multiplier. */
export function seasonCompat(a: Article, b: Article, intentSeason?: Season | null): number {
  let v: number
  if (
    a.seasons.includes('all-season') ||
    b.seasons.includes('all-season') ||
    a.seasons.some((s) => b.seasons.includes(s))
  )
    v = 1
  else if (adjacentSeasons(a.seasons, b.seasons)) v = 0.5
  else v = 0.3
  if (intentSeason) {
    const ca = a.seasons.includes(intentSeason) || a.seasons.includes('all-season')
    const cb = b.seasons.includes(intentSeason) || b.seasons.includes('all-season')
    v *= ca && cb ? 1 : ca || cb ? 0.85 : 0.7
  }
  return clamp01(v)
}

export interface CompatBreakdown {
  score: number
  colour: ColourResult
  aesthetic: number
  formality: number
  season: number
  /** True for `accessories×jewelry` and `bags×jewelry` (not scored). */
  skipped: boolean
}

const UNSCORED: ReadonlySet<string> = new Set([
  'accessories|jewelry',
  'jewelry|accessories',
  'bags|jewelry',
  'jewelry|bags',
])

export function isUnscoredPair(a: Article, b: Article): boolean {
  return UNSCORED.has(`${a.categoryGroup}|${b.categoryGroup}`)
}

/** `0.35·colour + 0.30·aesthetic + 0.20·formality + 0.15·season`, clamped [0, 1]. */
export function compat(a: Article, b: Article, intentSeason?: Season | null): CompatBreakdown {
  const colour = colourHarmony(a, b)
  const aesthetic = aestheticCompat(a, b)
  const formality = formalityCompat(a, b)
  const season = seasonCompat(a, b, intentSeason)
  const score = clamp01(0.35 * colour.score + 0.3 * aesthetic + 0.2 * formality + 0.15 * season)
  return { score, colour, aesthetic, formality, season, skipped: isUnscoredPair(a, b) }
}

/** Compat of an item with an external reference (e.g. a partner Look): vector + colour only. */
export function referenceCompat(
  item: Article,
  ref: { styleVector: readonly number[]; colorHex: string; colorFamily: string },
): number {
  const colour = colourHarmony(item, { colorHex: ref.colorHex, colorFamily: ref.colorFamily }).score
  const aesthetic = clamp01(cosineRange(item.styleVector, ref.styleVector, 0, STYLE_DIMENSIONS))
  const fa = item.styleVector[FORMALITY] ?? 0.5
  const fb = ref.styleVector[FORMALITY] ?? 0.5
  const formality = clamp01(1 - Math.abs(fa - fb))
  return clamp01(0.4 * colour + 0.4 * aesthetic + 0.2 * formality)
}
