import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { sessions, users } from '@lookline/db'
import { createLocalDb, findLocalD1File, loadEnv, localDbPath } from '@lookline/db/node'
import { launchBrowser } from './browser'

loadEnv()

const luminance = (color: string) => {
  const rgb = color
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
}

const browser = await launchBrowser()
const base = process.env.QA_BASE_URL ?? 'http://localhost:3000'
const report: unknown[] = []
await mkdir('output/playwright', { recursive: true })

// Filtering by sentence, and therefore the voice controls, need a signed-in reader.
const handle = createLocalDb(findLocalD1File() ?? localDbPath())
const [user] = await handle.db.select().from(users).limit(1)
assert.ok(user)
const sessionId = `qa_motion_${randomUUID()}`
await handle.db
  .insert(sessions)
  .values({ id: sessionId, userId: user.id, expiresAt: new Date(Date.now() + 900_000) })
const signature = createHmac(
  'sha256',
  process.env.SESSION_SECRET ?? 'lookline-dev-secret-change-me',
)
  .update(sessionId)
  .digest('hex')
try {
  for (const device of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: device })
    // These checks select by English accessible name; pin the language so they cannot drift.
    await page.context().addCookies([
      { name: 'll_session', value: `${sessionId}.${signature}`, url: base },
      { name: 'll_locale', value: 'en', url: base },
    ])
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      const animate = Element.prototype.animate
      Object.assign(window, { qaAnimations: [] })
      Element.prototype.animate = function (frames, options) {
        ;(window as unknown as { qaAnimations: unknown[] }).qaAnimations.push({ frames, options })
        return animate.call(this, frames, options)
      }
    })
    await page.goto(`${base}/shop`, { waitUntil: 'networkidle' })
    const languages = page.getByLabel(/Voice languages/)
    // A native <details> disclosure: expansion is its `open` property, not an aria attribute.
    const expanded = () => languages.evaluate((node) => node.closest('details')!.open)
    await languages.focus()
    await page.keyboard.press('Enter')
    assert.equal(await expanded(), true)
    assert.ok(
      await page.getByRole('checkbox', { name: '繁體中文（台灣）', exact: true }).isVisible(),
    )
    await languages.click()
    assert.equal(await expanded(), false)
    if (device.name === 'mobile')
      await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const rail = page.locator('[data-filter-rail]:visible')
    await rail.waitFor()
    const boxes = () =>
      rail.evaluate((root) => {
        const origin = root.getBoundingClientRect()
        return Array.from(root.querySelectorAll('[data-aesthetic]')).map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            id: node.getAttribute('data-aesthetic'),
            x: rect.x - origin.x,
            y: rect.y - origin.y,
            width: rect.width,
            height: rect.height,
          }
        })
      })
    const changeAndSettle = async (action: () => Promise<unknown>) => {
      const response = page.waitForResponse(
        (r) => r.url().includes('/api/products/search?') && r.status() === 200,
      )
      await action()
      const data = await (await response).json()
      assert.equal(
        data.items.length,
        Math.min(data.total, data.pageSize),
        'A matching catalog must fill its first page',
      )
      await page.waitForFunction(
        (ids) =>
          JSON.stringify(
            Array.from(document.querySelectorAll('[data-product-id]')).map((node) =>
              Number((node as HTMLElement).dataset.productId),
            ),
          ) === JSON.stringify(ids),
        data.items.map((item: { id: number }) => item.id),
      )
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
          ),
      )
    }
    // The mobile panel must finish its intentional reveal before measuring fixed control geometry.
    await rail.evaluate(async (node) => {
      const panel = node.closest('[data-open]')
      await Promise.all(
        panel?.getAnimations().map((animation) => animation.finished.catch(() => {})) ?? [],
      )
    })
    const before = await boxes()
    let started!: () => void
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      started = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let held = false
    await page.route('**/api/products/search?*', async (route) => {
      if (!held) {
        held = true
        started()
        await gate
      }
      const response = await route.fetch()
      await route.fulfill({ response })
    })
    const selected = rail.locator('[data-aesthetic="minimalist"]')
    await selected.click()
    await pending
    assert.equal(await selected.getAttribute('aria-current'), 'true')
    assert.equal(await page.locator('[data-shop-results]').getAttribute('aria-busy'), 'true')
    assert.ok(
      await page.locator('[data-product-grid] > li').count(),
      'Existing products stay mounted while loading',
    )
    const during = await boxes()
    release()
    await page.locator('[data-shop-results][aria-busy="false"]').waitFor()
    const after = await boxes()
    const maxDrift = (actual: typeof before) =>
      Math.max(
        ...actual.flatMap((row, index) =>
          ['x', 'y', 'width', 'height'].map((key) =>
            Math.abs(row[key as 'x'] - before[index]![key as 'x']),
          ),
        ),
      )
    assert.ok(maxDrift(during) < 1, `Pending controls moved ${maxDrift(during)}px`)
    assert.ok(maxDrift(after) < 1, `Resolved controls moved ${maxDrift(after)}px`)
    await selected.hover()
    const colors = await selected.evaluate((node) => ({
      foreground: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
    }))
    const light = luminance(colors.foreground),
      dark = luminance(colors.background)
    const contrast = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)
    assert.ok(contrast >= 4.5, `Selected hover contrast is ${contrast}`)
    const outerwear = rail.getByRole('link', { name: /^Outerwear/ })
    await changeAndSettle(() => outerwear.click())
    await outerwear.hover()
    // A selected filter is paper on ink. Compare against the tokens themselves, so a palette
    // revision in DESIGN.md moves the expectation with it.
    const selectedColors = await outerwear.evaluate((node) => {
      const swatches: Record<string, string> = {}
      for (const token of ['--color-paper', '--color-ink']) {
        const probe = document.createElement('span')
        probe.style.color = `var(${token})`
        document.body.append(probe)
        swatches[token] = getComputedStyle(probe).color
        probe.remove()
      }
      const style = getComputedStyle(node)
      return {
        foreground: style.color,
        background: style.backgroundColor,
        paper: swatches['--color-paper'],
        ink: swatches['--color-ink'],
      }
    })
    assert.equal(selectedColors.foreground, selectedColors.paper)
    assert.equal(selectedColors.background, selectedColors.ink)
    // Colour changes must not move the style grid either.
    const colourBefore = await boxes()
    await changeAndSettle(() => rail.getByRole('link', { name: 'Blue', exact: true }).click())
    assert.deepEqual(await boxes(), colourBefore)
    // The department pills sit above the results, not inside the filter rail.
    const departments = await page
      .getByRole('navigation', { name: 'Department' })
      .getByRole('link')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y))
    assert.equal(new Set(departments).size, 1, 'Department options stay in one row')
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No page overflow',
    )
    const normalMotion = await page.evaluate(
      () => (window as unknown as { qaAnimations: unknown[] }).qaAnimations,
    )
    assert.ok(normalMotion.length, 'New products receive their arrival transition')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => {
      ;(window as unknown as { qaAnimations: unknown[] }).qaAnimations = []
    })
    await changeAndSettle(() => rail.getByRole('link', { name: 'Blue', exact: true }).click())
    const reducedMotion = await page.evaluate(
      () =>
        (
          window as unknown as {
            qaAnimations: Array<{
              frames: Array<Record<string, unknown>>
              options: { duration: number }
            }>
          }
        ).qaAnimations,
    )
    assert.ok(reducedMotion.length > 0, 'Reduced-motion arrival feedback is exercised')
    assert.ok(
      reducedMotion.every(
        (a) => a.options.duration <= 80 && a.frames.every((f) => !('transform' in f)),
      ),
      'Reduced motion avoids spatial changes',
    )
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await changeAndSettle(() => rail.getByRole('link', { name: 'Blue', exact: true }).click())
    if (device.name === 'desktop') await page.evaluate(() => scrollTo(0, 430))
    else await rail.getByRole('region', { name: 'Style' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `output/playwright/shop-motion-${device.name}.png` })
    assert.deepEqual(errors, [])
    report.push({
      device: device.name,
      contrast,
      pendingDrift: maxDrift(during),
      resolvedDrift: maxDrift(after),
      normalAnimations: normalMotion.length,
      reducedAnimations: reducedMotion.length,
      errors,
    })
    await page.close()
  }
  await writeFile('output/playwright/shop-motion-checks.json', JSON.stringify(report, null, 2))
  console.log('PASS', JSON.stringify(report))
} finally {
  await browser.close()
}
