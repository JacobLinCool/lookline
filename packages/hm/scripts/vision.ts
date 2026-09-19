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
 * Nothing here writes to `articles`. `materialize` does that, from the rows this leaves behind.
 *
 *   OPENAI_API_KEY       required
 *   OPENAI_TEXT_MODEL    default gpt-5.6-luna
 *   IMG_OUT              webp folder (default <repo>/data/hm/webp)
 *   VISION_LIMIT         stop after this many articles (a pilot run)
 *   VISION_CONCURRENCY   in-flight requests (default 12)
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  articleVision as articleVisionTable,
  articles as articlesTable,
  desc,
  eq,
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
const concurrency = Number(process.env['VISION_CONCURRENCY'] ?? 12)

/** Per million tokens, gpt-5.6-luna, standard (not Batch) rates. */
const PRICE = { input: 0.2, cached: 0.02, output: 1.2 }
const MAX_ATTEMPTS = 4

const handle = createLocalDb()
await migrateLocal(handle)
const { db } = handle
console.log(`database ${handle.url}`)

// Only articles with no reading at the current version; a bumped VISION_VERSION re-reads the
// catalogue rather than silently mixing two vocabularies in one column.
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
  .where(isNull(articleVisionTable.articleId))
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

const client = new OpenAI({ apiKey, maxRetries: 0 })
const schema = visionJsonSchema()
const started = performance.now()
let done = 0
let failed = 0
let noImage = 0
let inTokens = 0
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
  const dataUrl = imageDataUrl(article.imagePath)
  if (!dataUrl) noImage += 1
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: buildVisionPrompt(article) },
  ]
  // Text alone still fills occasions and the axes; without the photograph it simply says less,
  // and reports the lower confidence itself.
  if (dataUrl) content.push({ type: 'input_image', image_url: dataUrl, detail: 'low' })

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
      // an unflushed batch of them.
      await db.insert(articleVisionTable).values(row).onConflictDoUpdate({
        target: articleVisionTable.articleId,
        set: row,
      })
      done += 1
    } else {
      failed += 1
    }
    const seen = done + failed
    if (seen % 100 === 0 || seen === pending.length) {
      const secs = (performance.now() - started) / 1000
      const rate = seen / secs
      const left = Math.round((pending.length - seen) / Math.max(rate, 0.001))
      console.log(
        `${seen}/${pending.length} (${failed} failed) ${rate.toFixed(1)}/s, ~${Math.round(left / 60)} min left, $${cost().toFixed(2)} so far`,
      )
    }
  }
}

const cost = (): number =>
  (inTokens * PRICE.input + cachedTokens * PRICE.cached + outTokens * PRICE.output) / 1_000_000

await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))

const secs = (performance.now() - started) / 1000
console.log(
  `read ${done} articles in ${(secs / 60).toFixed(1)} min (${failed} failed, ${noImage} had no photograph)`,
)
console.log(
  `tokens: ${inTokens} fresh + ${cachedTokens} cached input, ${outTokens} output — $${cost().toFixed(2)}`,
)
console.log(`next: pnpm --filter @lookline/hm materialize`)
await handle.close()
