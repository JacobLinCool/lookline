/**
 * Intent → style vector. The contract implementation lives in `../intent` (`intentToVector`,
 * ENGINE_SPEC §1.9); this module wraps it so the recommender keeps working while that module is
 * a stub, using a private transcription of §1.9 as the fallback (see REQUESTS.md).
 */
import {
  AXES,
  axisIndex,
  categoryGroupIndex,
  colorFamilyIndex,
  aestheticIndex,
  zeroVector,
} from '@lookline/catalog'
import type { ColorFamily } from '@lookline/catalog'
import { intentToVector } from '../intent'
import { AESTHETIC_TABLES } from './aesthetics'
import { aestheticWeightsOf, budgetOf, colorWeightsOf, parseTokens } from './intent-view'
import type { EngineIntent } from './intent-view'
import { clamp01 } from './vector'

/** §1.9 transcribed: aesthetics (max-normalised), colours, axis targets, category one-hot, preference blend. */
export function fallbackIntentVector(
  intent: EngineIntent,
  base?: readonly number[] | null,
  eventCount?: number,
): number[] {
  const v = zeroVector()
  const weights = aestheticWeightsOf(intent)
  const avoid = parseTokens(intent.mustAvoid)
  for (const [slug, w] of Object.entries(weights)) {
    const i = aestheticIndex(slug)
    if (i >= 0) v[i] = Math.max(v[i] ?? 0, w)
  }
  for (const slug of avoid.aesthetics) {
    const i = aestheticIndex(slug)
    if (i >= 0) v[i] = 0
  }
  let maxA = 0
  for (let i = 0; i < 32; i++) maxA = Math.max(maxA, v[i] ?? 0)
  if (maxA === 0) {
    v[aestheticIndex('minimalist')] = 0.4
    const classic = aestheticIndex('classic')
    v[classic >= 0 ? classic : aestheticIndex('normcore')] = 0.4
    maxA = 0.4
  }
  for (let i = 0; i < 32; i++) v[i] = (v[i] ?? 0) / maxA

  const colours = colorWeightsOf(intent)
  let anyColour = false
  for (const [f, w] of Object.entries(colours)) {
    if (!w) continue
    v[colorFamilyIndex(f as ColorFamily)] = Math.max(v[colorFamilyIndex(f as ColorFamily)] ?? 0, w)
    anyColour = true
  }
  if (!anyColour) {
    for (const [slug, w] of Object.entries(weights)) {
      const row = AESTHETIC_TABLES.get(slug)
      if (!row) continue
      for (const [f, pw] of Object.entries(row.colorPrior)) {
        const idx = colorFamilyIndex(f as ColorFamily)
        v[idx] = Math.max(v[idx] ?? 0, pw * w)
      }
    }
  }
  for (const f of avoid.colorFamilies) v[colorFamilyIndex(f)] = 0

  const targets = intent.axisTargets ?? {}
  for (const axis of AXES) {
    const idx = axisIndex(axis)
    if (axis === 'price-tier') {
      const b = budgetOf(intent)
      if (b.perItemMax !== null) {
        v[idx] = clamp01(
          (Math.log(b.perItemMax) - Math.log(300)) / (Math.log(30000) - Math.log(300)),
        )
      } else v[idx] = targets['price-tier'] ?? 0.45
    } else v[idx] = clamp01(targets[axis] ?? 0.5)
  }

  if (intent.mode !== 'outfit') {
    for (const g of intent.categoryGroups) {
      const idx = categoryGroupIndex(g)
      if (idx >= 52) v[idx] = 1
    }
  }

  if (base && base.length >= 52) {
    const beta = eventCount === undefined ? 0.25 : Math.min(0.4, 0.1 + 0.02 * eventCount)
    for (let i = 0; i < 52; i++) v[i] = clamp01((1 - beta) * (v[i] ?? 0) + beta * (base[i] ?? 0))
  }
  return v
}

/** The sibling's `intentToVector` when implemented, else the fallback (never throws). */
export function computeIntentVector(
  intent: EngineIntent,
  base?: readonly number[] | null,
  eventCount?: number,
): number[] {
  try {
    const v = intentToVector(intent, base ?? null)
    if (Array.isArray(v) && v.length === 64 && v.some((x) => x > 0)) return v
  } catch {
    // stub or provider failure: fall through
  }
  return fallbackIntentVector(intent, base, eventCount)
}
