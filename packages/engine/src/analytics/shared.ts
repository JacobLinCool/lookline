/**
 * Shared helpers and lightweight row shapes of the analytics module. Everything here is pure;
 * the only place that touches the database is `queries.ts` (ENGINE_SPEC §6 dependency rule).
 */
import type { InteractionType, LookKind, PurchaseFor } from '@lookline/db'

export const DAY_MS = 86_400_000

/**
 * Days are bucketed in Asia/Taipei (UTC+8) regardless of the host timezone, so the same raw
 * tables always yield the same `trend_signals.day` keys on every machine.
 */
export const DAY_TZ_OFFSET_MINUTES = 480

/** `YYYY-MM-DD` of `d` in the analytics timezone. */
export function dayKey(d: Date): string {
  return new Date(d.getTime() + DAY_TZ_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
}

/** Instant at which the day `key` starts in the analytics timezone. */
export function dayStart(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - DAY_TZ_OFFSET_MINUTES * 60_000)
}

/** Instant at which the day `key` ends (exclusive upper bound). */
export function dayEnd(key: string): Date {
  return new Date(dayStart(key).getTime() + DAY_MS)
}

export function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days between two day keys (`b − a`). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}

/** Age of `t` relative to `now` in fractional days, never negative. */
export function ageDays(now: Date, t: Date): number {
  return Math.max(0, (now.getTime() - t.getTime()) / DAY_MS)
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/** Percentile of a numeric list (linear interpolation); 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = values.toSorted((a, b) => a - b)
  const pos = clamp(p, 0, 1) * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const a = sorted[lo] ?? 0
  const b = sorted[hi] ?? a
  return a + (b - a) * (pos - lo)
}

export function median(values: readonly number[]): number {
  return percentile(values, 0.5)
}

/** Round to `digits` decimals so stored reals and JSON evidence stay tidy. */
export function round(x: number, digits = 4): number {
  const f = 10 ** digits
  return Math.round(x * f) / f
}

/** Deterministic string comparison used for every ordering tie-break. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// ---------------------------------------------------------------------------
// Lightweight row shapes (what the pure functions consume). `queries.ts` maps real rows to these.
// ---------------------------------------------------------------------------

export interface UserLite {
  id: string
  handle: string
  displayName: string
  avatarSeed: number
  tasteCluster: number | null
  socialCluster: number | null
  preferenceVector: number[] | null
  /** Number of feedback events, used to decide who fits the k-means model. */
  eventCount: number
}

export interface InteractionLite {
  id: string
  actorUserId: string
  targetUserId: string | null
  lookId: string | null
  articleId: string | null
  type: InteractionType
  sourceInteractionId: string | null
  createdAt: Date
}

export interface PurchaseLite {
  id: string
  userId: string
  articleId: string
  quantity: number
  price: number
  forKind: PurchaseFor
  forUserId: string | null
  sourceLookId: string | null
  sourceInteractionId: string | null
  intentSessionId: string | null
  createdAt: Date
}

export interface LookLite {
  id: string
  ownerId: string
  kind: LookKind
  parentLookId: string | null
  aesthetics: string[]
  createdAt: Date
}

export interface ParticipantLite {
  lookId: string
  userId: string
  sourceLookId: string | null
}

export interface LookProductLite {
  lookId: string
  articleId: string
}

export interface ProductLite {
  id: string
  categoryGroup: string
  subcategory: string
  colorFamily: string
  price: number
  /** Catalog aesthetic slugs from the vision pass; empty for an article it has not reached. */
  aesthetics: string[]
  /** `articles.attributes`; the design-detail keys in it drive the `detail` dimension. */
  attributes: Record<string, string | number | boolean>
  /** Clustered print motif; `''` for an unprinted article or one the print pass has not read. */
  printMotif: string
}

export interface IntentSessionLite {
  id: string
  userId: string | null
  utterance: string
  mode: string
  aesthetics: string[]
  categoryGroups: string[]
  colorFamilies: string[]
  createdAt: Date
}
