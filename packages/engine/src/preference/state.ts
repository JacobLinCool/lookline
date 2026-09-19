/**
 * Persistence of the global bandit state in `bandit_state` (single row `id = 'global'`), with a
 * replay-based rebuild from `feedback_events` when the row is missing and a process-level cache
 * when the table itself is absent (ENGINE_SPEC §4.4).
 */
import { and, banditState, desc, eq, feedbackEvents, isNotNull, type Database } from '@lookline/db'
import { BANDIT_STATE_ID, LinUCB, rebuildBanditFromEvents, type BanditEventRow } from './bandit'

/** Rows loaded for a rebuild (newest first in SQL, replayed oldest first). */
export const REBUILD_ROW_LIMIT = 60_000

let memoryFallback: LinUCB | null = null
let warned = false

function warnOnce(error: unknown): void {
  if (warned) return
  warned = true
  console.warn(
    '@lookline/engine: bandit_state is unavailable, keeping the bandit in a process-level cache',
    error instanceof Error ? error.message : error,
  )
}

/** Feedback rows that carry an intent session (impressions + attributed rewards). */
export async function loadBanditEvents(
  db: Database,
  limit = REBUILD_ROW_LIMIT,
): Promise<BanditEventRow[]> {
  const rows = await db
    .select({
      id: feedbackEvents.id,
      userId: feedbackEvents.userId,
      intentSessionId: feedbackEvents.intentSessionId,
      kind: feedbackEvents.kind,
      reward: feedbackEvents.reward,
      position: feedbackEvents.position,
      context: feedbackEvents.context,
      createdAt: feedbackEvents.createdAt,
    })
    .from(feedbackEvents)
    .where(isNotNull(feedbackEvents.intentSessionId))
    .orderBy(desc(feedbackEvents.createdAt), desc(feedbackEvents.id))
    .limit(limit)
  return rows.toReversed()
}

/**
 * Load the global bandit. A missing row is rebuilt by replay (and saved) when `rebuild` is true
 * (default); a missing table falls back to the in-process cache.
 */
export async function loadBanditState(
  db: Database,
  opts: { now: Date; rebuild?: boolean },
): Promise<LinUCB> {
  try {
    const [row] = await db
      .select()
      .from(banditState)
      .where(eq(banditState.id, BANDIT_STATE_ID))
      .limit(1)
    if (row) return LinUCB.deserialize(row.payload)
    if (opts.rebuild === false) return new LinUCB()
    const events = await loadBanditEvents(db)
    const bandit = rebuildBanditFromEvents(events, opts.now)
    await saveBanditState(db, bandit, opts.now)
    return bandit
  } catch (error) {
    warnOnce(error)
    if (!memoryFallback) {
      try {
        memoryFallback = rebuildBanditFromEvents(await loadBanditEvents(db), opts.now)
      } catch {
        memoryFallback = new LinUCB()
      }
    }
    return memoryFallback
  }
}

/** Upsert the global row (no-op besides the cache when the table is absent). */
export async function saveBanditState(db: Database, bandit: LinUCB, now: Date): Promise<void> {
  const payload = bandit.serialize() as unknown as Record<string, unknown>
  try {
    await db
      .insert(banditState)
      .values({ id: BANDIT_STATE_ID, payload, updatedAt: now })
      .onConflictDoUpdate({ target: banditState.id, set: { payload, updatedAt: now } })
  } catch (error) {
    warnOnce(error)
    memoryFallback = bandit
  }
}

/** Rebuild from every attributed event and persist — used by analytics after a replay. */
export async function rebuildAndSaveBanditState(db: Database, now: Date): Promise<LinUCB> {
  const bandit = rebuildBanditFromEvents(await loadBanditEvents(db), now)
  await saveBanditState(db, bandit, now)
  return bandit
}

/** Rows of one user's slate (impressions + rewards of an intent session). */
export async function loadSlateEvents(
  db: Database,
  userId: string,
  intentSessionId: string,
): Promise<BanditEventRow[]> {
  return db
    .select({
      id: feedbackEvents.id,
      userId: feedbackEvents.userId,
      intentSessionId: feedbackEvents.intentSessionId,
      kind: feedbackEvents.kind,
      reward: feedbackEvents.reward,
      position: feedbackEvents.position,
      context: feedbackEvents.context,
      createdAt: feedbackEvents.createdAt,
    })
    .from(feedbackEvents)
    .where(
      and(eq(feedbackEvents.userId, userId), eq(feedbackEvents.intentSessionId, intentSessionId)),
    )
}
