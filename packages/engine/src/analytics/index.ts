import {
  articles,
  cards,
  desc,
  evaluationRuns,
  feedbackEvents,
  gte,
  intentSessions,
  manufacturingRecommendations,
  preferenceSnapshots,
  purchases,
  searchTrends,
  trendSignals,
  users,
  type Article,
  type Database,
  type TrendDimension,
} from '@lookline/db'
import { nanoid } from 'nanoid'
import type { AnalyticsSummary, TrendDashboard, TrendSeries } from '../types'

const DAY_MS = 86_400_000
const DEFAULT_DAYS = 60

type Source = 'intent' | 'feedback' | 'purchase' | 'card'

interface DemandEvent {
  day: string
  at: Date
  userId: string | null
  articleId: string
  source: Source
  weight: number
  gmv: number
  converted: boolean
}

interface Bucket {
  day: string
  dimension: TrendDimension
  key: string
  volume: number
  gmv: number
  conversions: number
  users: Set<string>
  sources: Record<Source, number>
}

const utcDay = (date: Date) => date.toISOString().slice(0, 10)
const pairKey = (left: string, right: string) => `${left}::${right}`

function articleSignals(article: Article): Array<[TrendDimension, string]> {
  const signals: Array<[TrendDimension, string]> = []
  for (const aesthetic of article.aesthetics) signals.push(['aesthetic', aesthetic])
  if (article.categoryGroup) signals.push(['category', article.categoryGroup])
  if (article.colorFamily) signals.push(['color', article.colorFamily])
  if (article.silhouette) signals.push(['silhouette', article.silhouette])
  for (const aesthetic of article.aesthetics) {
    if (article.categoryGroup)
      signals.push(['aesthetic_category', pairKey(aesthetic, article.categoryGroup)])
  }
  for (const detail of [
    article.fit,
    article.length,
    article.neckline,
    article.sleeve,
    article.pattern,
  ])
    if (detail) signals.push(['detail', detail])
  if (article.printMotif) signals.push(['motif', article.printMotif])
  return signals
}

function resultArticleIds(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^\d{10}$/.test(value)) found.add(value)
  else if (Array.isArray(value)) for (const item of value) resultArticleIds(item, found)
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (
        (key === 'articleId' || key === 'id') &&
        typeof item === 'string' &&
        /^\d{10}$/.test(item)
      )
        found.add(item)
      else resultArticleIds(item, found)
    }
  }
  return found
}

const FEEDBACK_WEIGHT = {
  impression: 0.15,
  click: 0.5,
  save: 1.5,
  dismiss: -1,
  add_to_bag: 2.5,
  purchase: 4,
} as const

async function demandEvents(db: Database, from: Date): Promise<DemandEvent[]> {
  const [intentRows, feedbackRows, purchaseRows, cardRows] = await Promise.all([
    db.select().from(intentSessions).where(gte(intentSessions.createdAt, from)),
    db.select().from(feedbackEvents).where(gte(feedbackEvents.createdAt, from)),
    db.select().from(purchases).where(gte(purchases.createdAt, from)),
    db.select().from(cards).where(gte(cards.issuedAt, from)),
  ])
  const events: DemandEvent[] = []
  for (const row of intentRows) {
    for (const articleId of resultArticleIds(row.results))
      events.push({
        day: utcDay(row.createdAt),
        at: row.createdAt,
        userId: row.userId,
        articleId,
        source: 'intent',
        weight: 1,
        gmv: 0,
        converted: false,
      })
  }
  for (const row of feedbackRows) {
    if (!row.articleId) continue
    events.push({
      day: utcDay(row.createdAt),
      at: row.createdAt,
      userId: row.userId,
      articleId: row.articleId,
      source: 'feedback',
      weight: FEEDBACK_WEIGHT[row.kind],
      gmv: 0,
      converted: row.kind === 'purchase',
    })
  }
  for (const row of purchaseRows) {
    events.push({
      day: utcDay(row.createdAt),
      at: row.createdAt,
      userId: row.userId,
      articleId: row.articleId,
      source: 'purchase',
      weight: 5 * row.quantity,
      gmv: row.price * row.quantity,
      converted: true,
    })
  }
  for (const row of cardRows) {
    for (const snapshot of row.articleSnapshot)
      events.push({
        day: utcDay(row.issuedAt),
        at: row.issuedAt,
        userId: row.authorUserId,
        articleId: snapshot.articleId,
        source: 'card',
        weight: 3,
        gmv: 0,
        converted: false,
      })
  }
  return events
}

