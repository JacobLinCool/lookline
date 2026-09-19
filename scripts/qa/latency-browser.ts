import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchBrowser } from './browser'

const base = process.env.QA_BASE_URL ?? 'http://localhost:3000'
const browser = await launchBrowser()
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
// These checks select by English accessible name; pin the language so they cannot drift.
await page.context().addCookies([{ name: 'll_locale', value: 'en', url: base }])
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const measurements: unknown[] = []
await page.exposeFunction('collectLatency', (value: unknown) => measurements.push(value))
await page.addInitScript(() => {
  window.addEventListener('lookline:latency', (event) => {
    void (
      window as unknown as { collectLatency: (detail: unknown) => Promise<void> }
    ).collectLatency((event as CustomEvent).detail)
  })
})
try {
  await page.goto(base, { waitUntil: 'networkidle' })
  console.log('home', (await page.locator('main').innerText()).slice(0, 600))
  await page
    .getByRole('textbox', { name: 'What are you dressing for?' })
    .fill('a black hoodie under NT$3000')
  // Submitting pushes a shareable URL, and a navigation discards a response body that has not
  // been read yet, so tee the stream through the route instead of reading it afterwards.
  let captured = ''
  await page.route('**/api/intent/stream', async (route) => {
    const response = await route.fetch()
    captured = await response.text()
    await route.fulfill({ response, body: captured })
  })
  await page.getByRole('button', { name: 'Find pieces', exact: true }).click()
  await page.getByRole('heading', { name: 'Pieces for you' }).waitFor()
  await page.unroute('**/api/intent/stream')
  assert.ok(captured, 'the intent stream was captured')
  const events = captured
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const result = events.find((event) => event.type === 'result')
  assert.ok(result?.recommendation.result.ok, 'Initial deterministic recommendation must work')
  assert.ok(result.recommendation.result.items.length > 0, 'Initial result has real products')
  console.log(
    'recommendation',
    result.recommendation.result.items.length,
    'pieces; events',
    events.map((event) => event.type),
  )
  await page.screenshot({ path: 'output/playwright/latency-recommendations.png', fullPage: true })

  // Shared URLs also start a request under React Strict Mode; cleanup must not strand the page.
  await page.goto(`${base}/?q=${encodeURIComponent('a black hoodie under NT$3000')}`, {
    waitUntil: 'networkidle',
  })
  await page.getByRole('heading', { name: 'Pieces for you' }).waitFor()

  // A hanging request must not overwrite a subsequent query or disable its input.
  let first = true
  await page.route('**/api/intent/stream', async (route) => {
    if (first) {
      first = false
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.fulfill({ contentType: 'application/x-ndjson', body: captured }).catch(() => {})
      return
    }
    const updated = events.map((event) =>
      event.understanding
        ? { ...event, understanding: { ...event.understanding, q: 'newest request' } }
        : event,
    )
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: updated.map((event) => JSON.stringify(event)).join('\n') + '\n',
    })
  })
  const sentence = page.getByRole('textbox', { name: 'Your sentence' })
  await sentence.fill('older request')
  await page.getByRole('button', { name: 'Find pieces', exact: true }).click()
  await sentence.fill('newest request')
  await page.getByRole('button', { name: 'Find pieces', exact: true }).click()
  await page.getByRole('heading', { name: 'Pieces for you' }).waitFor()
  await page.waitForTimeout(1700)
  assert.equal(await sentence.inputValue(), 'newest request')
  await page.unroute('**/api/intent/stream')

  // Delay persistence and then reject: local feedback must appear immediately and retain inputs.
  const productId = result.recommendation.result.items[0].product.id
  await page.goto(`${base}/p/${productId}`, { waitUntil: 'networkidle' })
  await page.route(`**/p/${productId}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.abort('failed')
  })
  const add = page.getByRole('button', { name: 'Add to bag', exact: true })
  const before = Date.now()
  await add.click()
  await page.getByRole('status').filter({ hasText: 'Added to your bag' }).waitFor()
  const optimisticMs = Date.now() - before
  assert.ok(optimisticMs < 400, `Optimistic update took ${optimisticMs} ms`)
  await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor()
  assert.ok(await add.isEnabled(), 'Failed action can be retried')
  console.log('optimistic bag', optimisticMs, 'ms; failed write restored retry')
  await page.unroute(`**/p/${productId}`)
  await add.click()
  await page.getByRole('status').filter({ hasText: 'Added to your bag' }).waitFor()
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[role="status"]')).some(
      (node) => node.textContent === 'Added to your bag',
    ),
  )
  const bagCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'll_bag')
  assert.ok(bagCookie, 'Successful retry persisted the bag cookie')
  const lines = JSON.parse(decodeURIComponent(bagCookie.value)) as {
    productId: number
    qty: number
  }[]
  assert.ok(
    lines.some((line) => line.productId === productId && line.qty === 1),
    'Retry adds the product exactly once',
  )
  await mkdir('output/playwright', { recursive: true })
  await writeFile(
    'output/playwright/latency-measurements.json',
    JSON.stringify(
      { base, viewport: '1440x1000', reducedMotion: true, optimisticMs, measurements, errors },
      null,
      2,
    ),
  )
  assert.deepEqual(errors, [])
  console.log('PASS', JSON.stringify(measurements))
} finally {
  await browser.close()
}
