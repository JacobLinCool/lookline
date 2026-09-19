import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchBrowser } from './browser'

const browser = await launchBrowser()
const base = process.env.QA_BASE_URL ?? 'http://localhost:3000'
const report: unknown[] = []
await mkdir('output/playwright/navigation', { recursive: true })
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const page = await browser.newPage({ viewport })
    await page.context().addCookies([{ name: 'll_locale', value: 'en', url: base }])
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/shop`)
    await page.getByRole('heading', { name: 'Shop', exact: true }).waitFor()
    // Hold the destination so pending feedback and the still-interactive shell are observable.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/studio' || url.pathname === '/studio.rsc') await gate
      await route.continue()
    })
    const nav = page
      .getByRole('navigation', { name: 'Primary', exact: true })
      .filter({ visible: true })
    const target = nav.locator('a[href="/studio"]')
    assert.equal(await target.count(), 1)
    await target.evaluate((node) => {
      node.addEventListener('click', () => performance.mark('navigation-click'), { once: true })
      const observer = new MutationObserver(() => {
        if (node.querySelector('[role="status"]')) {
          performance.mark('navigation-feedback')
          observer.disconnect()
        }
      })
      observer.observe(node, { childList: true, subtree: true })
    })
    const started = Date.now()
    await target.click()
    await target.getByRole('status').waitFor()
    const acknowledged = await page.evaluate(
      () =>
        performance.getEntriesByName('navigation-feedback')[0]!.startTime -
        performance.getEntriesByName('navigation-click')[0]!.startTime,
    )
    assert.equal(await nav.isVisible(), true)
    release()
    await page.waitForURL(/\/(studio|login)/)
    await page.locator('main h1').waitFor()
    await target.getByRole('status').waitFor({ state: 'detached' })
    const complete = Date.now() - started
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `output/playwright/navigation/${viewport.width}.png` })
    await page.unrouteAll()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await nav.locator('a[href="/shop"]').click()
    await page.waitForURL(`${base}/shop`)
    await page.getByRole('heading', { name: 'Shop', exact: true }).waitFor()
    // Back/forward uses the same content boundary and leaves controls usable.
    await page.goBack()
    await page.waitForURL(/\/(studio|login)/)
    await page.goForward()
    await page.waitForURL(`${base}/shop`)
    assert.deepEqual(errors, [])
    report.push({ viewport, acknowledgedMs: acknowledged, completeMs: complete, errors })
    await page.close()
  }
  await writeFile('output/playwright/navigation/checks.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await browser.close()
}
