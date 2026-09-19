/**
 * Read every article's photograph with a multimodal model and store what it saw.
 *
 *   pnpm --filter @lookline/hm vision            # the whole catalogue, resumable
 *   VISION_LIMIT=200 pnpm --filter @lookline/hm vision
 *
 * Live rather than Batch. Batch is half price and returns within 24 hours; this returns within
 * hours, and a run that is interrupted resumes from what is already in `article_vision`.
 *
 * Articles are taken most-popular first, so a partial run is a partial catalogue of the things
 * people actually see rather than an arbitrary prefix of H&M's article ids.
 *
 * Images are read from the local webp folder and sent inline. They are 512px and a few kilobytes,
 * so this needs no public bucket and no signed URL — and `detail: 'low'` is the right budget for
 * a product shot of that size.
 *
 * The 440 articles with no photograph are skipped rather than read from their copy alone. Reading
 * the text is the inference this pass exists to avoid: `detail_desc` already had its regex pass,
 * and anything past it is a guess. Measured on the first 205 readings, a text-only one came back
 * at 0.43 confidence against 0.95 for a photographed one — less than half, and it would still
 * have written an aesthetic into the style vector.
 *
 * Nothing here writes to `articles`. `materialize` does that, from the rows this leaves behind.
 *
 *   OPENAI_API_KEY       required
 *   OPENAI_TEXT_MODEL    default gpt-5.6-luna
 *   IMG_OUT              webp folder (default <repo>/data/hm/webp)
 *   VISION_LIMIT         stop after this many articles (a pilot run)
 *   VISION_CONCURRENCY   in-flight requests (default 32)
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  articleVision as articleVisionTable,
  articles as articlesTable,
  and,
  desc,
  eq,
  isNotNull,
  isNull,
} from '@lookline/db'
import type { NewArticleVision } from '@lookline/db'
import { createLocalDb, loadEnv, migrateLocal } from '@lookline/db/node'
import OpenAI from 'openai'
import {
  VISION_SYSTEM,
  VISION_VERSION,
  buildVisionPrompt,
  parseVision,
  visionJsonSchema,
} from '../src/vision'

loadEnv()

const apiKey = process.env['OPENAI_API_KEY']
if (!apiKey) throw new Error('OPENAI_API_KEY must be set')
const model = process.env['OPENAI_TEXT_MODEL'] || 'gpt-5.6-luna'
const webpDir =
  process.env['IMG_OUT'] ?? fileURLToPath(new URL('../../../data/hm/webp', import.meta.url))
const limit = Number(process.env['VISION_LIMIT'] ?? 0) || null
const concurrency = Number(process.env['VISION_CONCURRENCY'] ?? 32)

/** Per million tokens, gpt-5.6-luna, standard (not Batch) rates. */
const PRICE = { input: 0.2, cached: 0.02, output: 1.2 }
const MAX_ATTEMPTS = 4

const handle = createLocalDb()
await migrateLocal(handle)
const { db } = handle
// Two locking defaults that between them killed a six-hour run at article 1456. The file ships
// as journal_mode=delete, where a reader blocks a writer, and libsql leaves busy_timeout at 0 —
// so one `sqlite3 "select count(*)"` to see how far it had got took a SHARED lock and failed the
// next write instantly. WAL lets readers and the writer coexist; the timeout covers the rest.
await handle.client.execute('pragma journal_mode = wal')
// Under WAL this fsyncs at checkpoints rather than on every commit. The run is resumable from
// `article_vision`, so the worst a power cut costs is the last few readings, re-read next time.
await handle.client.execute('pragma synchronous = normal')
await handle.client.execute('pragma busy_timeout = 30000')
console.log(`database ${handle.url}`)

// Only photographed articles with no reading at the current version; a bumped VISION_VERSION
// re-reads the catalogue rather than silently mixing two vocabularies in one column.
const pending = await db
  .select({
    id: articlesTable.id,
    name: articlesTable.name,
    subcategory: articlesTable.subcategory,
    description: articlesTable.description,
    colorName: articlesTable.colorName,
    section: articlesTable.section,
    department: articlesTable.department,
    imagePath: articlesTable.imagePath,
  })
  .from(articlesTable)
  .leftJoin(articleVisionTable, eq(articleVisionTable.articleId, articlesTable.id))
  .where(and(isNull(articleVisionTable.articleId), isNotNull(articlesTable.imagePath)))
  .orderBy(desc(articlesTable.popularity))
  .limit(limit ?? 1_000_000)

console.log(
  `${pending.length} articles to read with ${model}, ${concurrency} at a time` +
    (limit ? ` (limited to ${limit})` : ''),
)
if (pending.length === 0) {
  await handle.close()
  process.exit(0)
}