/** Rebuild demand signals exclusively from searches, intents, feedback, purchases and Cards. */
export async function runAnalytics(db: Database, now = new Date()): Promise<AnalyticsSummary> {
  const started = Date.now()
  const from = new Date(now.getTime() - DEFAULT_DAYS * DAY_MS)
  const [events, catalog] = await Promise.all([demandEvents(db, from), db.select().from(articles)])
  const byArticle = new Map(catalog.map((article) => [article.id, article]))
  const buckets = new Map<string, Bucket>()

  for (const event of events) {
    const article = byArticle.get(event.articleId)
    if (!article) continue
    for (const [dimension, key] of articleSignals(article)) {
      const id = `${event.day}\u0000${dimension}\u0000${key}`
      const bucket = buckets.get(id) ?? {
        day: event.day,
        dimension,
        key,
        volume: 0,
        gmv: 0,
        conversions: 0,
        users: new Set<string>(),
        sources: { intent: 0, feedback: 0, purchase: 0, card: 0 },
      }
      bucket.volume += event.weight
      bucket.gmv += event.gmv
      bucket.conversions += event.converted ? 1 : 0
      if (event.userId) bucket.users.add(event.userId)
      bucket.sources[event.source] += 1
      buckets.set(id, bucket)
    }
  }

  const rows = [...buckets.values()].map((bucket) => {
    const volume = Math.max(0, Math.round(bucket.volume * 100))
    const breadth = bucket.users.size
    const conversion =
      bucket.conversions /
      Math.max(
        1,
        Object.values(bucket.sources).reduce((a, b) => a + b, 0),
      )
    const momentum = Math.min(
      100,
      Math.max(0, Math.log1p(volume) * 8 + conversion * 30 + Math.log1p(breadth) * 5),
    )
    return {
      id: `ts_${nanoid()}`,
      day: bucket.day,
      dimension: bucket.dimension,
      key: bucket.key,
      volume,
      velocity: 0,
      breadth,
      conversion,
      gmv: bucket.gmv,
      momentum,
      emerging: conversion >= 0.1 && volume >= 100,
      evidence: { ...bucket.sources, users: bucket.users.size },
      computedAt: now,
    }
  })

  await db.delete(trendSignals)
  if (rows.length) await db.insert(trendSignals).values(rows)

  const aggregates = aggregateSeries(rows, from, now)
  const pairs = aggregates
    .filter((series) => series.dimension === 'aesthetic_category')
    .toSorted((a, b) => b.momentum - a.momentum)
    .slice(0, 20)
  await db.delete(manufacturingRecommendations)
  if (pairs.length) {
    await db.insert(manufacturingRecommendations).values(
      pairs.map((series, index) => {
        const [aesthetic, categoryGroup] = series.key.split('::')
        return {
          id: `mr_${nanoid()}`,
          rank: index + 1,
          aesthetic: aesthetic || 'unspecified',
          categoryGroup: categoryGroup || 'accessories',
          momentum: series.momentum,
          confidence: Math.min(1, 0.35 + series.breadth / 50 + series.conversion),
          projectedDemand: Math.max(1, Math.round(series.volume / 100)),
          rationale:
            'Demand is supported by canonical intent, feedback, purchase and Card activity.',
          evidence: {
            signal: series.emerging ? 'develop' : 'watch',
            volume: series.volume,
            breadth: series.breadth,
            conversion: series.conversion,
            gmv: series.gmv,
          },
          computedAt: now,
        }
      }),
    )
  }

  const clusters = new Set(
    (await db.select({ id: users.tasteCluster }).from(users)).flatMap((r) =>
      r.id === null ? [] : [r.id],
    ),
  ).size
  return {
    clusters,
    trendSignals: rows.length,
    manufacturing: pairs.length,
    banditSlates: 0,
    durationMs: Date.now() - started,
  }
}

type SignalRow = typeof trendSignals.$inferSelect | Omit<typeof trendSignals.$inferInsert, 'id'>

const sumSignal = (items: readonly SignalRow[], key: 'volume' | 'gmv') =>
  items.reduce((total, row) => total + Number(row[key] ?? 0), 0)

