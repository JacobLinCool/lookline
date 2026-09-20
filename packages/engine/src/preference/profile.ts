/**
 * Pure profile builder behind `getPreferenceProfile` (ENGINE_SPEC §4.3): effective vectors, top
 * aesthetics with confidence and evidence strings built from the actual feedback events, colour
 * families, axes, the gift profile, snapshots, and the bandit summary.
 */
import { AXES, COLOR_FAMILIES, axisIndex, colorFamilyIndex } from '@lookline/catalog'
import type { Axis, ColorFamily } from '@lookline/catalog'
import type { Department, FeedbackKind } from '@lookline/db'
import type { PreferenceAesthetic, PreferenceProfile } from '../types'
import { ARMS } from './arms'
import { collectSlates, contextVector, type BanditEventRow, type LinUCB } from './bandit'
import { rewardFor, type RewardTarget } from './rewards'
import {
  createState,
  decayFactor,
  departmentPrior,
  effective,
  foldEvents,
  type PreferenceState,
} from './update'
import { BLOCK, asVector } from './vector'

export interface ProfileEvent {
  id: string
  kind: FeedbackKind
  reward: number
  position: number | null
  forOthers: boolean
  context: Record<string, unknown>
  createdAt: Date
  articleId: string | null
  cardId: string | null
  intentSessionId: string | null
  /** Article style vector; `null` when the product is gone. */
  vector: number[] | null
  productName?: string | null
  brandName?: string | null
}

export interface ProfileInput {
  userId: string
  department: Department
  /** User signup time (bandit context `daysSinceSignup`). */
  createdAt: Date
  preferenceVector: number[] | null
  giftPreferenceVector: number[] | null
  /** Feedback events of the user (any order). */
  events: readonly ProfileEvent[]
  snapshots: ReadonlyArray<{ version: number; createdAt: Date; metrics: Record<string, number> }>
  bandit?: LinUCB | null
  trustedCount?: number
  now: Date
}

/** Minimum self events before a profile shows aesthetics ("still learning" below). */
export const MIN_PROFILE_EVENTS = 3
export const TOP_AESTHETICS = 5
export const TOP_AESTHETIC_WEIGHT = 0.25
/** Fallback floor used to fill the card up to three rows when few dims pass the main threshold. */
export const TOP_AESTHETIC_FLOOR = 0.15
export const TAG_MEMBERSHIP = 0.4
export const EVIDENCE_WINDOW = 200
export const EVIDENCE_LINES = 3

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The fields routing and meta folding need; `ProfileEvent` adds vectors and names. */
export type MinimalEvent = Pick<
  ProfileEvent,
  'id' | 'kind' | 'reward' | 'forOthers' | 'context' | 'createdAt'
>

export interface TargetEvent<T extends MinimalEvent = ProfileEvent> {
  event: T
  reward: number
  scale: number
}

/** Split the user's events by the vector(s) they update (§4.1 routing). */
export function eventsByTarget<T extends MinimalEvent>(
  events: readonly T[],
): Record<RewardTarget, TargetEvent<T>[]> {
  const out: Record<RewardTarget, TargetEvent<T>[]> = { self: [], gift: [] }
  const sorted = events
    .slice()
    .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
  for (const event of sorted) {
    if (event.kind === 'impression') continue
    const { targets } = rewardFor(event)
    for (const t of targets) out[t.target].push({ event, reward: event.reward, scale: t.scale })
  }
  return out
}

/** `n`, decayed mass and `lastAt` of a target from its events (no vector work). */
export function foldMeta(
  events: ReadonlyArray<TargetEvent<MinimalEvent>>,
): Pick<PreferenceState, 'n' | 'mass' | 'lastAt'> {
  let n = 0
  let mass = 0
  let lastAt: Date | null = null
  for (const { event, reward } of events) {
    const decay = decayFactor(lastAt, event.createdAt)
    mass = mass * decay + Math.abs(reward)
    n += 1
    if (!lastAt || event.createdAt.getTime() > lastAt.getTime()) lastAt = event.createdAt
  }
  return { n, mass, lastAt }
}

