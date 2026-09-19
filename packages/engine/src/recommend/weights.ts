/**
 * Blend-weight arms (ENGINE_SPEC §4.4) and the redistribution rule of §2.3: weights of
 * non-applicable factors are spread proportionally over the applicable positive factors so that
 * `Σ contribution === score` always holds.
 */
import type { FactorName } from '../types'

export const POSITIVE_FACTORS: readonly FactorName[] = [
  'style_similarity',
  'attribute_match',
  'budget_fit',
  'user_preference',
  'social_signal',
  'trend_momentum',
  'brand_affinity',
  'popularity_prior',
]

export const FACTOR_NAMES: readonly FactorName[] = [
  ...POSITIVE_FACTORS,
  'diversity',
  'compatibility',
]

export type ArmName =
  | 'balanced'
  | 'intent-strict'
  | 'taste-led'
  | 'social-led'
  | 'trend-led'
  | 'explore'

type Row = readonly [number, number, number, number, number, number, number, number, number]

// style attr budget pref social trend brand pop λ
const ARM_ROWS: Readonly<Record<ArmName, Row>> = {
  balanced: [0.3, 0.15, 0.1, 0.15, 0.1, 0.07, 0.05, 0.03, 0.15],
  'intent-strict': [0.4, 0.25, 0.12, 0.05, 0.05, 0.03, 0.02, 0.08, 0.15],
  'taste-led': [0.22, 0.12, 0.08, 0.32, 0.08, 0.05, 0.05, 0.03, 0.15],
  'social-led': [0.22, 0.12, 0.08, 0.15, 0.25, 0.05, 0.05, 0.03, 0.15],
  'trend-led': [0.22, 0.12, 0.08, 0.12, 0.1, 0.23, 0.05, 0.03, 0.15],
  explore: [0.28, 0.14, 0.1, 0.14, 0.08, 0.1, 0.02, 0.04, 0.3],
}

/**
 * The §4.4 rows as printed sum to 0.95 (balanced, taste-led, social-led, trend-led) and 0.90
 * (explore); the spec requires the eight positive weights to sum to 1.00, so each row is
 * renormalised here (ratios preserved, λ untouched).
 */
function armWeights(row: Row): Record<FactorName, number> {
  const sum = row[0] + row[1] + row[2] + row[3] + row[4] + row[5] + row[6] + row[7]
  const n = (x: number): number => x / sum
  return {
    style_similarity: n(row[0]),
    attribute_match: n(row[1]),
    budget_fit: n(row[2]),
    user_preference: n(row[3]),
    social_signal: n(row[4]),
    trend_momentum: n(row[5]),
    brand_affinity: n(row[6]),
    popularity_prior: n(row[7]),
    diversity: row[8],
    compatibility: 0,
  }
}

export const ARM_NAMES: readonly ArmName[] = [
  'balanced',
  'intent-strict',
  'taste-led',
  'social-led',
  'trend-led',
  'explore',
]

/** The six arms in table order; positive weights of each sum to 1.00, `diversity` holds λ. */
export const ARMS: Readonly<Record<ArmName, Record<FactorName, number>>> = Object.fromEntries(
  ARM_NAMES.map((name) => [name, armWeights(ARM_ROWS[name])]),
) as Record<ArmName, Record<FactorName, number>>

export const DEFAULT_WEIGHTS: Readonly<Record<FactorName, number>> = ARMS.balanced

/**
 * Merge overrides into the default arm. When any positive weight is overridden the eight
 * positive weights are renormalised to sum 1; `diversity` (λ) and `compatibility` pass through.
 */
export function resolveWeights(
  overrides?: Partial<Record<FactorName, number>> | null,
  base: Readonly<Record<FactorName, number>> = DEFAULT_WEIGHTS,
): Record<FactorName, number> {
  const out: Record<FactorName, number> = { ...base }
  if (!overrides) return out
  let touched = false
  for (const name of FACTOR_NAMES) {
    const v = overrides[name]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[name] = v
      if (name !== 'diversity' && name !== 'compatibility') touched = true
    }
  }
  if (touched) {
    let sum = 0
    for (const name of POSITIVE_FACTORS) sum += Math.max(0, out[name])
    if (sum > 0) for (const name of POSITIVE_FACTORS) out[name] = Math.max(0, out[name]) / sum
  }
  return out
}

/**
 * Effective weights: positive weights of non-applicable factors are redistributed proportionally
 * over the applicable positive factors (Σ over the applicable set equals Σ of all positive
 * weights). `diversity` and `compatibility` are returned unchanged.
 */
export function redistribute(
  weights: Readonly<Record<FactorName, number>>,
  applicable: ReadonlySet<FactorName>,
): Record<FactorName, number> {
  const out: Record<FactorName, number> = { ...weights }
  let total = 0
  let applicableSum = 0
  for (const name of POSITIVE_FACTORS) {
    const w = Math.max(0, weights[name])
    total += w
    if (applicable.has(name)) applicableSum += w
    else out[name] = 0
  }
  if (applicableSum <= 0) {
    // Degenerate: nothing applicable carries weight — spread the total evenly over applicable.
    const names = POSITIVE_FACTORS.filter((n) => applicable.has(n))
    for (const name of names) out[name] = total / names.length
    return out
  }
  const scale = total / applicableSum
  for (const name of POSITIVE_FACTORS)
    if (applicable.has(name)) out[name] = Math.max(0, weights[name]) * scale
  return out
}
