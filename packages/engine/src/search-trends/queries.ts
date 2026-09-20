/**
 * Persistence for the external search trends. One batch at a time: a refresh replaces the ranking
 * and the single reading the home page renders, so the lab always shows the list that produced
 * what shoppers are seeing.
 */
import { desc, eq, homeTrend, insertAll, searchTrends, type Database } from '@lookline/db'
import type { HomeTrend, SearchTrend } from '@lookline/db'
import { nanoid } from 'nanoid'
import { searchProducts } from '../recommend/search'
import type { LlmClient } from '../types'
import { fetchSearchTrends, readSearchTrends, type RawTrend, type StyleDirection } from './index'

export async function replaceSearchTrends(
  db: Database,
  rows: readonly RawTrend[],
  fetchedAt = new Date(),
): Promise<number> {
  await db.delete(searchTrends)
  if (!rows.length) return 0
  await insertAll(
    db,
    searchTrends,
    rows.map((row) => ({
      id: nanoid(),
      rank: row.rank,
      signal: row.signal,
      heat: row.heat,
      newsTitle: row.newsTitle,
      sourceUrl: row.sourceUrl,
      fetchedAt,
    })),
  )
  return rows.length
}

export async function listSearchTrends(db: Database): Promise<SearchTrend[]> {
  return db.select().from(searchTrends).orderBy(searchTrends.rank)
}

/**
 * Replaces the reading on the home page, or clears it when the batch produced none. Two statements
 * rather than a transaction (D1 rejects `BEGIN`): a failure between them leaves the page with no
 * trend row, which it already renders as simply not being there.
 */
export async function setHomeTrend(
  db: Database,
  reading: (StyleDirection & { matches: number }) | null,
  computedAt = new Date(),
): Promise<void> {
  await db.delete(homeTrend)
  if (reading) await db.insert(homeTrend).values({ id: 1, ...reading, computedAt })
}

/** What the home page shows, and what the lab reports as live. */
export async function currentHomeTrend(db: Database): Promise<HomeTrend | null> {
  const rows = await db
    .select()
    .from(homeTrend)
    .where(eq(homeTrend.id, 1))
    .orderBy(desc(homeTrend.computedAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The whole cycle, so a cron and an operator's button cannot drift apart: fetch today's list,
 * store it, read it as a style, and publish the first reading the catalogue can actually fill.
 *
 * The catalogue is the last word. A model writes a plausible phrase whether or not anything is
 * stocked under it, nobody vets these by hand, and an unchecked reading is an empty row on the
 * home page — so a reading with no pieces behind it is simply not published, and the rail is
 * absent instead of blank.
 */
export async function refreshSearchTrends(
  db: Database,
  llm: LlmClient,
  signal?: AbortSignal,
): Promise<(StyleDirection & { matches: number }) | null> {
  const trends = await fetchSearchTrends('TW', signal)
  await replaceSearchTrends(db, trends)
  const directions = await readSearchTrends(trends, { llm, signal })
  let published: (StyleDirection & { matches: number }) | null = null
  for (const direction of directions) {
    const { total } = await searchProducts(db, { q: direction.styleQuery, pageSize: 1 })
    if (total > 0) {
      published = { ...direction, matches: total }
      break
    }
  }
  await setHomeTrend(db, published)
  return published
}
