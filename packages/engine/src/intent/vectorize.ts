/**
 * Intent → 32-d style vector (ENGINE_SPEC §1.9) with query-side colour
 * priors, axis targets, category one-hots and the Engine 03 preference blend.
 */
import {
  AXES,
  STYLE_BLOCKS,
  STYLE_DIMENSIONS,
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
  /** Style vector of the referenced Card (`referenceCardVector`). */
  referenceVector?: readonly number[] | null
}

/** Fallback aesthetics when nothing is known (neutral everyday basics). */
export const FALLBACK_AESTHETICS: ReadonlyArray<readonly [string, number]> = [
  ['minimalist', 0.4],
  ['normcore', 0.4],
]

/** A Card snapshot's stored style vector, or the mean of its articles with G zeroed. */
export function referenceCardVector(card: {
  styleVector?: readonly number[] | null
  articles?: ReadonlyArray<{ styleVector: readonly number[] }>
}): number[] | null {
  if (card.styleVector && card.styleVector.length === STYLE_DIMENSIONS)
    return card.styleVector.slice()
  const articles = card.articles ?? []
  if (articles.length === 0) return null
  const out = zeroVector()
  for (const p of articles)
    for (let i = 0; i < STYLE_DIMENSIONS; i++)
      out[i] = (out[i] ?? 0) + (p.styleVector[i] ?? 0) / articles.length
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

  // The aesthetic block is gone: the catalogue names no aesthetic, so an aesthetic in the intent
  // has nothing to match against. It still narrows retrieval through the lexicon and still reads
  // back in the explanation — and it still picks the colours below, since a named style implies
  // a palette even when the catalogue cannot confirm one.
  const weights: Record<string, number> = { ...it.aestheticWeights }
  if (Object.keys(weights).length === 0) for (const slug of it.aesthetics) weights[slug] = 1

  // C: colours
  for (const f of it.colorFamilies) v[colorFamilyIndex(f)] = 1
  for (const [f, w] of Object.entries(it.colorWeights ?? {})) {
    const i = colorFamilyIndex(f as ColorFamily)
    if (i >= 0) v[i] = Math.max(v[i] ?? 0, clamp01(w))
  }
  let colourSum = 0
  for (let i = STYLE_BLOCKS.colors[0]; i < STYLE_BLOCKS.colors[1]; i++) colourSum += v[i] ?? 0
  if (colourSum === 0 && Object.keys(weights).length > 0) {
    for (const [slug, w] of Object.entries(weights)) {
      const key = canonicalAesthetic(slug)
      if (!key) continue
      const prior = AESTHETIC_COLOR_PRIOR[key] ?? {}
      for (const [f, pw] of Object.entries(prior) as Array<[ColorFamily, number]>) {
        const i = colorFamilyIndex(f)
        v[i] = Math.max(v[i] ?? 0, pw * clamp01(w as number))
      }
    }
  }
  if (opts.referenceVector && it.referenceRole === 'style-source') {
    const ref = opts.referenceVector
    for (let i = STYLE_BLOCKS.colors[0]; i < STYLE_BLOCKS.colors[1]; i++)
      v[i] = 0.4 * (v[i] ?? 0) + 0.6 * (ref[i] ?? 0)
  }
  for (const token of it.mustAvoid) {
    if (token.startsWith('color:')) {
      const i = colorFamilyIndex(token.slice(6) as ColorFamily)
      if (i >= 0) v[i] = 0
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

  // preference blend (Engine 03 hook): colours and axes, never the group one-hot
  if (base && base.length >= STYLE_DIMENSIONS) {
    const beta = opts.eventCount === undefined ? 0.25 : Math.min(0.4, 0.1 + 0.02 * opts.eventCount)
    for (let i = 0; i < STYLE_BLOCKS.groups[0]; i++)
      v[i] = (1 - beta) * (v[i] ?? 0) + beta * clamp01(base[i] ?? 0)
  }
  return v
}
