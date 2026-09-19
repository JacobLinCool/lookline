/**
 * Global disjoint LinUCB over the blend-weight arms (ENGINE_SPEC §4.4).
 *
 * Context `x ∈ R^8`: `[1, min(1, n_self/50), 1[recipient other], min(1, |trusted|/10),
 * intent.confidence, 1[mode outfit], 1[budget.max set], min(1, daysSinceSignup/60)]`.
 * Per arm: `A ∈ R^{8×8}` (init `I`), `b ∈ R^8` (init 0), `pulls`, `rewardSum`; α = 0.6.
 * Selection: `θ = A⁻¹b`, `ucb = θᵀx + α·sqrt(xᵀA⁻¹x)`, argmax with ties to table order. Users
 * with fewer than 3 self events are forced to `balanced`.
 *
 * Slates are the unit of reward. `recordSlate(key, …)` has replace-or-add semantics, so the
 * state stays a pure function of the logged events even when a slate's reward is revised as more
 * feedback attaches to it; `rebuildBanditFromEvents` replays `feedback_events` from scratch.
 */
import type { FeedbackKind } from '@lookline/db'
import type { FactorName } from '../types'
import { ARMS, armIndexByName, type Arm } from './arms'
import { axpy, dot, identity, invert, matVec, outerAdd } from './linalg'

export const BANDIT_ALPHA = 0.6
export const CONTEXT_DIM = 8
export const COLD_START_EVENTS = 3
export const MAX_TRACKED_SLATES = 5000
export const SLATE_CLOSE_MS = 24 * 3_600_000
export const BANDIT_STATE_ID = 'global'

export interface ArmState {
  name: string
  /** Row-major 8×8. */
  A: number[]
  b: number[]
  pulls: number
  rewardSum: number
}

export interface SlateRecord {
  arm: number
  x: number[]
  reward: number
}

export interface BanditContextInput {
  /** Self-target event count of the user. */
  eventCount: number
  recipientOther?: boolean
  trustedCount?: number
  /** Intent confidence in [0, 1] (default 0.8). */
  confidence?: number
  outfit?: boolean
  hasBudgetMax?: boolean
  daysSinceSignup?: number
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** The 8-d context vector of §4.4. */
export function contextVector(input: BanditContextInput): number[] {
  return [
    1,
    clamp01(input.eventCount / 50),
    input.recipientOther ? 1 : 0,
    clamp01((input.trustedCount ?? 0) / 10),
    clamp01(input.confidence ?? 0.8),
    input.outfit ? 1 : 0,
    input.hasBudgetMax ? 1 : 0,
    clamp01((input.daysSinceSignup ?? 0) / 60),
  ]
}

/** Coerce anything into a well-formed context vector (unknown → the cold default). */
export function asContextVector(raw: unknown): number[] {
  if (Array.isArray(raw) && raw.length === CONTEXT_DIM && raw.every((x) => typeof x === 'number')) {
    return raw.map((x) => clamp01(Number.isFinite(x) ? x : 0))
  }
  return contextVector({ eventCount: 0 })
}

export interface ArmChoice {
  index: number
  name: string
  weights: Record<FactorName, number>
  /** UCB value per arm (table order); all zero when the choice was forced. */
  ucb: number[]
  /** True when the cold-start rule picked `balanced` without looking at the state. */
  forced: boolean
  reason: string
}

export interface SerializedBandit {
  version: 1
  alpha: number
  arms: ArmState[]
  slates: Array<[string, SlateRecord]>
}

/** Slate reward `R' = (clip(Σ r_e / log2(position + 2), −1, 1) + 1) / 2 ∈ [0, 1]`. */
export function slateReward(
  events: ReadonlyArray<{ reward: number; position?: number | null }>,
): number {
  let sum = 0
  for (const e of events) {
    const pos = Math.max(0, e.position ?? 0)
    sum += e.reward / Math.log2(pos + 2)
  }
  const R = Math.max(-1, Math.min(1, sum))
  return (R + 1) / 2
}

const isNumbers = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x))

export class LinUCB {
  readonly arms: ArmState[]
  readonly alpha: number
  private readonly defs: readonly Arm[]
  private readonly slates = new Map<string, SlateRecord>()

  constructor(defs: readonly Arm[] = ARMS, alpha = BANDIT_ALPHA) {
    this.defs = defs
    this.alpha = alpha
    this.arms = defs.map((d) => ({
      name: d.name,
      A: identity(CONTEXT_DIM),
      b: Array.from({ length: CONTEXT_DIM }, () => 0),
      pulls: 0,
      rewardSum: 0,
    }))
  }

  get size(): number {
    return this.arms.length
  }

  get trackedSlates(): number {
    return this.slates.size
  }

  /** UCB value of every arm for context `x` (table order). */
  ucbValues(x: readonly number[]): number[] {
    return this.arms.map((arm) => {
      const inv = invert(arm.A, CONTEXT_DIM)
      const theta = matVec(inv, arm.b, CONTEXT_DIM)
      const Ax = matVec(inv, x, CONTEXT_DIM)
      const variance = Math.max(0, dot(x, Ax))
      return dot(theta, x) + this.alpha * Math.sqrt(variance)
    })
  }

