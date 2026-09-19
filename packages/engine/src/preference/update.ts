/**
 * Online preference update rule (ENGINE_SPEC §4.2).
 *
 * State per user and target `t ∈ {self, gift}`: `{ p, n, mass, lastAt }`. The prior `p0` is the
 * department centroid; the vector decays toward it with a 45-day half-life, the learning rate
 * decays with the number of events, negatives move half as far, and the category-group block
 * (52–63) is an exponential moving average that only positive events update.
 */
import {
  AESTHETICS,
  AESTHETIC_PRIOR,
  CATEGORY_GROUPS,
  COLOR_FAMILIES,
  STYLE_DIMENSIONS,
  aestheticDeptMult,
  colorFamilyIndex,
  colorFamilyWeight,
  type AestheticSlug,
} from '@lookline/catalog'
import type { Department } from '@lookline/db'
import { BLOCK, clamp01, zero64 } from './vector'

export interface PreferenceState {
  /** Stored (undecayed) 64-d vector. */
  p: number[]
  /** Number of events applied to this target. */
  n: number
  /** Decayed Σ|r| — the evidence mass behind the vector. */
  mass: number
  /** Time of the last applied event; `null` before the first. */
  lastAt: Date | null
}

export const DECAY_HALF_LIFE_DAYS = 45
export const CONFIDENCE_PSEUDO_MASS = 3
export const LEARNING_RATE_MAX = 0.25
export const LEARNING_RATE_MIN = 0.05
export const LEARNING_RATE_TEMPO = 20
export const NEGATIVE_STEP = 0.5
export const GROUP_EMA = 0.5

const DAY_MS = 86_400_000

/** Total aesthetic mass of a typical product vector (primary ≥ .85 + secondary ≥ .55 + tail). */
const PRIOR_AESTHETIC_MASS = 1.6
/** Total colour mass of a typical product vector (primary 1.0 + 40% chance of a .4 secondary). */
const PRIOR_COLOR_MASS = 1.16

/** `η(n) = max(0.05, 0.25 / sqrt(1 + n/20)) · scale`. */
export function learningRate(n: number, scale = 1): number {
  return (
    Math.max(LEARNING_RATE_MIN, LEARNING_RATE_MAX / Math.sqrt(1 + n / LEARNING_RATE_TEMPO)) * scale
  )
}

/** `2^(−Δdays/45)` for `from → to`; 1 when `from` is null or in the future. */
export function decayFactor(from: Date | null, to: Date): number {
  if (!from) return 1
  const days = (to.getTime() - from.getTime()) / DAY_MS
  if (!(days > 0)) return 1
  return 2 ** (-days / DECAY_HALF_LIFE_DAYS)
}

/** `confidence = mass / (mass + 3)`. */
export function confidenceOf(mass: number): number {
  return mass <= 0 ? 0 : mass / (mass + CONFIDENCE_PSEUDO_MASS)
}

const priorCache = new Map<Department, number[]>()

/**
 * Department centroid used as the prior `p0`.
 *
 * ENGINE_SPEC §4.2 samples 2,000 generated articles per department; the catalog generator was a
 * stub when this module was written, so the centroid is derived from the taxonomy instead: the
 * aesthetic block from `AESTHETIC_PRIOR × deptMult`, the colour block from the per-group colour
 * priors with the department multipliers, axes at 0.5, groups uniform 1/12. Both constructions
 * yield the same shape (a flat, non-committal taste with the department's colour skew).
 */
