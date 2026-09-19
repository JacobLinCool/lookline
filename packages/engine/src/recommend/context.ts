/**
 * Loads the `RankContext` inputs from the database (ENGINE_SPEC §2.4 "load RankContext"): user
 * vectors and counts, trusted people (§5.1 trust composite), brand counts (90 d), the latest
 * trend signals, `max(popularity)` (cached 10 min) and the database clock.
 */
import {
  and,
  brands,
  eq,
  feedbackEvents,
  gte,
  inArray,
  or,
  articles,
  relationships,
  sql,
  sqlDaysAgoMs,
  sqlNowMs,
  trendSignals,
  users,
} from '@lookline/db'
import type { Database, RelationshipKind } from '@lookline/db'
import type { BrandCounts, RankUser, TrendStat } from './factors'
import type { ChannelParams, TrendEvidence, TrustedUser } from './retrieve'

export interface ContextInput {
  user: RankUser | null
  trend: Map<string, TrendStat>
  trendChannel: ChannelParams['trend']
  popularityMax: number
  now: Date
  /** brand slug / lower-cased name → id, for `brand:` tokens. */
  brandIds: Map<string, number>
}

export function emptyContext(now: Date): ContextInput {
  return {
    user: null,
    trend: new Map(),
    trendChannel: null,
    popularityMax: 1,
    now,
    brandIds: new Map(),
  }
}

const TRUST_WEIGHTS: Readonly<Partial<Record<RelationshipKind, number>>> = {
  trusts: 1,
  inspired_by: 0.7,
  styles: 0.6,
  asks: 0.5,
  shops_with: 0.5,
  buys_for: 0.3,
}

export const TRUST_MIN = 0.3
export const TRUSTED_MAX = 20

/** §5.1 `trust(A, B)` from the relationship rows A → B. */
export function trustFromRows(
  rows: ReadonlyArray<{ kind: RelationshipKind; weight: number }>,
): number {
  let t = 0
  for (const r of rows) t += (TRUST_WEIGHTS[r.kind] ?? 0) * r.weight
  return Math.min(1, Math.max(0, t))
}

interface PopularityCache {
  value: number
  at: number
}

const popularityCache = new WeakMap<object, PopularityCache>()
const POPULARITY_TTL_MS = 10 * 60 * 1000

async function popularityMax(db: Database): Promise<number> {
  const cached = popularityCache.get(db)
  const nowMs = performance.now()
  if (cached && nowMs - cached.at < POPULARITY_TTL_MS) return cached.value
  const rows = await db
    .select({ max: sql<number | null>`max(${articles.popularity})` })
    .from(articles)
  const value = Number(rows[0]?.max ?? 0) || 1
  popularityCache.set(db, { value, at: nowMs })
  return value
}

async function dbNow(db: Database): Promise<Date> {
  const row = await db.get<{ now: number | string }>(sql`select ${sqlNowMs()} as now`)
  return new Date(Number(row?.now ?? 0))
}

export const TREND_CHANNEL_MIN_MOMENTUM = 60

const top = (xs: TrendEvidence[]): TrendEvidence[] =>
  xs.toSorted((a, b) => b.momentum - a.momentum).slice(0, 5)

async function loadTrend(
  db: Database,
): Promise<{ trend: Map<string, TrendStat>; channel: ChannelParams['trend'] }> {
  const rows = await db
    .select({
      dimension: trendSignals.dimension,
      key: trendSignals.key,
      momentum: trendSignals.momentum,
      velocity: trendSignals.velocity,
      emerging: trendSignals.emerging,
      crossCluster: trendSignals.crossCluster,
    })
    .from(trendSignals)
    .where(eq(trendSignals.day, sql`(select max(${trendSignals.day}) from ${trendSignals})`))
  const trend = new Map<string, TrendStat>()
  const aesthetics: TrendEvidence[] = []
  const categories: TrendEvidence[] = []
  for (const r of rows) {
    trend.set(`${r.dimension}:${r.key}`, {
      momentum: r.momentum,
      velocity: r.velocity,
      emerging: r.emerging,
      crossCluster: r.crossCluster,
    })
    if (r.momentum < TREND_CHANNEL_MIN_MOMENTUM) continue
    const ev: TrendEvidence = {
      dimension: r.dimension,
      key: r.key,
      momentum: r.momentum,
      emerging: r.emerging,
    }
    if (r.dimension === 'aesthetic') aesthetics.push(ev)
    else if (r.dimension === 'category') categories.push(ev)
  }
  const channel =
    trend.size > 0 ? { aesthetics: top(aesthetics), categories: top(categories) } : null
  return { trend, channel }
}

