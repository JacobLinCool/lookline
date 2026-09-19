import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { eq, sessions, users } from '@lookline/db'
import { createLocalDb, findLocalD1File, loadEnv, localDbPath } from '@lookline/db/node'
import type { WebSocketRoute } from 'playwright-core'
import { launchBrowser } from './browser'

loadEnv()
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000'
const handle = createLocalDb(findLocalD1File() ?? localDbPath())
const [user] = await handle.db.select().from(users).limit(1)
assert.ok(user)
const id = `qa_layout_${randomUUID()}`
await handle.db
  .insert(sessions)
  .values({ id, userId: user.id, expiresAt: new Date(Date.now() + 600_000) })
const signature = createHmac(
  'sha256',
  process.env.SESSION_SECRET ?? 'lookline-dev-secret-change-me',
)
  .update(id)
  .digest('hex')
const browser = await launchBrowser()
const page = await browser.newPage({
  viewport: { width: 1512, height: 909 },
  reducedMotion: 'reduce',
})
page.setDefaultTimeout(10_000)
const output = 'output/playwright/shop-talk-height'
await mkdir(output, { recursive: true })
const report: unknown[] = []
const errors: string[] = []
page.on('pageerror', (e) => errors.push(e.message))
let socket: WebSocketRoute | undefined
await page.context().addCookies([
  { name: 'll_session', value: `${id}.${signature}`, url: base },
  { name: 'll_locale', value: 'zh-TW', url: base },
])
try {
  await page.route('**/api/shop-talk/token', (route) =>
    route.fulfill({ json: { token: 'auth_tokens/layout-test' } }),
  )
  await page.route('**/api/shop-talk/resolve', (route) => {
    const body = route.request().postDataJSON()
    return route.fulfill({
      json: {
        filters: { categoryGroups: ['outerwear'] },
        hints: [],
        freeText: false,
        unresolved: [],
        revision: body.revision,
        epoch: body.epoch,
        latencyMs: 1,
      },
    })
  })
  // Deliberately image-free catalog fixtures exercise the real card and pagination geometry.
  await page.route('**/api/articles/search?*', (route) =>
    route.fulfill({
      json: {
        items: Array.from({ length: 24 }, (_, i) => ({
          id: `layout-${i}`,
          name: `商品版面測試 ${i + 1}`,
          brandName: 'H&M',
          price: 990,
          colorName: 'Black',
          imagePath: null,
        })),
        total: 96,
        page: 1,
        pageSize: 24,
      },
    }),
  )
  await page.routeWebSocket('wss://generativelanguage.googleapis.com/**', (ws) => {
    socket = ws
    ws.onMessage((message) => {
      const data = JSON.parse(String(message))
      if (data.setup) ws.send(JSON.stringify({ setupComplete: {} }))
      if (data.clientContent?.turnComplete)
        ws.send(
          JSON.stringify({
            serverContent: {
              outputTranscription: {
                text: '可以從日常穿搭的場合開始，挑一件適合你的外套。\n'.repeat(70),
              },
              turnComplete: true,
            },
          }),
        )
    })
  })
  await page.goto(`${base}/shop-talk`, { waitUntil: 'networkidle' })
  await page.getByRole('textbox').fill('想找外套')
  await page.getByRole('textbox').press('Enter')
  await page.locator('[data-product-grid] > li').first().waitFor()
  const chat = page.locator('section[data-expanded]')
  const transcript = page.getByRole('log')
  const dimensions = [
    { name: 'desktop-user', width: 1512, height: 909 },
    { name: 'desktop-boundary', width: 1280, height: 600 },
    { name: 'desktop-short', width: 1440, height: 500 },
    { name: 'tablet', width: 1024, height: 768 },
    { name: 'landscape-wide', width: 844, height: 390 },
    { name: 'landscape-phone', width: 667, height: 375 },
    { name: 'phone', width: 390, height: 844 },
  ]
  for (const size of dimensions) {
    await page.setViewportSize(size)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(100)
    const measurements = await page.evaluate(`(() => {
      const chat = document.querySelector('section[data-expanded]');
      const header = document.querySelector('body > header').getBoundingClientRect();
      const nav = document.querySelector('body > nav');
      const limit = innerWidth < 768 ? nav.getBoundingClientRect().top : innerHeight;
      return {
        height: innerHeight, limit, header: header.bottom, chat: chat.getBoundingClientRect().toJSON(),
        transcriptHeight: chat.querySelector('[role="log"]').clientHeight,
        controls: [...chat.querySelectorAll('form textarea, form button')].map(el => el.getBoundingClientRect().toJSON()),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        result: document.querySelector('[data-shop-results]').getBoundingClientRect().toJSON()
      };
    })()`)
    assert.ok(measurements.transcriptHeight >= 70, `${size.name}: transcript is not readable`)
    assert.ok(!measurements.horizontalOverflow, `${size.name}: horizontal overflow`)
    assert.ok(
      measurements.chat.top >= measurements.header - 1,
      `${size.name}: chat under top navigation`,
    )
    assert.ok(
      measurements.chat.bottom <= measurements.limit + 1,
      `${size.name}: chat below visible area`,
    )
    for (const rect of measurements.controls) {
      assert.ok(rect.top >= measurements.chat.top, `${size.name}: control above chat`)
      assert.ok(rect.bottom <= measurements.limit + 1, `${size.name}: clipped control`)
    }
    if (size.width >= 1280) {
      assert.ok(measurements.result.bottom <= size.height, `${size.name}: results overflow`)
      await page.locator('[data-shop-results]').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const next = await page.locator('[data-shop-results] a[rel="next"]').boundingBox()
      assert.ok(next && next.y + next.height <= size.height, 'Pagination reachable within results')
      await page.locator('[data-shop-results]').evaluate((el) => {
        el.scrollTop = 0
      })
    }
    await transcript.evaluate((el) => {
      el.scrollTop = 0
    })
    await page.waitForTimeout(50)
    assert.ok(socket)
    socket.send(
      JSON.stringify({
        serverContent: {
          outputTranscription: { text: '新增訊息不應中斷閱讀。' },
          turnComplete: true,
        },
      }),
    )
    await page.waitForTimeout(100)
    assert.equal(
      await transcript.evaluate((el) => el.scrollTop),
      0,
      'New messages must not steal scroll position',
    )
    // Disconnect produces error + reconnect controls alongside the long transcript.
    socket.close()
    await chat.getByRole('alert').waitFor()
    await page.getByRole('textbox').focus()
    const afterError = await chat.locator('form button').last().boundingBox()
    assert.ok(
      afterError && afterError.y + afterError.height <= measurements.limit + 1,
      `${size.name}: error pushes out audio controls`,
    )
    const clipped = await page.evaluate(`(() => {
      const failures = [];
      for (const el of document.querySelectorAll('section[data-expanded] button, section[data-expanded] textarea')) {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          if (!['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowY)) continue;
          const box = parent.getBoundingClientRect();
          if (rect.top < box.top + parent.clientTop - 1 || rect.bottom > box.top + parent.clientTop + parent.clientHeight + 1)
            failures.push(el.getAttribute('aria-label') || el.textContent);
        }
      }
      return failures;
    })()`)
    assert.deepEqual(clipped, [], `${size.name}: controls clipped by a scroll container`)
    await page.screenshot({ path: `${output}/${size.name}.png` })
    if (size.width < 1280) {
      await chat.locator('button[aria-controls="talk-transcript"]').click()
      const input = await page.getByRole('textbox').boundingBox()
      assert.ok(
        input && input.y + input.height <= measurements.limit,
        'Collapsed input remains visible',
      )
      await page.screenshot({ path: `${output}/${size.name}-collapsed.png` })
      await chat.locator('button[aria-controls="talk-transcript"]').click()
    }
    await chat.getByRole('button', { name: '重新連線', exact: true }).click()
    await chat.getByRole('alert').waitFor({ state: 'hidden' })
    report.push({ name: size.name, ...measurements })
  }
  // Simulate the visual viewport change raised by an on-screen keyboard, independent of CSS dvh.
  await page.evaluate(`(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 320 });
    visualViewport.dispatchEvent(new Event('resize'));
  })()`)
  await page.waitForTimeout(100)
  const keyboardControls = await chat.locator('form button').last().boundingBox()
  assert.ok(
    keyboardControls && keyboardControls.y + keyboardControls.height <= 320,
    'Keyboard hides audio controls',
  )
  assert.ok(
    await transcript.evaluate((el) => el.clientHeight >= 70),
    'Keyboard collapses transcript',
  )
  await transcript.evaluate((el) => {
    el.scrollTop = 200
  })
  assert.ok(
    await transcript.evaluate((el) => el.scrollTop > 0),
    'Transcript cannot scroll with keyboard',
  )
  await page.screenshot({ path: `${output}/phone-keyboard.png` })
  assert.deepEqual(errors, [])
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: dimensions.map((d) => d.name), errors, output }))
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  console.error({ viewport: page.viewportSize(), error: String(error) })
  throw error
} finally {
  await browser.close()
  await handle.db.delete(sessions).where(eq(sessions.id, id))
  await handle.close()
}