  /**
   * Choose an arm for context `x`. `eventCount` below the cold-start threshold forces `balanced`
   * (also when `forceBalanced` is set).
   */
  choose(
    x: readonly number[],
    opts: { eventCount?: number; forceBalanced?: boolean } = {},
  ): ArmChoice {
    const cold = opts.forceBalanced || (opts.eventCount ?? Infinity) < COLD_START_EVENTS
    const balanced = Math.max(0, armIndexByName('balanced'))
    if (cold) {
      const def = this.defs[balanced]!
      const missing = Math.max(0, COLD_START_EVENTS - (opts.eventCount ?? 0))
      return {
        index: balanced,
        name: def.name,
        weights: def.weights,
        ucb: this.arms.map(() => 0),
        forced: true,
        reason:
          missing > 0
            ? `balanced — still learning (${missing} more signal${missing === 1 ? '' : 's'} before the blend adapts)`
            : 'balanced — default blend',
      }
    }
    const ucb = this.ucbValues(x)
    let best = 0
    for (let i = 1; i < ucb.length; i++) if ((ucb[i] ?? 0) > (ucb[best] ?? 0)) best = i
    const def = this.defs[best]!
    const arm = this.arms[best]!
    const mean = arm.pulls > 0 ? arm.rewardSum / arm.pulls : 0.5
    return {
      index: best,
      name: def.name,
      weights: def.weights,
      ucb,
      forced: false,
      reason: `${def.name} — highest expected reward for this context (UCB ${(ucb[best] ?? 0).toFixed(2)}, mean slate reward ${mean.toFixed(2)} over ${arm.pulls} slates)`,
    }
  }

  /** Raw LinUCB update: `A += x xᵀ`, `b += r·x`, `pulls += 1`, `rewardSum += r`. */
  update(armIndex: number, x: readonly number[], reward: number): void {
    const arm = this.arms[armIndex]
    if (!arm) return
    outerAdd(arm.A, x, CONTEXT_DIM, 1)
    axpy(arm.b, x, reward)
    arm.pulls += 1
    arm.rewardSum += reward
  }

  hasSlate(key: string): boolean {
    return this.slates.has(key)
  }

  /**
   * Record (or revise) the reward of a slate. A known key replaces its previous contribution
   * (pulls unchanged); a new key adds a pull. The most recent `MAX_TRACKED_SLATES` keys stay
   * revisable; older contributions are frozen into the state.
   */
  recordSlate(key: string, armIndex: number, x: readonly number[], reward: number): void {
    const arm = this.arms[armIndex]
    if (!arm) return
    const prev = this.slates.get(key)
    if (prev) {
      const prevArm = this.arms[prev.arm]
      if (prevArm) {
        outerAdd(prevArm.A, prev.x, CONTEXT_DIM, -1)
        axpy(prevArm.b, prev.x, -prev.reward)
        prevArm.rewardSum -= prev.reward
        if (prev.arm !== armIndex) {
          prevArm.pulls -= 1
          arm.pulls += 1
        }
      }
      outerAdd(arm.A, x, CONTEXT_DIM, 1)
      axpy(arm.b, x, reward)
      arm.rewardSum += reward
      this.slates.delete(key)
      this.slates.set(key, { arm: armIndex, x: Array.from(x), reward })
      return
    }
    this.update(armIndex, x, reward)
    this.slates.set(key, { arm: armIndex, x: Array.from(x), reward })
    while (this.slates.size > MAX_TRACKED_SLATES) {
      const oldest = this.slates.keys().next().value
      if (oldest === undefined) break
      this.slates.delete(oldest)
    }
  }

  /** Per-arm summary for the profile card. */
  summary(): Array<{ name: string; pulls: number; meanReward: number }> {
    return this.arms.map((a) => ({
      name: a.name,
      pulls: a.pulls,
      meanReward: a.pulls > 0 ? a.rewardSum / a.pulls : 0,
    }))
  }

  serialize(): SerializedBandit {
    return {
      version: 1,
      alpha: this.alpha,
      arms: this.arms.map((a) => ({
        name: a.name,
        A: a.A.slice(),
        b: a.b.slice(),
        pulls: a.pulls,
        rewardSum: a.rewardSum,
      })),
      slates: Array.from(this.slates.entries()).map(([k, s]) => [k, { ...s, x: s.x.slice() }]),
    }
  }

