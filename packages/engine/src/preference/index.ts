/**
 * Engine 03 — preference feedback loop (contract entry points).
 *
 * `recordFeedback` writes the `feedback_events` row, updates the user's self/gift vectors with
 * the online rule of `update.ts`, writes a `preference_snapshots` row every 10 events or on a
 * purchase, and revises the bandit's slate reward when the event is attributed to an intent
 * session. `getPreferenceProfile` loads the rows and delegates to the pure `buildProfile`.
 * `evaluatePreferenceLoop` is the pure evaluation harness of `evaluate.ts`.
 */
import { nanoid } from 'nanoid'
import {
  and,
  brands,
  desc,
  eq,
  feedbackEvents,
  looks,
  ne,
  preferenceSnapshots,
  articles,
  relationships,
  users,
  type Database,
  type RelationshipKind,
} from '@lookline/db'
import { TRUST_MIN, trustFromRows } from '../recommend/context'
import type { FeedbackInput, PreferenceProfile } from '../types'
import { collectSlates } from './bandit'
import {
  buildProfile,
  eventsByTarget,
  foldMeta,
  snapshotMetrics,
  topAestheticsOf,
  type ProfileEvent,
} from './profile'
import { rewardFor, type RewardTarget } from './rewards'
import { loadBanditState, loadSlateEvents, saveBanditState } from './state'
import { applyEvent, departmentPrior, effective, type PreferenceState } from './update'
import { asVector } from './vector'

export { evaluatePreferenceLoop } from './evaluate'

export const SNAPSHOT_EVERY = 10
const PROFILE_EVENT_LIMIT = 2000

async function loadEventVector(
  db: Database,
  articleId: string | null | undefined,
  lookId: string | null | undefined,
): Promise<number[] | null> {
  if (articleId != null) {
    const [row] = await db
      .select({ vector: articles.styleVector })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1)
    const v = asVector(row?.vector)
    if (v) return v
  }
  if (lookId) {
    const [row] = await db
      .select({ vector: looks.styleVector })
      .from(looks)
      .where(eq(looks.id, lookId))
      .limit(1)
    return asVector(row?.vector)
  }
  return null
}

/** The user's feedback events (newest first in SQL) joined with product/brand/look for vectors and names. */
async function loadProfileEvents(
  db: Database,
  userId: string,
  limit = PROFILE_EVENT_LIMIT,
): Promise<ProfileEvent[]> {
  const rows = await db
    .select({
      id: feedbackEvents.id,
      kind: feedbackEvents.kind,
      reward: feedbackEvents.reward,
      position: feedbackEvents.position,
      forOthers: feedbackEvents.forOthers,
      context: feedbackEvents.context,
      createdAt: feedbackEvents.createdAt,
      articleId: feedbackEvents.articleId,
      lookId: feedbackEvents.lookId,
      intentSessionId: feedbackEvents.intentSessionId,
      productVector: articles.styleVector,
      productName: articles.name,
      brandName: brands.name,
      lookVector: looks.styleVector,
    })
    .from(feedbackEvents)
    .leftJoin(articles, eq(feedbackEvents.articleId, articles.id))
    .leftJoin(brands, eq(articles.brandId, brands.id))
    .leftJoin(looks, eq(feedbackEvents.lookId, looks.id))
    .where(eq(feedbackEvents.userId, userId))
    .orderBy(desc(feedbackEvents.createdAt), desc(feedbackEvents.id))
    .limit(limit)
  return rows.toReversed().map((r) => ({
    id: r.id,
    kind: r.kind,
    reward: r.reward,
    position: r.position,
    forOthers: r.forOthers,
    context: r.context ?? {},
    createdAt: r.createdAt,
    articleId: r.articleId,
    lookId: r.lookId,
    intentSessionId: r.intentSessionId,
    vector: asVector(r.productVector) ?? asVector(r.lookVector),
    productName: r.productName,
    brandName: r.brandName,
  }))
}

