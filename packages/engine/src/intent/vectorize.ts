/**
 * Intent → 64-d style vector (ENGINE_SPEC §1.9) with query-side aesthetic normalisation, colour
 * priors, axis targets, category one-hots and the Engine 03 preference blend.
 */
import {
  AXES,
  aestheticIndex,
  axisIndex,
  categoryGroupIndex,
  colorFamilyIndex,
  zeroVector,
} from '@lookline/catalog'
import type { Axis, ColorFamily } from '@lookline/catalog'
import { AESTHETIC_COLOR_PRIOR, canonicalAesthetic } from '../constants'
import { BLOCK } from '../vector'
import type { Intent } from '../types'
import type { IntentExt } from './schema'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

export interface VectorizeOptions {
  /** Top-3 trending aesthetics for `browse` fallbacks. */
  trendingAesthetics?: readonly string[]
  /** Feedback-event count of the user: β = min(0.4, 0.10 + 0.02·eventCount); 0.25 when unknown. */
  eventCount?: number
  /** Style vector of the referenced Look (`referenceLookVector`). */
  referenceVector?: readonly number[] | null
}

/** Fallback aesthetics when nothing is known (neutral everyday basics). */
export const FALLBACK_AESTHETICS: ReadonlyArray<readonly [string, number]> = [
  ['minimalist', 0.4],
  ['normcore', 0.4],
]

/** `look.styleVector` when present, else the mean of its articles' vectors with G zeroed. */
export function referenceLookVector(look: {
  styleVector?: readonly number[] | null
  articles?: ReadonlyArray<{ styleVector: readonly number[] }>
}): number[] | null {
  if (look.styleVector && look.styleVector.length === 64) return look.styleVector.slice()
  const articles = look.articles ?? []
  if (articles.length === 0) return null
  const out = zeroVector()
  for (const p of articles)
    for (let i = 0; i < 64; i++) out[i] = (out[i] ?? 0) + (p.styleVector[i] ?? 0) / articles.length
  for (let i = BLOCK.G[0]; i < BLOCK.G[1]; i++) out[i] = 0
  return out
}

const perItemMax = (intent: IntentExt): number | null => {
  const b = intent.budget
  if (!b) return null
  const max = b.max ?? (b.min !== undefined ? b.min * 1.5 : null)
  if (max === null) return null
  return intent.mode === 'outfit' && (b.scope ?? 'total') === 'total' ? max * 0.45 : max
}

export function intentToVector(
  intent: Intent,
  base?: readonly number[] | null,
  opts: VectorizeOptions = {},
): number[] {
  const it = intent as IntentExt
  const v = zeroVector()

  // A: aesthetics
  const weights: Record<string, number> = { ...it.aestheticWeights }
  if (Object.keys(weights).length === 0) for (const slug of it.aesthetics) weights[slug] = 1
  for (const [slug, w] of Object.entries(weights)) {
    const key = canonicalAesthetic(slug)
    if (!key) continue
    const i = aestheticIndex(key)
    if (i >= 0) v[i] = Math.max(v[i] ?? 0, clamp01(w))
  }
  for (const token of it.mustAvoid) {
    if (token.startsWith('aesthetic:')) {
      const i = aestheticIndex(token.slice(10))
      if (i >= 0) v[i] = 0
    }
  }
  let aestheticSum = 0
  for (let i = 0; i < 32; i++) aestheticSum += v[i] ?? 0
  if (aestheticSum === 0 && it.mode === 'browse' && (opts.trendingAesthetics?.length ?? 0) > 0) {
    for (const slug of opts.trendingAesthetics!.slice(0, 3)) {
      const i = aestheticIndex(canonicalAesthetic(slug) ?? '')
      if (i >= 0) v[i] = 0.6
    }
    for (let i = 0; i < 32; i++) aestheticSum += v[i] ?? 0
  }
  if (aestheticSum === 0) {
    for (const [slug, w] of FALLBACK_AESTHETICS) {
      const i = aestheticIndex(slug)
      if (i >= 0) v[i] = w
    }
  }
  if (opts.referenceVector && it.referenceRole === 'style-source') {
    const ref = opts.referenceVector
    for (let i = 0; i < 32; i++) v[i] = 0.5 * (v[i] ?? 0) + 0.5 * (ref[i] ?? 0)
  }
  let maxA = 0
  for (let i = 0; i < 32; i++) maxA = Math.max(maxA, v[i] ?? 0)
  if (maxA > 0) for (let i = 0; i < 32; i++) v[i] = (v[i] ?? 0) / maxA

  // C: colours
  for (const f of it.colorFamilies) v[colorFamilyIndex(f)] = 1
  for (const [f, w] of Object.entries(it.colorWeights ?? {})) {
    const i = colorFamilyIndex(f as ColorFamily)
    if (i >= 32) v[i] = Math.max(v[i] ?? 0, clamp01(w))
  }
  let colourSum = 0
  for (let i = 32; i < 44; i++) colourSum += v[i] ?? 0
  if (colourSum === 0 && Object.keys(weights).length > 0) {
    for (const [slug, w] of Object.entries(weights)) {
      const key = canonicalAesthetic(slug)
      if (!key) continue
      const prior = AESTHETIC_COLOR_PRIOR[key] ?? {}
      for (const [f, pw] of Object.entries(prior) as Array<[ColorFamily, number]>) {
        const i = colorFamilyIndex(f)
        v[i] = Math.max(v[i] ?? 0, pw * clamp01(w))
      }
    }
  }
  if (opts.referenceVector && it.referenceRole === 'style-source') {
    const ref = opts.referenceVector
    for (let i = 32; i < 44; i++) v[i] = 0.4 * (v[i] ?? 0) + 0.6 * (ref[i] ?? 0)
  }
  for (const token of it.mustAvoid) {
    if (token.startsWith('color:')) {
      const i = colorFamilyIndex(token.slice(6) as ColorFamily)
      if (i >= 32) v[i] = 0
    }
  }

  // X: axes
  const targets = it.axisTargets ?? {}
  for (const axis of AXES as readonly Axis[]) {
    if (axis === 'price-tier') continue
    v[axisIndex(axis)] = clamp01(targets[axis] ?? 0.5)
  }
  const pim = perItemMax(it)
  v[axisIndex('price-tier')] =
    pim !== null && pim > 0
      ? clamp01((Math.log(pim) - Math.log(300)) / (Math.log(30000) - Math.log(300)))
      : clamp01(targets['price-tier'] ?? 0.45)
  if (opts.referenceVector && it.referenceRole === 'style-source') v[axisIndex('trendiness')] = 0.65

  // G: category groups
  if (it.mode !== 'outfit') for (const g of it.categoryGroups) v[categoryGroupIndex(g)] = 1

  // preference blend (Engine 03 hook): A, C, X only
  if (base && base.length >= 52) {
    const beta = opts.eventCount === undefined ? 0.25 : Math.min(0.4, 0.1 + 0.02 * opts.eventCount)
    for (let i = 0; i < 52; i++) v[i] = (1 - beta) * (v[i] ?? 0) + beta * clamp01(base[i] ?? 0)
  }
  return v
}