/** State of a target: the stored vector when present, otherwise a replay of the events. */
export function targetState(
  stored: number[] | null,
  events: readonly TargetEvent[],
  p0: readonly number[],
): PreferenceState {
  const vector = asVector(stored)
  if (vector) return { p: vector, ...foldMeta(events) }
  return foldEvents(
    events.map((e) => ({
      vector: e.event.vector,
      reward: e.reward,
      scale: e.scale,
      at: e.event.createdAt,
    })),
    p0,
  )
}

function verbFor(e: ProfileEvent, target: RewardTarget): string {
  switch (e.kind) {
    case 'click':
      return 'clicked'
    case 'save':
      return 'saved'
    case 'dismiss':
      return 'dismissed'
    case 'add_to_bag':
      return 'added to bag'
    case 'purchase':
      return 'bought'
    case 'impression':
    default:
      return target === 'gift' ? 'browsed for someone' : 'browsed'
  }
}

function itemName(e: ProfileEvent): string {
  const name = [e.brandName, e.productName]
    .filter((s) => typeof s === 'string' && s.length > 0)
    .join(' ')
  if (name) return name
  if (e.cardId) return 'a card'
  return 'an item'
}

function recipientSuffix(e: ProfileEvent, target: RewardTarget): string {
  if (target !== 'gift') return ''
  const label = e.context['forLabel'] ?? e.context['relation'] ?? e.context['recipient']
  return typeof label === 'string' && label.length > 0 ? ` for ${label}` : ' for someone else'
}

function shortDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`.trim()
}

/** "saved Northline wool coat (+0.40, 3 Sep)" / "bought Loom Wool Overcoat for dad (+1.00, 12 Aug)". */
export function describeEvent(e: ProfileEvent, target: RewardTarget = 'self'): string {
  const sign = e.reward >= 0 ? '+' : '−'
  return `${verbFor(e, target)} ${itemName(e)}${recipientSuffix(e, target)} (${sign}${Math.abs(e.reward).toFixed(2)}, ${shortDate(e.createdAt)})`
}

/** Top aesthetics of an effective vector with confidence and evidence (§4.3). */
/**
 * Was: the style tags a person's learned vector leans into, with the events that taught them.
 * The style space has no aesthetic dimensions any more — the H&M catalogue names no aesthetic —
 * so there is nothing to rank and this reports none. The colour families and axes below carry
 * what the profile can still say. Restore this with the aesthetic block.
 */
export function topAestheticsOf(
  _vector: readonly number[],
  _events: readonly TargetEvent[],
  _target: RewardTarget,
  _now: Date,
  _n: number,
): PreferenceAesthetic[] {
  return []
}

function topColours(vector: readonly number[]): Array<{ family: ColorFamily; weight: number }> {
  return COLOR_FAMILIES.map((family) => ({ family, weight: vector[colorFamilyIndex(family)] ?? 0 }))
    .filter((c) => c.weight > 0)
    .toSorted(
      (a, b) =>
        b.weight - a.weight || COLOR_FAMILIES.indexOf(a.family) - COLOR_FAMILIES.indexOf(b.family),
    )
    .slice(0, 3)
}

function axesOf(vector: readonly number[]): Record<Axis, number> {
  return Object.fromEntries(AXES.map((axis) => [axis, vector[axisIndex(axis)] ?? 0])) as Record<
    Axis,
    number
  >
}

/** Build the profile from loaded rows. */
export function buildProfile(input: ProfileInput): PreferenceProfile {
  const p0 = departmentPrior(input.department)
  const byTarget = eventsByTarget(input.events)
  const selfState = targetState(input.preferenceVector, byTarget.self, p0)
  const giftState = targetState(input.giftPreferenceVector, byTarget.gift, p0)
  const self = effective(selfState, input.now, p0)
  const gift = effective(giftState, input.now, p0)
  const hasSelf = selfState.n >= 1
  const hasGift = giftState.n >= 1
  const eventCount = input.events.filter((e) => e.kind !== 'impression').length

  const rows: BanditEventRow[] = input.events.map((e) => ({
    id: e.id,
    userId: input.userId,
    intentSessionId: e.intentSessionId,
    kind: e.kind,
    reward: e.reward,
    position: e.position,
    context: e.context,
    createdAt: e.createdAt,
  }))
  const slates = collectSlates(rows, input.now, { includeOpen: true })
  const armStats = ARMS.map((arm, index) => {
    const mine = slates.filter((s) => s.arm === index)
    const pulls = mine.length
    const meanReward = pulls > 0 ? mine.reduce((s, x) => s + x.reward, 0) / pulls : 0
    const hits = mine.filter((s) => s.reward > 0.5).length
    return { name: arm.name, pulls, meanReward, hits }
  })

  let current: string | undefined
  let reason: string | undefined
  if (input.bandit) {
    const daysSinceSignup = Math.max(
      0,
      (input.now.getTime() - input.createdAt.getTime()) / 86_400_000,
    )
    const x = contextVector({
      eventCount: selfState.n,
      trustedCount: input.trustedCount ?? 0,
      hasBudgetMax: false,
      daysSinceSignup,
    })
    const choice = input.bandit.choose(x, { eventCount: selfState.n })
    current = choice.name
    const stat = armStats[choice.index]
    reason =
      !choice.forced && stat && stat.pulls > 0
        ? `${choice.name} — ${stat.hits} of ${stat.pulls} slate${stat.pulls === 1 ? '' : 's'} under this blend earned a positive reward for you`
        : choice.reason
  }

  const profile: PreferenceProfile = {
    userId: input.userId,
    vector: hasSelf ? self.vector : null,
    giftVector: hasGift ? gift.vector : null,
    eventCount,
    topAesthetics: hasSelf
      ? topAestheticsOf(self.vector, byTarget.self, 'self', input.now, selfState.n)
      : [],
    topColorFamilies: hasSelf ? topColours(self.vector) : [],
    axes: axesOf(hasSelf ? self.vector : p0),
    giftTopAesthetics: hasGift
      ? topAestheticsOf(gift.vector, byTarget.gift, 'gift', input.now, giftState.n)
      : [],
    giftTopColorFamilies: hasGift ? topColours(gift.vector) : [],
    snapshots: input.snapshots
      .slice()
      .toSorted((a, b) => b.version - a.version)
      .slice(0, 10)
      .map((s) => ({ version: s.version, createdAt: s.createdAt, metrics: s.metrics })),
    bandit: {
      arms: armStats.map(({ name, pulls, meanReward }) => ({ name, pulls, meanReward })),
      ...(current ? { current } : {}),
      ...(reason ? { reason } : {}),
    },
  }
  return profile
}

/** Snapshot metrics of §4.1: `{ mass, confidence, giftMass, giftEventCount, cosToPrevious }`. */
export function snapshotMetrics(
  selfState: PreferenceState,
  giftState: PreferenceState,
  now: Date,
  p0: readonly number[],
  previous: readonly number[] | null,
): Record<string, number> {
  const self = effective(selfState, now, p0)
  const gift = effective(giftState, now, p0)
  let cosToPrevious = 1
  if (previous) {
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = BLOCK.C[0]; i < BLOCK.G[1]; i++) {
      const a = self.vector[i] ?? 0
      const b = previous[i] ?? 0
      dot += a * b
      na += a * a
      nb += b * b
    }
    cosToPrevious = na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
  }
  return {
    mass: self.mass,
    confidence: self.confidence,
    n: selfState.n,
    giftMass: gift.mass,
    giftEventCount: giftState.n,
    cosToPrevious,
  }
}

export { createState }