async function loadUser(db: Database, userId: string): Promise<RankUser | null> {
  const [userRows, countRows, brandRows, relRows] = await Promise.all([
    db
      .select({
        id: users.id,
        department: users.department,
        budgetHint: users.budgetHint,
        preference: users.preferenceVector,
        giftPreference: users.giftPreferenceVector,
      })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({
        self: sql<number>`count(*) filter (where not ${feedbackEvents.forOthers})`,
        gift: sql<number>`count(*) filter (where ${feedbackEvents.forOthers})`,
      })
      .from(feedbackEvents)
      .where(eq(feedbackEvents.userId, userId)),
    db
      .select({ brandId: articles.brandId, kind: feedbackEvents.kind, n: sql<number>`count(*)` })
      .from(feedbackEvents)
      .innerJoin(articles, eq(articles.id, feedbackEvents.articleId))
      .where(
        and(
          eq(feedbackEvents.userId, userId),
          inArray(feedbackEvents.kind, ['purchase', 'save', 'dismiss']),
          gte(feedbackEvents.createdAt, sqlDaysAgoMs(90)),
        ),
      )
      .groupBy(articles.brandId, feedbackEvents.kind),
    db
      .select({
        bUserId: relationships.bUserId,
        kind: relationships.kind,
        weight: relationships.weight,
        displayName: users.displayName,
      })
      .from(relationships)
      .innerJoin(users, eq(users.id, relationships.bUserId))
      .where(eq(relationships.aUserId, userId)),
  ])
  const u = userRows[0]
  if (!u) return null
  const brandCounts = new Map<number, BrandCounts>()
  for (const r of brandRows) {
    const c = brandCounts.get(r.brandId) ?? { purchases: 0, saves: 0, dismisses: 0 }
    const n = Number(r.n)
    if (r.kind === 'purchase') c.purchases += n
    else if (r.kind === 'save') c.saves += n
    else if (r.kind === 'dismiss') c.dismisses += n
    brandCounts.set(r.brandId, c)
  }
  const byPerson = new Map<
    string,
    { displayName: string; rows: Array<{ kind: RelationshipKind; weight: number }> }
  >()
  for (const r of relRows) {
    const entry = byPerson.get(r.bUserId) ?? { displayName: r.displayName, rows: [] }
    entry.rows.push({ kind: r.kind, weight: r.weight })
    byPerson.set(r.bUserId, entry)
  }
  const trusted: TrustedUser[] = []
  for (const [id, entry] of byPerson) {
    const strength = trustFromRows(entry.rows)
    if (strength >= TRUST_MIN)
      trusted.push({ userId: id, displayName: entry.displayName, strength })
  }
  const ranked = trusted.toSorted(
    (a, b) => b.strength - a.strength || a.userId.localeCompare(b.userId),
  )
  return {
    id: u.id,
    department: u.department,
    eventCount: Number(countRows[0]?.self ?? 0),
    giftEventCount: Number(countRows[0]?.gift ?? 0),
    preference: u.preference ?? null,
    giftPreference: u.giftPreference ?? null,
    budgetHint: u.budgetHint ?? null,
    brandCounts,
    trusted: ranked.slice(0, TRUSTED_MAX),
  }
}

async function loadBrandIds(db: Database, tokens: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const keys = [...new Set(tokens.map((t) => t.trim().toLowerCase()).filter(Boolean))]
  if (keys.length === 0) return out
  const rows = await db
    .select({ id: brands.id, slug: brands.slug, name: brands.name })
    .from(brands)
    .where(or(inArray(brands.slug, keys), inArray(sql`lower(${brands.name})`, keys)))
  for (const r of rows) {
    out.set(r.slug, r.id)
    out.set(r.name.toLowerCase(), r.id)
  }
  return out
}

export interface LoadContextOptions {
  userId?: string | null
  brandTokens?: readonly string[]
}

export async function loadContext(
  db: Database,
  opts: LoadContextOptions = {},
): Promise<ContextInput> {
  const [user, trendData, popMax, now, brandIds] = await Promise.all([
    opts.userId ? loadUser(db, opts.userId) : Promise.resolve(null),
    loadTrend(db),
    popularityMax(db),
    dbNow(db),
    loadBrandIds(db, opts.brandTokens ?? []),
  ])
  return {
    user,
    trend: trendData.trend,
    trendChannel: trendData.channel,
    popularityMax: popMax,
    now,
    brandIds,
  }
}