// The account's own headers allow 30 000 requests a minute and this uses a few hundred, but the
// service still only turns over about 9-10 of these a second, so anything past that waits. With
// the default timeout the waiting ones fail and get retried, which throws away work already
// queued and is why 128 workers measured slower than 48. Let them wait instead; `MAX_ATTEMPTS`
// still catches a request that is genuinely stuck.
const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 180_000 })
const schema = visionJsonSchema()
const started = performance.now()
let done = 0
let failed = 0
let noImage = 0
let inTokens = 0
/** Retries by HTTP status, so a run that slows down can say whether it is being throttled. */
const retries = new Map<number, number>()
/** Distinct reasons behind the status-less retries, which a bare count cannot explain. */
const netReasons = new Map<string, number>()
let cachedTokens = 0
let outTokens = 0
const queue = [...pending]

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** The local webp as a data URL, or null when the article is one of the 442 without a photo. */
function imageDataUrl(imagePath: string | null): string | null {
  if (!imagePath) return null
  // `articles.image_path` is the R2 key `images/<bucket>/<id>.webp`; on disk the root differs.
  const file = path.join(webpDir, imagePath.replace(/^images\//, ''))
  if (!existsSync(file)) return null
  return `data:image/webp;base64,${readFileSync(file).toString('base64')}`
}

type Pending = (typeof pending)[number]

async function read(article: Pending): Promise<NewArticleVision | null> {
  // The column says there is a photograph; only a missing local file gets here, and that is a
  // converted folder out of step with the database rather than an article to guess at.
  const dataUrl = imageDataUrl(article.imagePath)
  if (!dataUrl) {
    noImage += 1
    return null
  }
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: buildVisionPrompt(article) },
    { type: 'input_image', image_url: dataUrl, detail: 'low' },
  ]

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = performance.now()
    try {
      const response = await client.responses.create({
        model,
        input: [
          { role: 'system', content: VISION_SYSTEM },
          { role: 'user', content: content as never },
        ],
        text: {
          format: { type: 'json_schema', name: 'article_vision', schema, strict: true },
        },
      })
      const parsed = parseVision(JSON.parse(response.output_text || '{}'))
      if (!parsed) throw new Error('response did not validate')
      const usage = response.usage
      const cached = usage?.input_tokens_details?.cached_tokens ?? 0
      inTokens += (usage?.input_tokens ?? 0) - cached
      cachedTokens += cached
      outTokens += usage?.output_tokens ?? 0
      return {
        articleId: article.id,
        model,
        version: VISION_VERSION,
        payload: parsed as unknown as Record<string, unknown>,
        confidence: parsed.confidence,
        captionEn: parsed.captionEn,
        captionZh: parsed.captionZh,
        imageKey: article.imagePath,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        latencyMs: Math.round(performance.now() - t0),
      }
    } catch (error) {
      const status = (error as { status?: number }).status
      const retryable = status === undefined || status === 429 || status >= 500
      retries.set(status ?? 0, (retries.get(status ?? 0) ?? 0) + 1)
      // A count alone cannot tell a rate limit from a socket that never opened, and those want
      // opposite responses — back off, or stop asking for so many connections at once.
      if (status === undefined) {
        const why = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        const cause = (error as { cause?: { code?: string; message?: string } }).cause
        const key = cause?.code ? `${why} (cause ${cause.code})` : why
        netReasons.set(key, (netReasons.get(key) ?? 0) + 1)
      }
      if (!retryable || attempt === MAX_ATTEMPTS) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[vision] ${article.id} gave up after ${attempt}: ${message}`)
        return null
      }
      await sleep(2 ** attempt * 500)
    }
  }
  return null
}

async function worker(): Promise<void> {
  for (;;) {
    const article = queue.shift()
    if (!article) return
    const row = await read(article)
    if (row) {
      // One row at a time: the run is long, and a crash should cost the request in flight, not
      // an unflushed batch of them. A write that fails anyway costs only its own article — six
      // hours of readings are not worth discarding over one locked row.
      try {
        await db.insert(articleVisionTable).values(row).onConflictDoUpdate({
          target: articleVisionTable.articleId,
          set: row,
        })
        done += 1
      } catch (error) {
        failed += 1
        console.warn(
          `[vision] ${article.id} read but not stored: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    } else {
      failed += 1
    }
    const seen = done + failed
    if (seen % 100 === 0 || seen === pending.length) {
      const secs = (performance.now() - started) / 1000
      const rate = seen / secs
      const left = Math.round((pending.length - seen) / Math.max(rate, 0.001))
      const throttle =
        retries.size > 0
          ? ` | retries ${[...retries].map(([code, n]) => `${code || 'net'}×${n}`).join(' ')}`
          : ''
      console.log(
        `${seen}/${pending.length} (${failed} failed) ${rate.toFixed(1)}/s, ~${Math.round(left / 60)} min left, $${cost().toFixed(2)} so far${throttle}`,
      )
    }
  }
}

const cost = (): number =>
  (inTokens * PRICE.input + cachedTokens * PRICE.cached + outTokens * PRICE.output) / 1_000_000

await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))

const secs = (performance.now() - started) / 1000
console.log(
  `read ${done} articles in ${(secs / 60).toFixed(1)} min (${failed} failed, ${noImage} had no local image file)`,
)
console.log(
  `tokens: ${inTokens} fresh + ${cachedTokens} cached input, ${outTokens} output — $${cost().toFixed(2)}`,
)
for (const [why, n] of [...netReasons].toSorted((a, b) => b[1] - a[1]).slice(0, 5)) {
  console.log(`  network retry ×${n}: ${why}`)
}
console.log(`next: pnpm --filter @lookline/hm materialize`)
await handle.close()