  /** Tolerant deserialiser: anything malformed yields a fresh state. Arms are matched by name. */
  static deserialize(raw: unknown, defs: readonly Arm[] = ARMS): LinUCB {
    const bandit = new LinUCB(defs)
    if (!raw || typeof raw !== 'object') return bandit
    const data = raw as Partial<SerializedBandit>
    if (data.version !== 1 || !Array.isArray(data.arms)) return bandit
    for (const armRaw of data.arms) {
      if (!armRaw || typeof armRaw !== 'object') continue
      const idx = defs.findIndex((d) => d.name === armRaw.name)
      const target = bandit.arms[idx]
      if (!target) continue
      if (isNumbers(armRaw.A, CONTEXT_DIM * CONTEXT_DIM)) target.A = armRaw.A.slice()
      if (isNumbers(armRaw.b, CONTEXT_DIM)) target.b = armRaw.b.slice()
      if (typeof armRaw.pulls === 'number' && Number.isFinite(armRaw.pulls))
        target.pulls = armRaw.pulls
      if (typeof armRaw.rewardSum === 'number' && Number.isFinite(armRaw.rewardSum)) {
        target.rewardSum = armRaw.rewardSum
      }
    }
    if (Array.isArray(data.slates)) {
      for (const entry of data.slates) {
        if (!Array.isArray(entry) || entry.length !== 2) continue
        const [key, slate] = entry as [unknown, Partial<SlateRecord> | undefined]
        if (typeof key !== 'string' || !slate || typeof slate !== 'object') continue
        const armName = data.arms[slate.arm ?? -1]?.name
        const arm = armName === undefined ? -1 : defs.findIndex((d) => d.name === armName)
        if (arm < 0 || !isNumbers(slate.x, CONTEXT_DIM) || typeof slate.reward !== 'number')
          continue
        bandit.slates.set(key, { arm, x: slate.x.slice(), reward: slate.reward })
      }
    }
    return bandit
  }
}

// ---------------------------------------------------------------------------
// Replay from feedback_events
// ---------------------------------------------------------------------------

export interface BanditEventRow {
  id: string
  userId: string
  intentSessionId: string | null
  kind: FeedbackKind
  reward: number
  position: number | null
  context: Record<string, unknown>
  createdAt: Date
}

export interface ReplaySlate {
  key: string
  userId: string
  intentSessionId: string
  arm: number
  x: number[]
  at: Date
  reward: number
  /** Number of reward (non-impression) events attributed to the slate. */
  attributed: number
}

/** Slate key of an impression batch. */
export function slateKey(userId: string, intentSessionId: string): string {
  return `${userId}|${intentSessionId}`
}

/**
 * Group impression batches (by user + intent session) with the reward events attributed to them.
 * A slate is closed when the same user has a later slate or when `now − slateAt ≥ 24 h`; only
 * closed slates are returned (chronological order). Impressions without an `intentSessionId` or
 * without a known `armId` cannot be attributed and are skipped.
 */
export function collectSlates(
  rows: readonly BanditEventRow[],
  now: Date,
  opts: { includeOpen?: boolean } = {},
): ReplaySlate[] {
  const byKey = new Map<
    string,
    ReplaySlate & { events: Array<{ reward: number; position: number | null }> }
  >()
  const sorted = rows
    .slice()
    .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
  for (const row of sorted) {
    if (row.kind !== 'impression' || !row.intentSessionId) continue
    const key = slateKey(row.userId, row.intentSessionId)
    if (byKey.has(key)) continue
    const armName = typeof row.context['armId'] === 'string' ? row.context['armId'] : 'balanced'
    const arm = armIndexByName(armName)
    if (arm < 0) continue
    byKey.set(key, {
      key,
      userId: row.userId,
      intentSessionId: row.intentSessionId,
      arm,
      x: asContextVector(row.context['contextVector']),
      at: row.createdAt,
      reward: 0.5,
      attributed: 0,
      events: [],
    })
  }
  for (const row of sorted) {
    if (row.kind === 'impression' || !row.intentSessionId) continue
    const slate = byKey.get(slateKey(row.userId, row.intentSessionId))
    if (!slate) continue
    const position =
      row.position ??
      (typeof row.context['position'] === 'number' ? (row.context['position'] as number) : null)
    slate.events.push({ reward: row.reward, position })
  }
  const slates = Array.from(byKey.values()).toSorted(
    (a, b) => a.at.getTime() - b.at.getTime() || (a.key < b.key ? -1 : 1),
  )
  const lastByUser = new Map<string, ReplaySlate>()
  for (const s of slates) lastByUser.set(s.userId, s)
  const out: ReplaySlate[] = []
  for (const s of slates) {
    const isLast = lastByUser.get(s.userId) === s
    const closed = !isLast || now.getTime() - s.at.getTime() >= SLATE_CLOSE_MS
    if (!closed && !opts.includeOpen) continue
    const { events, ...rest } = s
    out.push({ ...rest, reward: slateReward(events), attributed: events.length })
  }
  return out
}

/** Rebuild the global bandit by replaying the last `MAX_TRACKED_SLATES` closed slates. */
export function rebuildBanditFromEvents(
  rows: readonly BanditEventRow[],
  now: Date,
  opts: { maxSlates?: number; defs?: readonly Arm[] } = {},
): LinUCB {
  const bandit = new LinUCB(opts.defs ?? ARMS)
  const slates = collectSlates(rows, now)
  const max = opts.maxSlates ?? MAX_TRACKED_SLATES
  const start = Math.max(0, slates.length - max)
  for (let i = start; i < slates.length; i++) {
    const s = slates[i]!
    bandit.recordSlate(s.key, s.arm, s.x, s.reward)
  }
  return bandit
}