/**
 * Record one feedback event and learn from it. `id` and `createdAt` may be supplied for
 * deterministic simulations; at runtime they default to a nanoid and the current time (the only
 * clock read in this module).
 */
export async function recordFeedback(db: Database, input: FeedbackInput): Promise<void> {
  const now = input.createdAt ?? new Date()
  const id = input.id ?? `fb_${nanoid(16)}`
  const { reward, targets } = rewardFor(input)
  await db.insert(feedbackEvents).values({
    id,
    userId: input.userId,
    articleId: input.articleId ?? null,
    lookId: input.lookId ?? null,
    intentSessionId: input.intentSessionId ?? null,
    kind: input.kind,
    reward,
    position: input.position ?? null,
    forOthers: input.forOthers ?? false,
    context: input.context ?? {},
    createdAt: now,
  })
  if (input.kind === 'impression' || targets.length === 0) return

  const [user] = await db
    .select({
      id: users.id,
      department: users.department,
      preferenceVector: users.preferenceVector,
      giftPreferenceVector: users.giftPreferenceVector,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)
  if (!user) return
  const p0 = departmentPrior(user.department)
  const vector = await loadEventVector(db, input.articleId, input.lookId)

  // Meta state (n, mass, lastAt) of each target from the events before this one.
  const prior = await db
    .select({
      id: feedbackEvents.id,
      kind: feedbackEvents.kind,
      reward: feedbackEvents.reward,
      forOthers: feedbackEvents.forOthers,
      context: feedbackEvents.context,
      createdAt: feedbackEvents.createdAt,
    })
    .from(feedbackEvents)
    .where(
      and(
        eq(feedbackEvents.userId, input.userId),
        ne(feedbackEvents.kind, 'impression'),
        ne(feedbackEvents.id, id),
      ),
    )
  const byTarget = eventsByTarget(prior)
  const states: Record<RewardTarget, PreferenceState> = {
    self: { p: asVector(user.preferenceVector) ?? p0.slice(), ...foldMeta(byTarget.self) },
    gift: { p: asVector(user.giftPreferenceVector) ?? p0.slice(), ...foldMeta(byTarget.gift) },
  }
  const previousSelf = asVector(user.preferenceVector)
  const touched = new Set<RewardTarget>()
  for (const { target, scale } of targets) {
    const state = states[target]
    if (vector) applyEvent(state, vector, reward, scale, now, p0)
    else {
      state.n += 1
      state.mass += Math.abs(reward)
      state.lastAt = now
    }
    touched.add(target)
  }
  await db
    .update(users)
    .set({
      ...(touched.has('self') ? { preferenceVector: states.self.p } : {}),
      ...(touched.has('gift') ? { giftPreferenceVector: states.gift.p } : {}),
      lastSeenAt: now,
    })
    .where(eq(users.id, input.userId))

  // Snapshot every SNAPSHOT_EVERY events or on a purchase.
  const eventCount = prior.length + 1
  if (eventCount % SNAPSHOT_EVERY === 0 || input.kind === 'purchase') {
    const [latest] = await db
      .select({ version: preferenceSnapshots.version })
      .from(preferenceSnapshots)
      .where(eq(preferenceSnapshots.userId, input.userId))
      .orderBy(desc(preferenceSnapshots.version))
      .limit(1)
    const events = await loadProfileEvents(db, input.userId, 200)
    const selfEvents = eventsByTarget(events).self
    const eff = effective(states.self, now, p0)
    const top = topAestheticsOf(eff.vector, selfEvents, 'self', now, states.self.n).map((a) => ({
      aesthetic: a.slug,
      weight: a.weight,
      confidence: a.confidence,
      evidence: a.evidence,
    }))
    await db.insert(preferenceSnapshots).values({
      id: `ps_${id}`,
      userId: input.userId,
      version: (latest?.version ?? 0) + 1,
      vector: eff.vector,
      topAesthetics: top,
      metrics: snapshotMetrics(states.self, states.gift, now, p0, previousSelf),
      eventCount,
      createdAt: now,
    })
  }

  // Bandit: revise the slate reward of the intent session this event is attributed to.
  if (input.intentSessionId) {
    const rows = await loadSlateEvents(db, input.userId, input.intentSessionId)
    const [slate] = collectSlates(rows, now, { includeOpen: true })
    if (slate) {
      const bandit = await loadBanditState(db, { now })
      bandit.recordSlate(slate.key, slate.arm, slate.x, slate.reward)
      await saveBanditState(db, bandit, now)
    }
  }
}

/** Learned preference profile with evidence, snapshots and the bandit summary (§4.3). */
export async function getPreferenceProfile(
  db: Database,
  userId: string,
): Promise<PreferenceProfile> {
  const now = new Date()
  const [user] = await db
    .select({
      id: users.id,
      department: users.department,
      createdAt: users.createdAt,
      preferenceVector: users.preferenceVector,
      giftPreferenceVector: users.giftPreferenceVector,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) {
    return buildProfile({
      userId,
      department: 'unisex',
      createdAt: now,
      preferenceVector: null,
      giftPreferenceVector: null,
      events: [],
      snapshots: [],
      bandit: null,
      now,
    })
  }
  const [events, snapshots, trusted, bandit] = await Promise.all([
    loadProfileEvents(db, userId),
    db
      .select({
        version: preferenceSnapshots.version,
        createdAt: preferenceSnapshots.createdAt,
        metrics: preferenceSnapshots.metrics,
      })
      .from(preferenceSnapshots)
      .where(eq(preferenceSnapshots.userId, userId))
      .orderBy(desc(preferenceSnapshots.version))
      .limit(10),
    db
      .select({ b: relationships.bUserId, kind: relationships.kind, weight: relationships.weight })
      .from(relationships)
      .where(eq(relationships.aUserId, userId)),
    loadBanditState(db, { now }),
  ])
  return buildProfile({
    userId,
    department: user.department,
    createdAt: user.createdAt,
    preferenceVector: asVector(user.preferenceVector),
    giftPreferenceVector: asVector(user.giftPreferenceVector),
    events,
    snapshots,
    bandit,
    trustedCount: countTrusted(trusted),
    now,
  })
}

/** People `userId` trusts by the same rule the recommender's social channel uses. */
function countTrusted(
  rows: ReadonlyArray<{ b: string; kind: RelationshipKind; weight: number }>,
): number {
  const byPerson = new Map<string, Array<{ kind: RelationshipKind; weight: number }>>()
  for (const r of rows) byPerson.set(r.b, [...(byPerson.get(r.b) ?? []), r])
  let n = 0
  for (const edges of byPerson.values()) if (trustFromRows(edges) >= TRUST_MIN) n++
  return n
}

// Additions to the contract surface (distinctively named to avoid barrel collisions).
export { REWARDS, REWARD_VARIANTS, rewardFor } from './rewards'
export type { RewardResolution, RewardTarget } from './rewards'
export {
  applyEvent,
  effective,
  departmentPrior,
  learningRate,
  confidenceOf,
  foldEvents,
  createState,
} from './update'
export type { PreferenceState } from './update'
export {
  LinUCB,
  contextVector,
  slateReward,
  collectSlates,
  rebuildBanditFromEvents,
  BANDIT_STATE_ID,
} from './bandit'
export type { ArmChoice, BanditEventRow, SerializedBandit } from './bandit'
export { loadBanditState, saveBanditState, rebuildAndSaveBanditState } from './state'
export { buildProfile, describeEvent } from './profile'
export type { ProfileEvent, ProfileInput } from './profile'
// `resolveAestheticTables` is exported from './aesthetic-tables' only: another module already
// exports that name through the package barrel.
export { ARCHETYPES, makeSyntheticUsers } from './sim-users'
export type { SyntheticUser } from './sim-users'
export { DEFAULT_EVAL_CONFIG, EVAL_CONDITIONS, PASS_CRITERION } from './evaluate'
export type { EvalCondition, PreferenceEvalOptions } from './evaluate'
