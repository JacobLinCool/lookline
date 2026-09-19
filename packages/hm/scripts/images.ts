/**
 * Convert the Kaggle image folder (105 100 jpgs, 1166×1750, 29 GB) into webp the size a product
 * card actually renders at. 512px wide at quality 78 is ~5 KB a file, so the whole catalogue is
 * about 0.5 GB — inside R2's free tier, where the originals are three times over it.
 *
 * Output mirrors the input layout: `<out>/<first three characters>/<article_id>.webp`, which is
 * the R2 key the articles table stores.
 *
 *   HM_DIR    the Kaggle folder (default <repo>/data/hm)
 *   IMG_OUT   where to write (default <repo>/data/hm/webp)
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const dir = process.env.HM_DIR ?? fileURLToPath(new URL('../../../data/hm', import.meta.url))
const out = process.env.IMG_OUT ?? path.join(dir, 'webp')
const source = path.join(dir, 'images')

/** sharp releases the thread while libvips works, so this is concurrent decodes, not cores. */
const CONCURRENCY = 8
const WIDTH = 512
const QUALITY = 78

if (!existsSync(source)) throw new Error(`no image folder at ${source}`)

const jobs: Array<{ from: string; to: string }> = []
for (const bucket of readdirSync(source)) {
  const bucketDir = path.join(source, bucket)
  if (!statSync(bucketDir).isDirectory()) continue
  mkdirSync(path.join(out, bucket), { recursive: true })
  for (const file of readdirSync(bucketDir)) {
    if (!file.endsWith('.jpg')) continue
    jobs.push({
      from: path.join(bucketDir, file),
      to: path.join(out, bucket, `${file.slice(0, -4)}.webp`),
    })
  }
}
console.log(`${jobs.length} images → ${out}`)

const started = Date.now()
let done = 0
let bytes = 0
let failed = 0

async function worker(): Promise<void> {
  for (;;) {
    const job = jobs.pop()
    if (!job) return
    // Resuming a half-finished run should not redo the work.
    if (existsSync(job.to)) {
      done += 1
      continue
    }
    try {
      const info = await sharp(job.from)
        .resize({ width: WIDTH })
        .webp({ quality: QUALITY })
        .toFile(job.to)
      bytes += info.size
    } catch (err) {
      failed += 1
      if (failed <= 5) console.error(`failed ${job.from}: ${String(err)}`)
    }
    done += 1
    if (done % 5000 === 0) {
      const secs = (Date.now() - started) / 1000
      console.log(
        `${done} done · ${(bytes / 1024 / 1024).toFixed(0)} MB · ${(done / secs).toFixed(0)}/s`,
      )
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
console.log(
  `${done} images · ${(bytes / 1024 / 1024).toFixed(0)} MB · ${failed} failed · ${((Date.now() - started) / 1000).toFixed(0)}s`,
)
