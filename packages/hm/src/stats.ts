/**
 * Per-article aggregates of `transactions_train.csv` (31 788 324 rows, 2018-09-20 → 2020-09-22),
 * computed offline with DuckDB by `scripts/aggregate.sh` and read from `data/hm/article_stats.csv`.
 * The transaction table itself never reaches D1.
 */
import { readFileSync } from 'node:fs'

export interface ArticleStats {
  salesCount: number
  /** TWD, from the mean transaction price. */
  price: number
  firstSoldAt: Date
  lastSoldAt: Date
  /** Share sold through `sales_channel_id = 2`. */
  onlineRatio: number
  sales30d: number
  sales90d: number
}

/**
 * H&M normalised its price column to an undisclosed unit. Multiplying by this recovers TWD to
 * within a few percent of what H&M Taiwan charges today, checked against four articles across the
 * range: a vest top at NT$144 (listed ~149), skinny denim at NT$574 (~599) and a coat at NT$1842
 * (~1999). It is a single scale factor, so the relative prices are exactly the dataset's own.
 */
export const PRICE_TO_TWD = 17_700

/** Parsed from the aggregate csv, keyed by the zero-padded article id. */
export function loadStats(path: string): Map<string, ArticleStats> {
  const out = new Map<string, ArticleStats>()
  const lines = readFileSync(path, 'utf8').split('\n')
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue
    const [id, sales, avgPrice, first, last, online, d30, d90] = line.split(',')
    if (!id || !sales || !avgPrice || !first || !last) continue
    out.set(id, {
      salesCount: Number(sales),
      price: Math.round(Number(avgPrice) * PRICE_TO_TWD),
      firstSoldAt: new Date(`${first}T00:00:00Z`),
      lastSoldAt: new Date(`${last}T00:00:00Z`),
      onlineRatio: Number(online ?? 0),
      sales30d: Number(d30 ?? 0),
      sales90d: Number(d90 ?? 0),
    })
  }
  return out
}

/**
 * Popularity in [0, 1] from the sales count. Sales are heavily skewed — the top article sold
 * 50 287 units and the median sold a few hundred — so this is log-scaled against the maximum.
 */
export function popularityOf(salesCount: number, maxSales: number): number {
  if (salesCount <= 0 || maxSales <= 0) return 0
  return Math.log1p(salesCount) / Math.log1p(maxSales)
}

/**
 * Momentum in [0, 1]: the last 30 days against the 90-day run rate. Above 1/3 of the 90-day total
 * means the article is selling faster now than it was, which is what a trend signal means here.
 *
 * The dataset ends 2020-09-22, so this is momentum as of then — historical, not current. Live
 * trends come from a public source at query time (Google Trends), per the brief.
 */
export function momentumOf(sales30d: number, sales90d: number): number {
  if (sales90d <= 0) return 0
  return Math.min(1, (sales30d / sales90d) * 3) / 3
}

export interface TypePair {
  typeA: string
  typeB: string
  together: number
  lift: number
}

/** `data/hm/type_affinity.csv` — 3230 product-type pairs with at least 50 co-purchases. */
export function loadAffinity(path: string): TypePair[] {
  const out: TypePair[] = []
  const lines = readFileSync(path, 'utf8').split('\n')
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue
    // Product type names contain no commas, so a plain split is enough here.
    const [typeA, typeB, together, lift] = line.split(',')
    if (!typeA || !typeB || !together || !lift) continue
    out.push({ typeA, typeB, together: Number(together), lift: Number(lift) })
  }
  return out
}
