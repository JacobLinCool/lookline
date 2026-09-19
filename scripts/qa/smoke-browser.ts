import { launchBrowser } from './browser'
const port = Number(process.argv[2] ?? 3000)
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors: string[] = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})
const res = await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
console.log('status', res?.status(), 'title', await page.title(), 'errors', errors)
await browser.close()