export function departmentPrior(department: Department): number[] {
  const cached = priorCache.get(department)
  if (cached) return cached.slice()
  const p = zero64()
  // A block
  let total = 0
  const weights = AESTHETICS.map((a) => {
    const w =
      (AESTHETIC_PRIOR[a.slug as AestheticSlug] ?? 1 / 32) * aestheticDeptMult(a.slug, department)
    total += w
    return w
  })
  if (total <= 0) {
    total = AESTHETICS.length
    weights.fill(1)
  }
  AESTHETICS.forEach((a, i) => {
    p[a.index] = (PRIOR_AESTHETIC_MASS * (weights[i] ?? 0)) / total
  })
  // C block: mean over groups of the normalised per-group family prior
  const colour = Array.from({ length: COLOR_FAMILIES.length }, () => 0)
  for (const group of CATEGORY_GROUPS) {
    const row = COLOR_FAMILIES.map((f) => colorFamilyWeight(group, department, f))
    const sum = row.reduce((s, x) => s + x, 0)
    if (sum <= 0) continue
    row.forEach((x, i) => {
      colour[i] = (colour[i] ?? 0) + x / sum / CATEGORY_GROUPS.length
    })
  }
  COLOR_FAMILIES.forEach((family, i) => {
    p[colorFamilyIndex(family)] = PRIOR_COLOR_MASS * (colour[i] ?? 0)
  })
  // X block: 0.5; G block: uniform 1/12
  for (let i = BLOCK.X[0]; i < BLOCK.X[1]; i++) p[i] = 0.5
  for (let i = BLOCK.G[0]; i < BLOCK.G[1]; i++) p[i] = 1 / 12
  priorCache.set(department, p)
  return p.slice()
}

/** Fresh state at the prior (or at a stored vector when one exists). */
export function createState(p0: readonly number[], p?: readonly number[] | null): PreferenceState {
  const base = p && p.length === STYLE_DIMENSIONS ? p : p0
  return { p: Array.from(base), n: 0, mass: 0, lastAt: null }
}

/** Decay `p` toward `p0` in place by `factor`. */
function decayToward(p: number[], p0: readonly number[], factor: number): void {
  if (factor >= 1) return
  for (let i = 0; i < STYLE_DIMENSIONS; i++) {
    const prior = p0[i] ?? 0
    p[i] = prior + ((p[i] ?? 0) - prior) * factor
  }
}

/**
 * Apply one event with vector `v`, reward `r` and learning-rate scale `scale` at time `now`
 * (§4.2). Mutates and returns `state`.
 */
export function applyEvent(
  state: PreferenceState,
  v: ArrayLike<number>,
  r: number,
  scale: number,
  now: Date,
  p0: readonly number[],
): PreferenceState {
  const decay = decayFactor(state.lastAt, now)
  decayToward(state.p, p0, decay)
  const eta = learningRate(state.n, scale)
  const g = r > 0 ? r : NEGATIVE_STEP * r
  const p = state.p
  for (let i = BLOCK.A[0]; i < BLOCK.X[1]; i++) {
    const cur = p[i] ?? 0
    p[i] = clamp01(cur + eta * g * ((v[i] ?? 0) - cur))
  }
  if (r > 0) {
    const keep = 1 - GROUP_EMA * eta
    for (let i = BLOCK.G[0]; i < BLOCK.G[1]; i++) {
      p[i] = keep * (p[i] ?? 0) + GROUP_EMA * eta * (v[i] ?? 0)
    }
  }
  state.n += 1
  state.mass = state.mass * decay + Math.abs(r)
  state.lastAt = state.lastAt && state.lastAt.getTime() > now.getTime() ? state.lastAt : now
  return state
}

export interface EffectiveVector {
  vector: number[]
  confidence: number
  mass: number
}

/** `p_eff = p0 + (p − p0)·2^(−Δdays/45)` and `confidence = mass/(mass + 3)` (mass decayed too). */
export function effective(
  state: PreferenceState,
  now: Date,
  p0: readonly number[],
): EffectiveVector {
  const decay = decayFactor(state.lastAt, now)
  const vector = state.p.slice()
  decayToward(vector, p0, decay)
  const mass = state.mass * decay
  return { vector, confidence: confidenceOf(mass), mass }
}

export interface FoldableEvent {
  vector: ArrayLike<number> | null | undefined
  reward: number
  scale: number
  at: Date
}

/** Replay events (chronological) from the prior; events without a vector still count toward `n`. */
export function foldEvents(
  events: readonly FoldableEvent[],
  p0: readonly number[],
): PreferenceState {
  const state = createState(p0)
  for (const e of events) {
    if (!e.vector) {
      state.n += 1
      const decay = decayFactor(state.lastAt, e.at)
      state.mass = state.mass * decay + Math.abs(e.reward)
      state.lastAt = e.at
      continue
    }
    applyEvent(state, e.vector, e.reward, e.scale, e.at, p0)
  }
  return state
}
