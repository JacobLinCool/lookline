/**
 * Every SQL/drizzle query of the analytics module (ENGINE_SPEC §6). Reads map real rows to the
 * lightweight shapes in `shared.ts`; writes are delete-then-insert rebuilds (D1 has no explicit
 * transactions) chunked under the 100-parameter limit, so `runAnalytics` is idempotent.
 */
import {
  and,
  asks,
  askResponses,
  brands,
  desc,
  eq,
  evaluationRuns,
  feedbackEvents,
  gte,
  inArray,
  insertAll,
  interactions,
  intentSessions,
  isNotNull,
  lineageStats,
  lookParticipants,
  lookProducts,
  looks,
  lte,
  manufacturingRecommendations,
  or,
  products,
  purchases,
  relationships,
  rowsOf,
  sql,
  trendSignals,
  users,
  type Database,
  type EvaluationRun,
  type LineageStat,
  type Look,
  type ManufacturingRecommendation,
  type Product,
  type Relationship,
  type TrendSignal,
} from '@lookline/db'
import type { UserSummary } from '../types'
import type { RelationshipRow } from './graph/relationships'
import { DAY_MS } from './shared'
import type {
  AskLite,
  AskResponseLite,
  IntentSessionLite,
  InteractionLite,
  LookLite,
  LookProductLite,
  ParticipantLite,
  ProductLite,
  PurchaseLite,
  UserLite,
} from './shared'
import type { LineageStatRow } from './trend/lineage'
import type { ManufacturingRow, SupplyCell } from './trend/manufacturing'
import { supplyKey } from './trend/manufacturing'
import type { TrendSignalRow } from './trend/signals'

const CHUNK = 1000
const ID_CHUNK = 5000

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** SQLite/D1 reject NaN and ±Infinity parameters; derived metrics store 0 instead. */
function finite<T extends Record<string, unknown>>(row: T): T {
  for (const key of Object.keys(row)) {
    const value = row[key]
    if (typeof value === 'number' && !Number.isFinite(value))
      (row as Record<string, unknown>)[key] = 0
  }
  return row
}

export function toUserSummary(u: {
  id: string
  handle: string
  displayName: string
  avatarSeed: number
  tasteCluster: number | null
  socialCluster: number | null
}): UserSummary {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarSeed: u.avatarSeed,
    tasteCluster: u.tasteCluster,
    socialCluster: u.socialCluster,
  }
}

const USER_SUMMARY_COLUMNS = {
  id: users.id,
  handle: users.handle,
  displayName: users.displayName,
  avatarSeed: users.avatarSeed,
  tasteCluster: users.tasteCluster,
  socialCluster: users.socialCluster,
} as const

// ---------------------------------------------------------------------------
// runAnalytics inputs
// ---------------------------------------------------------------------------

export interface AnalyticsRaw {
  users: UserLite[]
  interactions: InteractionLite[]
  purchases: PurchaseLite[]
  asks: AskLite[]
  askResponses: AskResponseLite[]
  looks: LookLite[]
  lookProducts: LookProductLite[]
  participants: ParticipantLite[]
  intents: IntentSessionLite[]
  products: Map<number, ProductLite>
  supply: Map<string, SupplyCell>
}

export async function loadUsersLite(db: Database): Promise<UserLite[]> {
  const [rows, counts] = await Promise.all([
    db
      .select({
        ...USER_SUMMARY_COLUMNS,
        preferenceVector: users.preferenceVector,
      })
      .from(users),
    db
      .select({ userId: feedbackEvents.userId, n: sql<number>`count(*)` })
      .from(feedbackEvents)
      .groupBy(feedbackEvents.userId),
  ])
  const eventCount = new Map(counts.map((c) => [c.userId, Number(c.n)]))
  return rows.map((u) => ({
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarSeed: u.avatarSeed,
    tasteCluster: u.tasteCluster,
    socialCluster: u.socialCluster,
    preferenceVector: u.preferenceVector ?? null,
    eventCount: eventCount.get(u.id) ?? 0,
  }))
}

