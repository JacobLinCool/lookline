/**
 * Upload the converted webp catalogue to R2.
 *
 *   pnpm --filter @lookline/hm upload
 *
 * Uses R2's S3 endpoint. The two alternatives do not scale to a catalogue this size:
 * `wrangler r2 object put` pays ~3s of CLI startup per file (85 hours), and Cloudflare's
 * management API — `/client/v4/accounts/…/r2/buckets/…/objects/…` — shares the account-wide quota
 * of 1200 requests per 5 minutes. Measured: 200 uploads succeed at any concurrency, then the
 * 1273rd returns 429 and everything after it fails until the bucket refills. That is 4 req/s
 * sustained, or 7.3 hours here, while starving every other Cloudflare API call.
 *
 * Keys mirror the folder layout: `images/<first three characters>/<article_id>.webp`, which is
 * what `articles.image_path` stores. Already-uploaded keys are recorded so a re-run resumes.
 *
 *   IMG_OUT        webp folder (default <repo>/data/hm/webp)
 *   UPLOAD_LIMIT   stop after this many (for a trial run)
 */
import {
  appendFileSync,
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { loadEnv, repoRoot } from '@lookline/db/node'
import { AwsClient } from 'aws4fetch'

loadEnv()

const account = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
if (!account || !accessKeyId || !secretAccessKey) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set')
}
const aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })

const BUCKET = 'lookline-media'
const CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY ?? 24)
const dir = process.env.IMG_OUT ?? path.join(repoRoot(), 'data/hm/webp')
const ledger = path.join(dir, '.uploaded')
const limit = process.env.UPLOAD_LIMIT ? Number(process.env.UPLOAD_LIMIT) : Infinity

// Reading the ledger back beats asking R2 whether each of 105k keys exists.
const done = new Set<string>()
if (existsSync(ledger)) {
  const rl = createInterface({ input: createReadStream(ledger), crlfDelay: Infinity })
  for await (const line of rl) if (line) done.add(line)
}

const jobs: Array<{ file: string; key: string }> = []
for (const bucket of readdirSync(dir)) {
  const bucketDir = path.join(dir, bucket)
  if (!statSync(bucketDir).isDirectory()) continue
  for (const file of readdirSync(bucketDir)) {
    if (!file.endsWith('.webp')) continue
    const key = `images/${bucket}/${file}`
    if (done.has(key)) continue
    jobs.push({ file: path.join(bucketDir, file), key })
    if (jobs.length >= limit) break
  }
  if (jobs.length >= limit) break
}
console.log(`${jobs.length} to upload (${done.size} already done)`)

const url = (key: string): string => `https://${account}.r2.cloudflarestorage.com/${BUCKET}/${key}`

const started = Date.now()
let uploaded = 0
let failed = 0

async function worker(): Promise<void> {
  for (;;) {
    const job = jobs.pop()
    if (!job) return
    try {
      const res = await aws.fetch(url(job.key), {
        method: 'PUT',
        headers: { 'content-type': 'image/webp' },
        body: readFileSync(job.file),
      })
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`)
      appendFileSync(ledger, `${job.key}\n`)
      uploaded += 1
    } catch (err) {
      failed += 1
      if (failed <= 5) console.error(`failed ${job.key}: ${String(err)}`)
    }
    const total = uploaded + failed
    if (total % 2000 === 0) {
      const secs = (Date.now() - started) / 1000
      console.log(`${total} · ${(total / secs).toFixed(0)}/s · ${failed} failed`)
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
console.log(
  `uploaded ${uploaded} · ${failed} failed · ${((Date.now() - started) / 1000).toFixed(0)}s`,
)