function aggregateSeries(rows: readonly SignalRow[], from: Date, to: Date): TrendSeries[] {
  const grouped = new Map<string, SignalRow[]>()
  for (const row of rows) {
    const id = `${row.dimension}\u0000${row.key}`
    const group = grouped.get(id) ?? []
    group.push(row)
    grouped.set(id, group)
  }
  return [...grouped.values()].map((group) => {
    const ordered = group.toSorted((a, b) => a.day.localeCompare(b.day))
    const first = ordered[0]!
    const midpoint = new Date((from.getTime() + to.getTime()) / 2)
    const earlier = ordered.filter((row) => new Date(`${row.day}T00:00:00Z`) < midpoint)
    const later = ordered.filter((row) => new Date(`${row.day}T00:00:00Z`) >= midpoint)
    const earlierVolume = sumSignal(earlier, 'volume')
    const laterVolume = sumSignal(later, 'volume')
    const volume = sumSignal(ordered, 'volume')
    const velocity =
      earlierVolume > 0 ? (laterVolume - earlierVolume) / earlierVolume : laterVolume > 0 ? 1 : 0
    const breadth = Math.max(...ordered.map((row) => Number(row.breadth ?? 0)), 0)
    const conversion =
      ordered.reduce(
        (total, row) => total + Number(row.conversion ?? 0) * Number(row.volume ?? 0),
        0,
      ) / Math.max(1, volume)
    const momentum = Math.min(
      100,
      Math.max(
        0,
        Math.log1p(volume) * 7 +
          Math.max(-1, velocity) * 12 +
          conversion * 30 +
          Math.log1p(breadth) * 5,
      ),
    )
    return {
      dimension: first.dimension,
      key: first.key,
      label: first.key,
      momentum,
      volume,
      velocity,
      breadth,
      conversion,
      gmv: sumSignal(ordered, 'gmv'),
      emerging: velocity > 0.25 && volume >= 100,
      series: ordered.map((row) => ({ day: row.day, volume: Number(row.volume) })),
    }
  })
}

export async function getTrendDashboard(
  db: Database,
  options: { days?: number; now?: Date } = {},
): Promise<TrendDashboard> {
  const days = options.days ?? DEFAULT_DAYS
  const to = options.now ?? new Date()
  const from = new Date(to.getTime() - days * DAY_MS)
  const [
    signals,
    intents,
    feedback,
    bought,
    issued,
    searches,
    recs,
    people,
    snapshots,
    evaluation,
  ] = await Promise.all([
    db
      .select()
      .from(trendSignals)
      .where(gte(trendSignals.day, utcDay(from))),
    db.select().from(intentSessions).where(gte(intentSessions.createdAt, from)),
    db.select().from(feedbackEvents).where(gte(feedbackEvents.createdAt, from)),
    db.select().from(purchases).where(gte(purchases.createdAt, from)),
    db.select().from(cards).where(gte(cards.issuedAt, from)),
    db.select().from(searchTrends),
    db.select().from(manufacturingRecommendations).orderBy(manufacturingRecommendations.rank),
    db.select({ id: users.id, cluster: users.tasteCluster }).from(users),
    db.select().from(preferenceSnapshots).orderBy(desc(preferenceSnapshots.version)),
    db.select().from(evaluationRuns).orderBy(desc(evaluationRuns.createdAt)).limit(1),
  ])
  const series = aggregateSeries(signals, from, to).toSorted((a, b) => b.momentum - a.momentum)
  const purchasesCount = bought.reduce((sum, row) => sum + row.quantity, 0)
  const positiveActions = feedback.filter((row) =>
    ['click', 'save', 'add_to_bag', 'purchase'].includes(row.kind),
  ).length
  const clusterTop = new Map<number, string[]>()
  for (const snapshot of snapshots) {
    const cluster = people.find((person) => person.id === snapshot.userId)?.cluster
    if (cluster === null || cluster === undefined || clusterTop.has(cluster)) continue
    clusterTop.set(cluster, snapshot.topAesthetics.map((a) => a.aesthetic).slice(0, 4))
  }
  const clusterSizes = new Map<number, number>()
  for (const person of people)
    if (person.cluster !== null)
      clusterSizes.set(person.cluster, (clusterSizes.get(person.cluster) ?? 0) + 1)
  return {
    generatedAt: to,
    window: { from, to, days },
    headline: {
      searches: searches.length,
      intents: intents.length,
      feedback: feedback.length,
      purchases: purchasesCount,
      cards: issued.length,
      gmv: bought.reduce((sum, row) => sum + row.price * row.quantity, 0),
      conversion: positiveActions > 0 ? purchasesCount / positiveActions : 0,
    },
    aesthetics: series.filter((row) => row.dimension === 'aesthetic'),
    categories: series.filter((row) => row.dimension === 'category'),
    colors: series.filter((row) => row.dimension === 'color'),
    silhouettes: series.filter((row) => row.dimension === 'silhouette'),
    aestheticCategory: series.filter((row) => row.dimension === 'aesthetic_category'),
    emerging: series.filter((row) => row.emerging).slice(0, 12),
    clusters: [...clusterSizes].map(([id, size]) => ({
      id,
      size,
      topAesthetics: clusterTop.get(id) ?? [],
      label: `Cluster ${id}`,
    })),
    manufacturing: recs,
    evaluation: evaluation[0] ?? null,
  }
}