export async function loadInteractionsLite(
  db: Database,
  since: Date,
  until: Date,
): Promise<InteractionLite[]> {
  return db
    .select({
      id: interactions.id,
      actorUserId: interactions.actorUserId,
      targetUserId: interactions.targetUserId,
      lookId: interactions.lookId,
      productId: interactions.productId,
      askId: interactions.askId,
      type: interactions.type,
      sourceInteractionId: interactions.sourceInteractionId,
      createdAt: interactions.createdAt,
    })
    .from(interactions)
    .where(and(gte(interactions.createdAt, since), lte(interactions.createdAt, until)))
    .orderBy(interactions.createdAt, interactions.id)
}

export async function loadPurchasesLite(db: Database, until: Date): Promise<PurchaseLite[]> {
  return db
    .select({
      id: purchases.id,
      userId: purchases.userId,
      productId: purchases.productId,
      quantity: purchases.quantity,
      price: purchases.price,
      forKind: purchases.forKind,
      forUserId: purchases.forUserId,
      sourceLookId: purchases.sourceLookId,
      sourceAskId: purchases.sourceAskId,
      sourceInteractionId: purchases.sourceInteractionId,
      intentSessionId: purchases.intentSessionId,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(lte(purchases.createdAt, until))
    .orderBy(purchases.createdAt, purchases.id)
}

export async function loadLooksLite(db: Database, until?: Date): Promise<LookLite[]> {
  const query = db
    .select({
      id: looks.id,
      ownerId: looks.ownerId,
      kind: looks.kind,
      parentLookId: looks.parentLookId,
      aesthetics: looks.aesthetics,
      createdAt: looks.createdAt,
    })
    .from(looks)
  const rows = until ? await query.where(lte(looks.createdAt, until)) : await query
  return rows.map((r) => ({ ...r, aesthetics: asStringArray(r.aesthetics) }))
}

export async function loadParticipants(db: Database): Promise<ParticipantLite[]> {
  return db
    .select({
      lookId: lookParticipants.lookId,
      userId: lookParticipants.userId,
      sourceLookId: lookParticipants.sourceLookId,
    })
    .from(lookParticipants)
}

export async function loadLookProductsLite(db: Database): Promise<LookProductLite[]> {
  return db
    .select({ lookId: lookProducts.lookId, productId: lookProducts.productId })
    .from(lookProducts)
}

export async function loadIntentsLite(
  db: Database,
  since: Date,
  until: Date,
): Promise<IntentSessionLite[]> {
  const rows = await db
    .select({
      id: intentSessions.id,
      userId: intentSessions.userId,
      utterance: intentSessions.utterance,
      intent: intentSessions.intent,
      createdAt: intentSessions.createdAt,
    })
    .from(intentSessions)
    .where(and(gte(intentSessions.createdAt, since), lte(intentSessions.createdAt, until)))
  return rows.map((r) => {
    const intent = (r.intent ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      userId: r.userId,
      utterance: r.utterance,
      mode: typeof intent.mode === 'string' ? intent.mode : 'single',
      aesthetics: asStringArray(intent.aesthetics),
      categoryGroups: asStringArray(intent.categoryGroups),
      colorFamilies: asStringArray(intent.colorFamilies),
      createdAt: r.createdAt,
    }
  })
}

export async function loadProductsLite(
  db: Database,
  ids: Iterable<number>,
): Promise<Map<number, ProductLite>> {
  const unique = [...new Set(ids)].filter((id) => Number.isFinite(id))
  const out = new Map<number, ProductLite>()
  for (const part of chunks(unique, ID_CHUNK)) {
    const rows = await db
      .select({
        id: products.id,
        aesthetics: products.aesthetics,
        categoryGroup: products.categoryGroup,
        subcategory: products.subcategory,
        colorFamily: products.colorFamily,
        silhouette: products.silhouette,
        silhouetteId: products.silhouetteId,
        stock: products.stock,
        price: products.price,
      })
      .from(products)
      .where(inArray(products.id, part))
    for (const r of rows) out.set(r.id, { ...r, aesthetics: asStringArray(r.aesthetics) })
  }
  return out
}

/** In-stock counts per (aesthetic, group, colour) and per (aesthetic, group). */
export async function loadSupply(db: Database): Promise<Map<string, SupplyCell>> {
  const result = await db.all(sql`
    select a.value as aesthetic, category_group as "group", color_family as color,
           count(*) as supply, count(*) filter (where stock < 5) as low
    from products, json_each(products.aesthetics) as a
    where stock > 0
    group by 1, 2, 3
  `)
  const out = new Map<string, SupplyCell>()
  for (const row of rowsOf<{
    aesthetic: string
    group: string
    color: string
    supply: number
    low: number
  }>(result)) {
    const supply = Number(row.supply)
    const low = Number(row.low)
    out.set(supplyKey(row.aesthetic, row.group, row.color), { supply, lowStock: low })
    const pairKey = supplyKey(row.aesthetic, row.group, null)
    const pair = out.get(pairKey) ?? { supply: 0, lowStock: 0 }
    pair.supply += supply
    pair.lowStock += low
    out.set(pairKey, pair)
  }
  return out
}

export async function loadAnalyticsRaw(
  db: Database,
  now: Date,
  opts: { interactionDays?: number; intentDays?: number } = {},
): Promise<AnalyticsRaw> {
  const interactionSince = new Date(now.getTime() - (opts.interactionDays ?? 180) * DAY_MS)
  const intentSince = new Date(now.getTime() - (opts.intentDays ?? 14) * DAY_MS)
  const [usersLite, ixs, pus, askRows, responses, lookRows, lps, participants, intents, supply] =
    await Promise.all([
      loadUsersLite(db),
      loadInteractionsLite(db, interactionSince, now),
      loadPurchasesLite(db, now),
      db
        .select({
          id: asks.id,
          askerId: asks.askerId,
          targetUserId: asks.targetUserId,
          lookId: asks.lookId,
          createdAt: asks.createdAt,
        })
        .from(asks),
      db
        .select({
          askId: askResponses.askId,
          responderUserId: askResponses.responderUserId,
          choiceProductId: askResponses.choiceProductId,
          styledLookId: askResponses.styledLookId,
          createdAt: askResponses.createdAt,
        })
        .from(askResponses),
      loadLooksLite(db, now),
      loadLookProductsLite(db),
      loadParticipants(db),
      loadIntentsLite(db, intentSince, now),
      loadSupply(db),
    ])
  const productIds = new Set<number>()
  for (const ix of ixs) if (ix.productId != null) productIds.add(ix.productId)
  for (const p of pus) productIds.add(p.productId)
  for (const lp of lps) productIds.add(lp.productId)
  const productMap = await loadProductsLite(db, productIds)
  return {
    users: usersLite,
    interactions: ixs,
    purchases: pus,
    asks: askRows,
    askResponses: responses,
    looks: lookRows,
    lookProducts: lps,
    participants,
    intents,
    products: productMap,
    supply,
  }
}

// ---------------------------------------------------------------------------
// runAnalytics writes (each a transactional rebuild)
// ---------------------------------------------------------------------------

export async function rebuildRelationships(
  db: Database,
  rows: readonly RelationshipRow[],
  computedAt: Date,
): Promise<number> {
  await db.delete(relationships)
  await insertAll(
    db,
    relationships,
    rows.map((r) =>
      finite({
        aUserId: r.aUserId,
        bUserId: r.bUserId,
        kind: r.kind,
        weight: r.weight,
        count: r.count,
        lastAt: r.lastAt,
        computedAt,
      }),
    ),
  )
  return rows.length
}

/**
 * `UPDATE users SET <column> = …` for many ids with one JSON parameter per statement:
 * `json_each` over an `{ id: value }` object joins key → value.
 */
async function batchUpdateInt(
  db: Database,
  column: 'taste_cluster' | 'social_cluster',
  values: ReadonlyMap<string, number>,
): Promise<void> {
  const entries = [...values.entries()]
  for (const part of chunks(entries, CHUNK)) {
    const json = JSON.stringify(Object.fromEntries(part))
    await db.run(
      sql`update users set ${sql.raw(column)} = (select j.value from json_each(${json}) as j where j.key = users.id)
          where users.id in (select key from json_each(${json}))`,
    )
  }
}

export async function writeTasteClusters(
  db: Database,
  assignments: ReadonlyMap<string, number>,
): Promise<void> {
  await db.update(users).set({ tasteCluster: null })
  await batchUpdateInt(db, 'taste_cluster', assignments)
}

/** Only touches the users given (those whose `socialCluster` was null). */
export async function writeSocialClusters(
  db: Database,
  assignments: ReadonlyMap<string, number>,
): Promise<void> {
  if (assignments.size === 0) return
  await batchUpdateInt(db, 'social_cluster', assignments)
}

export async function rebuildLineageStats(
  db: Database,
  rows: readonly LineageStatRow[],
  computedAt: Date,
): Promise<number> {
  await db.delete(lineageStats)
  await insertAll(
    db,
    lineageStats,
    rows.map((r) => finite({ ...r, computedAt })),
  )
  return rows.length
}

export function trendSignalId(day: string, dimension: string, key: string): string {
  return `ts_${day}_${dimension}_${key}`
}

export async function rebuildTrendSignals(
  db: Database,
  rows: readonly TrendSignalRow[],
  fromDay: string,
  toDay: string,
  computedAt: Date,
): Promise<number> {
  await db
    .delete(trendSignals)
    .where(and(gte(trendSignals.day, fromDay), lte(trendSignals.day, toDay)))
  await insertAll(
    db,
    trendSignals,
    rows.map((r) =>
      finite({
        id: trendSignalId(r.day, r.dimension, r.key),
        day: r.day,
        dimension: r.dimension,
        key: r.key,
        volume: r.volume,
        velocity: r.velocity,
        crossCluster: r.crossCluster,
        conversion: r.conversion,
        gmv: r.gmv,
        momentum: r.momentum,
        emerging: r.emerging,
        evidence: r.evidence as Record<string, unknown>,
        computedAt,
      }),
    ),
  )
  return rows.length
}

export async function rebuildManufacturing(
  db: Database,
  rows: readonly ManufacturingRow[],
  computedAt: Date,
): Promise<number> {
  await db.delete(manufacturingRecommendations)
  await insertAll(
    db,
    manufacturingRecommendations,
    rows.map((r) =>
      finite({
        id: r.id,
        rank: r.rank,
        aesthetic: r.aesthetic,
        categoryGroup: r.categoryGroup,
        subcategory: r.subcategory,
        colorFamily: r.colorFamily,
        momentum: r.momentum,
        confidence: r.confidence,
        projectedDemand: r.projectedDemand,
        rationale: r.rationale,
        evidence: r.evidence,
        computedAt,
      }),
    ),
  )
  return rows.length
}

export async function updateTrendScores(
  db: Database,
  scores: ReadonlyMap<number, number>,
): Promise<void> {
  await db
    .update(products)
    .set({ trendScore: 0 })
    .where(sql`${products.trendScore} <> 0`)
  const entries = [...scores.entries()]
  for (const part of chunks(entries, CHUNK)) {
    const json = JSON.stringify(
      Object.fromEntries(part.map(([id, s]) => [String(id), Number.isFinite(s) ? s : 0])),
    )
    await db.run(
      sql`update products set trend_score = (select j.value from json_each(${json}) as j where j.key = cast(products.id as text))
          where products.id in (select cast(key as integer) from json_each(${json}))`,
    )
  }
}

// ---------------------------------------------------------------------------
// Dashboard reads
// ---------------------------------------------------------------------------

export async function latestSignalDay(db: Database, upTo: string): Promise<string | null> {
  const rows = await db
    .select({ day: sql<string | null>`max(${trendSignals.day})` })
    .from(trendSignals)
    .where(lte(trendSignals.day, upTo))
  const day = rows[0]?.day
  return typeof day === 'string' ? day : day ? String(day) : null
}

export async function signalsOnDay(db: Database, day: string): Promise<TrendSignal[]> {
  return db
    .select()
    .from(trendSignals)
    .where(eq(trendSignals.day, day))
    .orderBy(desc(trendSignals.momentum))
}

export interface HeadlineRaw {
  looks: number
  remixes: number
  togethers: number
  asks: number
  shares: number
  purchases: number
  purchasesFromLooks: number
  gmvFromLooks: number
  activePeople: number
  crossClusterRemixes: number
  clusteredRemixes: number
  avgLineageDepth: number
}

export async function loadHeadline(db: Database, from: Date, to: Date): Promise<HeadlineRaw> {
  // Raw SQL takes integer milliseconds; drizzle builders map Dates themselves.
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const inWindow = <T extends { createdAt: typeof looks.createdAt }>(t: T) =>
    and(gte(t.createdAt, from), lte(t.createdAt, to))
  const [lookCounts, askCount, shareCount, purchaseCounts, active, cross, depth] =
    await Promise.all([
      db
        .select({
          looks: sql<number>`count(*)`,
          remixes: sql<number>`count(*) filter (where ${looks.kind} = 'remix')`,
          togethers: sql<number>`count(*) filter (where ${looks.kind} = 'together')`,
        })
        .from(looks)
        .where(inWindow(looks)),
      db
        .select({ n: sql<number>`count(*)` })
        .from(asks)
        .where(and(gte(asks.createdAt, from), lte(asks.createdAt, to))),
      db
        .select({ n: sql<number>`count(*)` })
        .from(interactions)
        .where(
          and(
            eq(interactions.type, 'SHARE'),
            gte(interactions.createdAt, from),
            lte(interactions.createdAt, to),
          ),
        ),
      db
        .select({
          purchases: sql<number>`count(*)`,
          fromLooks: sql<number>`count(*) filter (where ${purchases.sourceLookId} is not null)`,
          gmvFromLooks: sql<number>`coalesce(sum(${purchases.price} * ${purchases.quantity}) filter (where ${purchases.sourceLookId} is not null), 0)`,
        })
        .from(purchases)
        .where(and(gte(purchases.createdAt, from), lte(purchases.createdAt, to))),
      db.all(sql`
      select count(distinct id) as n from (
        select actor_user_id as id from interactions
          where created_at >= ${fromMs} and created_at <= ${toMs}
        union
        select user_id as id from purchases
          where created_at >= ${fromMs} and created_at <= ${toMs}
      ) t
    `),
      db.all(sql`
      select count(*) filter (where uo.taste_cluster <> up.taste_cluster) as crossed, count(*) as total
      from looks l
      join looks p on p.id = l.parent_look_id
      join users uo on uo.id = l.owner_id
      join users up on up.id = p.owner_id
      where l.kind = 'remix'
        and l.created_at >= ${fromMs} and l.created_at <= ${toMs}
        and uo.taste_cluster is not null and up.taste_cluster is not null
    `),
      db
        .select({ avg: sql<number | null>`avg(${lineageStats.depth})` })
        .from(lineageStats)
        .innerJoin(looks, eq(looks.id, lineageStats.rootLookId))
        .where(inWindow(looks)),
    ])
  const lc = lookCounts[0]
  const pc = purchaseCounts[0]
  const activeRow = rowsOf<{ n: number }>(active)[0]
  const crossRow = rowsOf<{ crossed: number; total: number }>(cross)[0]
  return {
    looks: Number(lc?.looks ?? 0),
    remixes: Number(lc?.remixes ?? 0),
    togethers: Number(lc?.togethers ?? 0),
    asks: Number(askCount[0]?.n ?? 0),
    shares: Number(shareCount[0]?.n ?? 0),
    purchases: Number(pc?.purchases ?? 0),
    purchasesFromLooks: Number(pc?.fromLooks ?? 0),
    gmvFromLooks: Number(pc?.gmvFromLooks ?? 0),
    activePeople: Number(activeRow?.n ?? 0),
    crossClusterRemixes: Number(crossRow?.crossed ?? 0),
    clusteredRemixes: Number(crossRow?.total ?? 0),
    avgLineageDepth: Number(depth[0]?.avg ?? 0),
  }
}

export interface TopLineageRaw {
  stats: LineageStat
  look: Look
  owner: UserSummary
  products: Product[]
}

export async function loadTopLineages(db: Database, limit: number): Promise<TopLineageRaw[]> {
  const rows = await db
    .select({ stats: lineageStats, look: looks, owner: USER_SUMMARY_COLUMNS })
    .from(lineageStats)
    .innerJoin(looks, eq(looks.id, lineageStats.rootLookId))
    .innerJoin(users, eq(users.id, looks.ownerId))
    .orderBy(
      desc(lineageStats.nodes),
      desc(lineageStats.uniquePeople),
      desc(lineageStats.gmv),
      desc(lineageStats.lastAt),
      lineageStats.rootLookId,
    )
    .limit(limit)
  const productsByLook = await loadLookProductRows(
    db,
    rows.map((r) => r.look.id),
  )
  return rows.map((r) => ({
    stats: r.stats,
    look: r.look,
    owner: toUserSummary(r.owner),
    products: (productsByLook.get(r.look.id) ?? []).map(({ brandName: _brand, ...p }) => p),
  }))
}

export async function loadLookProductRows(
  db: Database,
  lookIds: readonly string[],
): Promise<Map<string, Array<Product & { brandName: string }>>> {
  const out = new Map<string, Array<Product & { brandName: string }>>()
  if (lookIds.length === 0) return out
  const rows = await db
    .select({
      lookId: lookProducts.lookId,
      position: lookProducts.position,
      product: products,
      brandName: brands.name,
    })
    .from(lookProducts)
    .innerJoin(products, eq(products.id, lookProducts.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(inArray(lookProducts.lookId, [...lookIds]))
    .orderBy(lookProducts.lookId, lookProducts.position, lookProducts.productId)
  for (const r of rows) {
    const list = out.get(r.lookId)
    const item = { ...r.product, brandName: r.brandName }
    if (list) list.push(item)
    else out.set(r.lookId, [item])
  }
  return out
}

export interface ClusterSummaryRaw {
  id: number
  size: number
  centroid: number[]
}

/** Cluster sizes and centroids (mean preference vector), averaged in-process. */
export async function loadClusterSummaries(db: Database): Promise<ClusterSummaryRaw[]> {
  const rows = await db
    .select({ id: users.tasteCluster, vector: users.preferenceVector })
    .from(users)
    .where(isNotNull(users.tasteCluster))
  const acc = new Map<number, { size: number; sum: number[]; n: number }>()
  for (const r of rows) {
    const id = Number(r.id)
    const entry = acc.get(id) ?? { size: 0, sum: [], n: 0 }
    entry.size += 1
    if (r.vector && r.vector.length > 0) {
      if (entry.sum.length === 0) entry.sum = Array.from({ length: r.vector.length }, () => 0)
      for (let i = 0; i < r.vector.length; i++) entry.sum[i] = (entry.sum[i] ?? 0) + r.vector[i]!
      entry.n += 1
    }
    acc.set(id, entry)
  }
  return [...acc.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([id, e]) => ({
      id,
      size: e.size,
      centroid: e.n > 0 ? e.sum.map((x) => x / e.n) : [],
    }))
}

export async function loadManufacturing(db: Database): Promise<ManufacturingRecommendation[]> {
  return db.select().from(manufacturingRecommendations).orderBy(manufacturingRecommendations.rank)
}

export async function loadLatestEvaluation(db: Database): Promise<EvaluationRun | null> {
  const rows = await db
    .select()
    .from(evaluationRuns)
    .orderBy(desc(evaluationRuns.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function loadUserSummaries(
  db: Database,
  ids: readonly string[],
): Promise<Map<string, UserSummary>> {
  const out = new Map<string, UserSummary>()
  if (ids.length === 0) return out
  const rows = await db
    .select(USER_SUMMARY_COLUMNS)
    .from(users)
    .where(inArray(users.id, [...ids]))
  for (const r of rows) out.set(r.id, toUserSummary(r))
  return out
}

export async function loadClusterMap(db: Database): Promise<Map<string, number | null>> {
  const rows = await db.select({ id: users.id, tasteCluster: users.tasteCluster }).from(users)
  return new Map(rows.map((r) => [r.id, r.tasteCluster]))
}

export async function loadPurchasesFromLooks(db: Database): Promise<PurchaseLite[]> {
  return db
    .select({
      id: purchases.id,
      userId: purchases.userId,
      productId: purchases.productId,
      quantity: purchases.quantity,
      price: purchases.price,
      forKind: purchases.forKind,
      forUserId: purchases.forUserId,
      sourceLookId: purchases.sourceLookId,
      sourceAskId: purchases.sourceAskId,
      sourceInteractionId: purchases.sourceInteractionId,
      intentSessionId: purchases.intentSessionId,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(isNotNull(purchases.sourceLookId))
}

// ---------------------------------------------------------------------------
// Lineage reads
// ---------------------------------------------------------------------------

export async function loadLook(db: Database, id: string): Promise<Look | null> {
  const rows = await db.select().from(looks).where(eq(looks.id, id)).limit(1)
  return rows[0] ?? null
}

export async function loadLooksById(db: Database, ids: readonly string[]): Promise<Look[]> {
  if (ids.length === 0) return []
  return db
    .select()
    .from(looks)
    .where(inArray(looks.id, [...ids]))
}

/** First parent of a look: `parent_look_id`, else the first participant `source_look_id`. */
export async function loadParentId(db: Database, look: Look): Promise<string | null> {
  if (look.parentLookId) return look.parentLookId
  if (look.kind !== 'together') return null
  const rows = await db
    .select({ sourceLookId: lookParticipants.sourceLookId })
    .from(lookParticipants)
    .where(and(eq(lookParticipants.lookId, look.id), isNotNull(lookParticipants.sourceLookId)))
    .orderBy(lookParticipants.userId)
    .limit(1)
  return rows[0]?.sourceLookId ?? null
}

/** Children of the given looks: by `parent_look_id` and via Together participants. */
export async function loadChildren(db: Database, parentIds: readonly string[]): Promise<Look[]> {
  if (parentIds.length === 0) return []
  const ids = [...parentIds]
  const [direct, viaParticipants] = await Promise.all([
    db.select().from(looks).where(inArray(looks.parentLookId, ids)),
    db
      .select({ lookId: lookParticipants.lookId })
      .from(lookParticipants)
      .where(inArray(lookParticipants.sourceLookId, ids)),
  ])
  const seen = new Set(direct.map((l) => l.id))
  const extraIds = [...new Set(viaParticipants.map((p) => p.lookId))].filter((id) => !seen.has(id))
  const extra =
    extraIds.length > 0 ? await db.select().from(looks).where(inArray(looks.id, extraIds)) : []
  return [...direct, ...extra.filter((l) => l.kind === 'together')]
}

export async function loadParticipantsFor(
  db: Database,
  lookIds: readonly string[],
): Promise<ParticipantLite[]> {
  if (lookIds.length === 0) return []
  return db
    .select({
      lookId: lookParticipants.lookId,
      userId: lookParticipants.userId,
      sourceLookId: lookParticipants.sourceLookId,
    })
    .from(lookParticipants)
    .where(inArray(lookParticipants.lookId, [...lookIds]))
}

export async function loadInteractionsForLooks(
  db: Database,
  lookIds: readonly string[],
): Promise<InteractionLite[]> {
  if (lookIds.length === 0) return []
  return db
    .select({
      id: interactions.id,
      actorUserId: interactions.actorUserId,
      targetUserId: interactions.targetUserId,
      lookId: interactions.lookId,
      productId: interactions.productId,
      askId: interactions.askId,
      type: interactions.type,
      sourceInteractionId: interactions.sourceInteractionId,
      createdAt: interactions.createdAt,
    })
    .from(interactions)
    .where(inArray(interactions.lookId, [...lookIds]))
}

export async function loadPurchasesForLooks(
  db: Database,
  lookIds: readonly string[],
): Promise<PurchaseLite[]> {
  if (lookIds.length === 0) return []
  return db
    .select({
      id: purchases.id,
      userId: purchases.userId,
      productId: purchases.productId,
      quantity: purchases.quantity,
      price: purchases.price,
      forKind: purchases.forKind,
      forUserId: purchases.forUserId,
      sourceLookId: purchases.sourceLookId,
      sourceAskId: purchases.sourceAskId,
      sourceInteractionId: purchases.sourceInteractionId,
      intentSessionId: purchases.intentSessionId,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(inArray(purchases.sourceLookId, [...lookIds]))
}

export async function loadLineageStat(
  db: Database,
  rootLookId: string,
): Promise<LineageStat | null> {
  const rows = await db
    .select()
    .from(lineageStats)
    .where(eq(lineageStats.rootLookId, rootLookId))
    .limit(1)
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Network reads
// ---------------------------------------------------------------------------

export async function loadUserSummary(db: Database, id: string): Promise<UserSummary | null> {
  const rows = await db.select(USER_SUMMARY_COLUMNS).from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ? toUserSummary(rows[0]) : null
}

export async function loadEdges(db: Database, userId: string): Promise<Relationship[]> {
  return db
    .select()
    .from(relationships)
    .where(or(eq(relationships.aUserId, userId), eq(relationships.bUserId, userId)))
    .orderBy(
      desc(relationships.weight),
      relationships.aUserId,
      relationships.bUserId,
      relationships.kind,
    )
}
