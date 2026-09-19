import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { eq, looks, sessions } from '@lookline/db'
import { createLocalDb, findLocalD1File, loadEnv, localDbPath } from '@lookline/db/node'
import { launchBrowser } from './browser'

loadEnv()
const base = process.env.QA_BASE_URL ?? 'http://localhost:3000'
// The dev server reads the local D1 file; fall back to the seed database.
const handle = createLocalDb(findLocalD1File() ?? localDbPath())
const [look] = await handle.db.select().from(looks).where(eq(looks.imageStatus, 'ready')).limit(1)
assert.ok(look, 'Seed a Look before browser verification')
const sessionId = `qa_latency_${randomUUID()}`
await handle.db
  .insert(sessions)
  .values({ id: sessionId, userId: look.ownerId, expiresAt: new Date(Date.now() + 60_000) })
const signature = createHmac(
  'sha256',
  process.env.SESSION_SECRET ?? 'lookline-dev-secret-change-me',
)
  .update(sessionId)
  .digest('hex')
const browser = await launchBrowser()
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
await page
  .context()
  .addCookies([{ name: 'll_session', value: `${sessionId}.${signature}`, url: base }])
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.goto(`${base}/looks/${look.id}`, { waitUntil: 'networkidle' })
  console.log('canvas', (await page.locator('main').innerText()).slice(0, 500))
  const initialSrc = await page.locator('figure img').getAttribute('src')
  let current = {
    id: look.id,
    status: 'ready',
    provider: 'offline',
    generationId: null as string | null,
    startedAt: null as string | null,
    error: null as string | null,
    imageUrl: initialSrc!,
  }
  await page.route(`**/api/looks/${look.id}/generate`, async (route) => {
    const method = route.request().method()
    if (method === 'POST')
      current = {
        ...current,
        status: 'pending',
        generationId: randomUUID(),
        startedAt: new Date().toISOString(),
        error: null,
      }
    if (method === 'DELETE')
      current = {
        ...current,
        status: 'failed',
        generationId: null,
        error: 'Rendering cancelled. Your composition is saved.',
      }
    await route.fulfill({
      status: method === 'POST' ? 202 : 200,
      contentType: 'application/json',
      body: JSON.stringify(current),
    })
  })
  await page.getByRole('button', { name: 'Render edition', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel rendering' }).waitFor()
  assert.equal(
    await page.locator('figure img').getAttribute('src'),
    initialSrc,
    'Existing visual remains during rendering',
  )
  assert.ok(await page.getByRole('link', { name: 'Ask a friend', exact: true }).isEnabled())
  assert.ok(await page.getByRole('combobox', { name: 'Edition style' }).isEnabled())
  await page.getByRole('button', { name: 'Cancel rendering' }).click()
  await page.getByRole('button', { name: 'Retry rendering' }).waitFor()
  await page.getByRole('button', { name: 'Retry rendering' }).click()
  await page.getByRole('button', { name: 'Cancel rendering' }).waitFor()
  // A deterministic test image stands in for a provider completion; no paid generation is called.
  current = {
    ...current,
    status: 'ready',
    generationId: null,
    provider: 'test',
    imageUrl: '/api/products/1/image',
  }
  await page.waitForFunction(
    () => document.querySelector('figure img')?.getAttribute('src') === '/api/products/1/image',
  )
  await page.getByText('Your edition is ready.', { exact: true }).waitFor()
  await page.screenshot({ path: 'output/playwright/latency-edition.png', fullPage: false })
  await writeFile(
    'output/playwright/edition-checks.json',
    JSON.stringify(
      {
        tests: [
          'preserved visual while pending',
          'independent controls remain available',
          'cancel and retry',
          'decoded final image replaces preview',
        ],
        provider: 'stubbed transport',
        errors,
      },
      null,
      2,
    ),
  )
  assert.deepEqual(errors, [])
  console.log('PASS: preview, non-blocking controls, cancellation, retry and final replacement')
} finally {
  await browser.close()
  await handle.db.delete(sessions).where(eq(sessions.id, sessionId))
  await handle.close()
}
