import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { eq, looks, sessions } from '@lookline/db'
import { createLocalDb, findLocalD1File, loadEnv, localDbPath } from '@lookline/db/node'
import type { WebSocketRoute } from 'playwright-core'
import { launchBrowser } from './browser'

loadEnv()
const base = process.env.QA_BASE_URL ?? 'http://localhost:3000'
// The dev server reads the local D1 file; fall back to the seed database.
const handle = createLocalDb(findLocalD1File() ?? localDbPath())
const [look] = await handle.db.select().from(looks).limit(1)
assert.ok(look)
const id = `qa_live_${randomUUID()}`
await handle.db
  .insert(sessions)
  .values({ id, userId: look.ownerId, expiresAt: new Date(Date.now() + 600_000) })
const signature = createHmac(
  'sha256',
  process.env.SESSION_SECRET ?? 'lookline-dev-secret-change-me',
)
  .update(id)
  .digest('hex')
const browser = await launchBrowser([
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  ...(process.env.QA_VOICE_WAV
    ? [`--use-file-for-fake-audio-capture=${process.env.QA_VOICE_WAV}`]
    : []),
])
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(12_000)
await page.context().addCookies([{ name: 'll_session', value: `${id}.${signature}`, url: base }])
await page.addInitScript(() => {
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  Object.assign(window, { qaTracks: [] as MediaStreamTrack[] })
  navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await original(...args)
    ;(window as unknown as { qaTracks: MediaStreamTrack[] }).qaTracks.push(...stream.getTracks())
    return stream
  }
})
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const report: Record<string, unknown> = {
  transport: 'mocked model events; real catalog queries',
  tests: [],
}
const passed = report.tests as string[]
try {
  await page.goto(`${base}/shop`, { waitUntil: 'networkidle' })
  const input = page.getByRole('textbox', { name: 'Describe your filters' })
  assert.ok(await input.isEnabled(), 'TypeSafe must be configured')
  const chip = (label: string) =>
    page.getByRole('link', { name: `Remove filter ${label}`, exact: true })
  const languageSummary = page.getByRole('button', { name: /Voice languages/ })
  await languageSummary.click()
  const traditional = page.getByRole('checkbox', { name: '繁體中文（台灣）', exact: true })
  const english = page.getByRole('checkbox', { name: 'English', exact: true })
  const japanese = page.getByRole('checkbox', { name: '日本語', exact: true })
  assert.ok(await traditional.isChecked())
  assert.ok(await english.isChecked())
  await english.uncheck()
  assert.ok(await traditional.isDisabled(), 'At least one language stays selected')
  await english.check()
  await japanese.check()
  await page.reload({ waitUntil: 'networkidle' })
  await languageSummary.click()
  assert.ok(await japanese.isChecked(), 'Selected languages survive reload')
  await japanese.uncheck()
  const invalidLanguages = await page.request.post(`${base}/api/voice/token`, {
    headers: { Origin: base },
    data: { languageCodes: ['invalid-language'] },
  })
  assert.equal(invalidLanguages.status(), 400)
  passed.push('Traditional Chinese and English defaults; multi-select, persistence and validation')
  const tokenUnauthorized = await browser.newContext()
  const auth = await tokenUnauthorized.request.post(`${base}/api/voice/token`, {
    headers: { Origin: base },
  })
  assert.equal(auth.status(), 401)
  await tokenUnauthorized.close()
  const crossOrigin = await page.request.post(`${base}/api/filters/resolve`, {
    headers: { Origin: 'https://example.com' },
    data: { utterance: 'black' },
  })
  assert.equal(crossOrigin.status(), 403)
  passed.push('authenticated, same-origin endpoints')

  // Real provider connection, with synthetic browser audio only; no microphone is recorded.
  await page.getByRole('button', { name: 'Start voice filters' }).click()
  try {
    await page.getByText('● Listening', { exact: true }).waitFor({ timeout: 15_000 })
    assert.ok(await english.isDisabled(), 'Active capture locks its language configuration')
    report.realVoice =
      'Gemini ephemeral token and Transcribe Live setup succeeded with synthetic audio'
    if (process.env.QA_VOICE_WAV) {
      await page.waitForFunction(
        (pattern) =>
          new RegExp(pattern, 'i').test(
            (document.getElementById('live-filter-input') as HTMLInputElement).value,
          ),
        process.env.QA_VOICE_PATTERN ?? 'Taiwan dollars',
        { timeout: 25_000 },
      )
      await chip('Outerwear').waitFor()
      await chip('Under NT$3,000').waitFor()
      report.realTranscript = await input.inputValue()
      report.realSpeechFilters = true
    }
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await page.getByRole('button', { name: 'Start voice filters' }).waitFor()
  } catch (error) {
    if (process.env.QA_VOICE_WAV) throw error
    report.realVoice = await page
      .locator('main')
      .innerText()
      .then((t) => t.slice(0, 1200))
    if (await page.getByRole('button', { name: 'Cancel live filters' }).count())
      await page.getByRole('button', { name: 'Cancel live filters' }).click()
  }
  console.log('realVoice', report.realVoice, report.realTranscript, report.realSpeechFilters)
  await page.goto(`${base}/shop`, { waitUntil: 'networkidle' })

  const live = await page.request.post(`${base}/api/filters/resolve`, {
    headers: { Origin: base },
    data: { utterance: 'black or navy outerwear under TWD 3000, no red', base: {}, revision: 1 },
  })
  const liveData = await live.json()
  report.realJev = { status: live.status(), ...liveData }
  console.log('realJev', JSON.stringify(report.realJev))

  let delayedStarted!: () => void
  let releaseDelayed!: () => void
  let delayedComplete!: () => void
  const delayedReady = new Promise<void>((r) => {
    delayedStarted = r
  })
  const delayedRelease = new Promise<void>((r) => {
    releaseDelayed = r
  })
  const delayedDone = new Promise<void>((r) => {
    delayedComplete = r
  })
  await page.route('**/api/filters/resolve', async (route) => {
    const request = route.request().postDataJSON()
    if (request.utterance === 'delayed red') {
      delayedStarted()
      await delayedRelease
    }
    if (request.utterance === 'service failure') {
      await route.fulfill({
        status: 503,
        json: { error: 'Filter service temporarily unavailable.' },
      })
      return
    }
    const corrected = request.utterance.includes('navy') || request.utterance.includes('海軍藍')
    const filters =
      request.utterance === 'delayed red'
        ? { colorFamilies: ['red'] }
        : {
            categoryGroups: ['outerwear'],
            colorFamilies: [corrected ? 'blue' : 'black'],
            ...(corrected ? { excludedColorFamilies: ['black'], priceMax: 3000 } : {}),
          }
    await route.fulfill({
      json: {
        revision: request.revision,
        filters,
        unresolved: [],
        model: 'qa-mock',
        contractVersion: 'filters-v1',
        latencyMs: 25,
      },
    })
    if (request.utterance === 'delayed red') delayedComplete()
  })
  await input.fill('black outerwear')
  await chip('Black').waitFor()
  assert.equal(new URL(page.url()).search, '')
  await page.getByText(/matching pieces · preview/).waitFor()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.waitForURL('**/shop?*colorFamilies=black*')
  passed.push('typed live chips and products; explicit URL commit')
  await input.fill('navy outerwear')
  await chip('Blue').waitFor()
  await page.getByRole('button', { name: 'Cancel live filters' }).click()
  await chip('Black').waitFor()
  assert.equal(await chip('Blue').count(), 0)
  passed.push('cancel restores committed filters')

  await input.fill('delayed red')
  await delayedReady
  await page.getByRole('combobox', { name: 'Sort products' }).selectOption('price_asc')
  releaseDelayed()
  await delayedDone
  assert.equal(await chip('Red').count(), 0)
  assert.equal(
    await page.getByRole('combobox', { name: 'Sort products' }).inputValue(),
    'price_asc',
  )
  passed.push('manual edit invalidates older model response')
  await input.fill('service failure')
  await page.getByText('Filter service temporarily unavailable.', { exact: true }).waitFor()
  assert.ok(await chip('Black').isVisible())
  assert.ok(await page.locator('main a[href^="/p/"]').first().isVisible())
  passed.push('provider error keeps usable catalog results')
  await page.getByRole('button', { name: 'Cancel live filters' }).click()

  await page.route('**/api/voice/token', (route) => {
    assert.deepEqual(route.request().postDataJSON(), { languageCodes: ['en-US', 'ja-JP'] })
    return route.fulfill({ json: { token: 'auth_tokens/qa-token' } })
  })
  let socket!: WebSocketRoute
  let setupModel = ''
  let pcmChunks = 0
  let firstPcm!: () => void
  const pcmReady = new Promise<void>((resolve) => {
    firstPcm = resolve
  })
  let audioEnded = false
  await page.routeWebSocket(/generativelanguage.googleapis.com/, (ws) => {
    socket = ws
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw))
      if (message.setup) {
        setupModel = message.setup.model
        assert.deepEqual(message.setup.inputAudioTranscription.languageCodes, ['en-US', 'ja-JP'])
        ws.send(Buffer.from(JSON.stringify({ setupComplete: {} })))
      }
      const realtime = message.realtimeInput
      if (realtime?.audio?.data || realtime?.mediaChunks?.[0]?.data) {
        const audio = realtime.audio ?? realtime.mediaChunks[0]
        assert.equal(audio.mimeType, 'audio/pcm;rate=16000')
        assert.ok(Buffer.from(audio.data, 'base64').length <= 3200)
        pcmChunks++
        firstPcm()
      }
      if (realtime?.audioStreamEnd) {
        audioEnded = true
        ws.send(
          Buffer.from(
            JSON.stringify({
              serverContent: {
                inputTranscription: {
                  text: '黑色外套，不要黑色，改成海軍藍，三千以內',
                  finished: true,
                },
              },
            }),
          ),
        )
      }
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await languageSummary.click()
  await traditional.uncheck()
  await japanese.check()
  await page.getByRole('button', { name: 'Start voice filters' }).click()
  await page.getByText('● Listening', { exact: true }).waitFor()
  await Promise.race([
    pcmReady,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('No PCM packets in 5 seconds')), 5000),
    ),
  ])
  socket.send(
    Buffer.from(
      JSON.stringify({ serverContent: { interimInputTranscription: { text: '黑色外套' } } }),
    ),
  )
  await page.waitForFunction(
    () => (document.getElementById('live-filter-input') as HTMLInputElement).value === '黑色外套',
  )
  await chip('Black').waitFor()
  socket.send(
    Buffer.from(
      JSON.stringify({
        serverContent: {
          interimInputTranscription: { text: '黑色外套，不要黑色，改成海軍藍，三千以內' },
        },
      }),
    ),
  )
  await chip('Blue').waitFor()
  await chip('Not Black').waitFor()
  assert.equal(await chip('Black').count(), 0)
  assert.equal(
    new URL(page.url()).searchParams.get('colorFamilies'),
    'black',
    'interim keeps committed URL',
  )
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.waitForURL('**/shop?*colorFamilies=blue*')
  await page.getByRole('button', { name: 'Start voice filters' }).waitFor()
  assert.ok(setupModel.endsWith('gemini-3.5-transcribe-live'))
  assert.ok(pcmChunks > 0, 'real AudioWorklet emits PCM packets')
  assert.ok(audioEnded)
  assert.ok(
    await page.evaluate(() =>
      (window as unknown as { qaTracks: MediaStreamTrack[] }).qaTracks.every(
        (t) => t.readyState === 'ended',
      ),
    ),
  )
  passed.push(
    '16kHz PCM worklet, interim replacement, correction, final commit and stopped microphone',
  )
  passed.push('Selected languages reach both token request and Live setup')
  report.pcmChunks = pcmChunks
  await page.getByText(/^326 matching pieces$/).waitFor()
  await mkdir('output/playwright', { recursive: true })
  await page.screenshot({ path: 'output/playwright/live-filters.png', fullPage: false })
  report.errors = errors
  await writeFile('output/playwright/live-filters-checks.json', JSON.stringify(report, null, 2))
  assert.deepEqual(errors, [])
  console.log('PASS', JSON.stringify(passed))
} catch (error) {
  console.log('UI', (await page.locator('main').innerText()).slice(0, 1400), 'errors', errors)
  throw error
} finally {
  await browser.close()
  await handle.db.delete(sessions).where(eq(sessions.id, id))
  await handle.close()
}
