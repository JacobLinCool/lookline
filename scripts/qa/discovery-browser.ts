import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchBrowser } from './browser'

const browser = await launchBrowser()
const base = process.env.QA_BASE_URL ?? 'http://localhost:3000'
const output = 'output/playwright/discovery'
await mkdir(output, { recursive: true })
const report: unknown[] = []
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 375, height: 812 },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' })
    await page.context().addCookies([{ name: 'll_locale', value: 'en', url: base }])
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/login`)
    const choice = page.getByRole('button').filter({ hasText: 'Alice Chen' })
    await choice.click()
    await page.waitForURL(`${base}/`)
    const catalog = await page.request.get(`${base}/api/articles/search?page=1`)
    const catalogData = await catalog.json()
    assert.ok(catalogData.items?.length >= 12, 'QA needs a seeded catalog')
    const visibleItems = catalogData.items.slice(0, 12)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let failRecent = false
    await page.route('**/api/discovery/*', async (route) => {
      const section = new URL(route.request().url()).pathname.split('/').pop()
      if (section === 'preferences') await gate
      if (section === 'recent' && failRecent)
        return route.fulfill({ status: 503, json: { error: 'unavailable' } })
      const data =
        section === 'preferences'
          ? [
              { kind: 'aesthetic', value: 'minimalist', items: visibleItems.slice(0, 6) },
              { kind: 'aesthetic', value: 'streetwear', items: visibleItems.slice(6) },
            ]
          : section === 'friends'
            ? {
                friendCount: 1,
                items: [
                  {
                    kind: 'purchase',
                    id: 'p',
                    at: Date.now(),
                    person: 'Bob',
                    product: visibleItems[0],
                  },
                ],
              }
            : visibleItems
      return route.fulfill({ json: data })
    })
    await page.goto(base)
    const rails = page.locator('[data-discovery-rail]')
    await rails.first().getByRole('link').first().waitFor()
    assert.equal(await rails.count(), 5)
    const positions = () =>
      rails.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y))
    const before = await positions()
    release()
    await page
      .getByRole('heading', { name: /Picked for you/ })
      .first()
      .waitFor()
    const after = await positions()
    assert.deepEqual(after, before, 'Late preference rows do not move the other rails')
    const track = rails.first().getByRole('region')
    await rails.first().getByRole('button', { name: /Next/ }).click()
    assert.ok(await track.evaluate((node) => node.scrollLeft > 0))
    await track.focus()
    await page.keyboard.press('Home')
    assert.equal(await track.evaluate((node) => node.scrollLeft), 0)
    await page.keyboard.press('ArrowRight')
    assert.ok(await track.evaluate((node) => node.scrollLeft > 0))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await track.evaluate((node) => {
      node.scrollLeft = 0
      node.blur()
    })
    for (const rail of await rails.all()) {
      await rail.scrollIntoViewIfNeeded()
      await rail.locator('img').evaluateAll(async (images) => {
        for (const image of images) (image as HTMLImageElement).loading = 'eager'
        await Promise.all(images.map((image) => (image as HTMLImageElement).decode()))
      })
    }
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForFunction(() => scrollY === 0)
    await page.screenshot({ path: `${output}/${viewport.width}-top.png` })
    await page.screenshot({ path: `${output}/${viewport.width}.png`, fullPage: true })
    failRecent = true
    await page.reload()
    await page.getByText('This row did not load. You can still explore the others.').waitFor()
    await rails.first().getByRole('link').first().waitFor()
    failRecent = false
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await page
      .getByText('This row did not load. You can still explore the others.')
      .waitFor({ state: 'detached' })
    await page.getByRole('link', { name: 'Manage friends', exact: true }).waitFor()
    assert.deepEqual(errors, [])
    report.push({ viewport, rows: 5, lateRowShift: 0, keyboard: true, retry: true, errors })
    await page.close()
  }
  await writeFile(`${output}/checks.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await browser.close()
}
