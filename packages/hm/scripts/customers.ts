/**
 * Import H&M's 1 371 980 customers and the per-customer aggregates of their 31.8M transactions.
 * Separate from the article import because it is the slow half and changes far less often.
 *
 *   pnpm --filter @lookline/hm customers
 *
 * Needs `data/hm/customer_stats.csv` from `scripts/aggregate.sh`.
 */
import { createReadStream, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { type NewHmCustomer, hmCustomers, insertAll } from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import { PRICE_TO_TWD } from '../src/index'

loadEnv()

const dir = process.env.HM_DIR ?? fileURLToPath(new URL('../../../data/hm', import.meta.url))
const BATCH = 2000
const secs = (from: number): string => ((performance.now() - from) / 1000).toFixed(1)
const started = performance.now()

interface Purchases {
  purchases: number
  spend: number
  firstBuyAt: Date
  lastBuyAt: Date
  onlineRatio: number
  topIndexGroup: string
  topProductGroup: string
}

// 1.36M rows held in memory while the customer file streams past — about 300 MB, and the
// alternative is a second pass over a 207 MB file for every batch.
const stats = new Map<string, Purchases>()
for (const line of readFileSync(`${dir}/customer_stats.csv`, 'utf8').split('\n').slice(1)) {
  if (!line) continue
  const [id, n, spend, first, last, online, ig, pg] = line.split(',')
  if (!id || !n || !first || !last) continue
  stats.set(id, {
    purchases: Number(n),
    spend: Math.round(Number(spend) * PRICE_TO_TWD),
    firstBuyAt: new Date(`${first}T00:00:00Z`),
    lastBuyAt: new Date(`${last}T00:00:00Z`),
    onlineRatio: Number(online ?? 0),
    topIndexGroup: ig ?? '',
    topProductGroup: (pg ?? '').replace(/\r$/, ''),
  })
}
console.log(`read ${stats.size} customer aggregates in ${secs(started)}s`)

const handle = createLocalDb()
await migrateLocal(handle)
const { db } = handle
await db.delete(hmCustomers)

let batch: NewHmCustomer[] = []
let total = 0
const flush = async (): Promise<void> => {
  if (batch.length === 0) return
  await insertAll(db, hmCustomers, batch, { maxParams: 20_000 })
  total += batch.length
  batch = []
  if (total % 200_000 === 0) console.log(`  ${total} customers in ${secs(started)}s`)
}

const rl = createInterface({ input: createReadStream(`${dir}/customers.csv`), crlfDelay: Infinity })
let header = true
for await (const line of rl) {
  if (header) {
    header = false
    continue
  }
  if (!line) continue
  const [id, fn, active, club, news, age, postal] = line.split(',')
  if (!id) continue
  const s = stats.get(id)
  batch.push({
    id,
    // FN and Active are set or blank, never zero; blank is the negative case.
    subscribesNews: fn === '1.0' || fn === '1',
    active: active === '1.0' || active === '1',
    clubMemberStatus: club || null,
    fashionNewsFrequency: news || null,
    age: age ? Number(age) : null,
    postalCode: (postal ?? '').replace(/\r$/, '') || null,
    purchases: s?.purchases ?? 0,
    spend: s?.spend ?? 0,
    firstBuyAt: s?.firstBuyAt ?? null,
    lastBuyAt: s?.lastBuyAt ?? null,
    onlineRatio: s?.onlineRatio ?? 0,
    topIndexGroup: s?.topIndexGroup ?? null,
    topProductGroup: s?.topProductGroup ?? null,
  })
  if (batch.length >= BATCH) await flush()
}
await flush()
console.log(`inserted ${total} customers in ${secs(started)}s`)
await handle.close()
