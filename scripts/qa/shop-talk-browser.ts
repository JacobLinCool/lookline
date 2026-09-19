import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { eq, looks, sessions } from '@lookline/db'
import { createLocalDb, findLocalD1File, loadEnv, localDbPath } from '@lookline/db/node'
import type { WebSocketRoute } from 'playwright-core'
import { launchBrowser } from './browser'

loadEnv()
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000'
const handle = createLocalDb(findLocalD1File() ?? localDbPath())
const [look] = await handle.db.select().from(looks).limit(1)
assert.ok(look, 'A seeded local catalog is required')
const id = `qa_talk_${randomUUID()}`
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
])
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(15_000)
await page.context().addCookies([
  { name: 'll_session', value: `${id}.${signature}`, url: base },
  { name: 'll_locale', value: 'en', url: base },
])
const failures: string[] = []
page.on('pageerror', (e) => failures.push(e.message))
const passed: string[] = []
let socket: WebSocketRoute | undefined
const liveMessages: Record<string, unknown>[] = []
const decisions: Record<string, unknown>[] = []
const output = new URL('../../output/playwright/shop-talk/', import.meta.url)
await mkdir(output, { recursive: true })
try {
  await page.goto(`${base}/shop-talk`, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('#live-filter-input').count(), 0)
  assert.ok(await page.getByRole('textbox', { name: 'Tell me what you have in mind…' }).isEnabled())
  const denied = await browser.newContext()
  assert.equal(
    (
      await denied.request.post(`${base}/api/shop-talk/token`, {
        headers: { Origin: base },
        data: {},
      })
    ).status(),
    401,
  )
  await denied.close()
  assert.equal(
    (
      await page.request.post(`${base}/api/shop-talk/resolve`, {
        headers: { Origin: 'https://example.com' },
        data: {},
      })
    ).status(),
    403,
  )
  const bad = await page.request.post(`${base}/api/shop-talk/resolve`, {
    headers: { Origin: base },
    data: { base: {}, events: [], revision: -1, epoch: 0 },
  })
  assert.equal(bad.status(), 400)
  passed.push('authenticated, same-origin, validated endpoints; no legacy sentence input')

  if (process.env.QA_LIVE === '1') {
    const tokenResponse = await page.request.post(`${base}/api/shop-talk/token`, {
      headers: { Origin: base },
      data: {},
    })
    assert.equal(tokenResponse.status(), 200, 'Real constrained token issuance')
    const { token } = await tokenResponse.json()
    const liveResult = await page.evaluate(
      async (token: string) =>
        new Promise<{ output: boolean; audio: boolean; search: boolean }>((resolve, reject) => {
          const socket = new WebSocket(
            `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`,
          )
          const result = { output: false, audio: false, search: false }
          const timer = setTimeout(() => {
            socket.close()
            reject(new Error('Real Live response timed out'))
          }, 20000)
          socket.onopen = () =>
            socket.send(JSON.stringify({ setup: { model: 'models/gemini-3.8-live' } }))
          socket.onmessage = async (event) => {
            const data = JSON.parse(
              typeof event.data === 'string' ? event.data : await event.data.text(),
            )
            if (data.setupComplete)
              socket.send(
                JSON.stringify({
                  clientContent: {
                    turns: [
                      {
                        role: 'user',
                        parts: [
                          {
                            text: 'Please use Google Search to understand what the anime character Maomao from The Apothecary Diaries wears, translate that reference into clothing attributes, then ask one short shopping question.',
                          },
                        ],
                      },
                    ],
                    turnComplete: true,
                  },
                }),
              )
            const content = data.serverContent
            if (!content) return
            result.output ||= Boolean(content.outputTranscription?.text)
            result.audio ||= Boolean(
              content.modelTurn?.parts?.some((p: { inlineData?: unknown }) => p.inlineData),
            )
            result.search ||= Boolean(content.groundingMetadata)
            if (content.turnComplete) {
              clearTimeout(timer)
              socket.close()
              resolve(result)
            }
          }
          socket.onerror = () => {
            clearTimeout(timer)
            reject(new Error('Real Live socket error'))
          }
          socket.onclose = (event) => {
            clearTimeout(timer)
            if (!result.output)
              reject(new Error(`Real Live setup was rejected: ${event.code} ${event.reason}`))
          }
        }),
      token,
    )
    console.log(JSON.stringify({ realGemini: liveResult }))
    assert.ok(liveResult.output && liveResult.audio)
    passed.push('real constrained Gemini Live connection, output transcript and audio')
  }

  await page.route('**/api/shop-talk/token', (route) =>
    route.fulfill({ json: { token: 'auth_tokens/qa-token' } }),
  )
  await page.route('**/api/shop-talk/resolve', async (route) => {
    const body = route.request().postDataJSON()
    decisions.push(body)
    const events = body.events as Array<{
      kind: string
      text?: string
      values?: object
      cleared?: string[]
    }>
    let filters: Record<string, unknown> = {}
    for (const event of events) {
      if (event.text?.includes('black'))
        filters = { ...filters, categoryGroups: ['outerwear'], colorFamilies: ['black'] }
      if (event.text?.includes('navy')) filters = { ...filters, colorFamilies: ['blue'] }
      if (event.kind === 'filters') {
        Object.assign(filters, event.values)
        for (const key of event.cleared ?? []) delete filters[key]
      }
    }
    await route.fulfill({
      json: {
        filters,
        hints: [],
        freeText: false,
        unresolved: ['materials'],
        revision: body.revision,
        epoch: body.epoch,
        model: 'qa-fixture',
        latencyMs: 10,
        contractVersion: 'filters-conversation-v1',
      },
    })
  })
  await page.routeWebSocket('wss://generativelanguage.googleapis.com/**', (ws) => {
    socket = ws
    ws.onMessage((message) => {
      const data = JSON.parse(String(message))
      liveMessages.push(data)
      if (data.setup) ws.send(JSON.stringify({ setupComplete: { sessionId: 'qa-session' } }))
      if (data.clientContent?.turnComplete) {
        ws.send(
          JSON.stringify({
            serverContent: {
              outputTranscription: { text: 'For everyday wear, I suggest a navy jacket. ' },
            },
          }),
        )
        ws.send(
          JSON.stringify({
            serverContent: {
              outputTranscription: { text: 'Would you like a lighter layer?' },
              turnComplete: true,
            },
          }),
        )
      }
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('textbox').fill('I want a black jacket')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByText('Would you like a lighter layer?', { exact: false }).waitFor()
  await page.getByRole('link', { name: 'Remove filter Blue', exact: true }).waitFor()
  assert.ok(decisions.some((r) => JSON.stringify(r.events).includes('assistant')))
  assert.equal(
    liveMessages.some((m) => 'realtimeInput' in m),
    false,
    'Typing must not capture audio',
  )
  assert.equal(
    await page.getByRole('button', { name: 'Play replies aloud' }).getAttribute('aria-pressed'),
    'false',
  )
  assert.ok(page.url().includes('/shop-talk?'))
  assert.equal(
    await page.getByText('Some preferences are still unclear', { exact: false }).count(),
    0,
  )
  passed.push('unresolved preferences continue the conversation without a warning')
  passed.push(
    'typed conversation, incremental assistant transcript, silent start, same-page filters',
  )

  await page.getByRole('link', { name: 'Remove filter Blue', exact: true }).click()
  await page.waitForTimeout(400)
  assert.ok(decisions.some((r) => JSON.stringify(r.events).includes('"kind":"filters"')))
  assert.ok(liveMessages.some((m) => JSON.stringify(m).includes('Manual filter update')))
  assert.equal(new URL(page.url()).pathname, '/shop-talk')
  await page.getByRole('combobox').selectOption('price_asc')
  assert.equal(new URL(page.url()).searchParams.get('sort'), 'price_asc')
  passed.push('manual changes preserve dialogue and update both model contexts')

  await page.getByRole('button', { name: 'Turn microphone on', exact: true }).click()
  await page.getByRole('button', { name: 'Turn microphone off', exact: true }).waitFor()
  await page.waitForTimeout(250)
  assert.ok(liveMessages.some((m) => 'realtimeInput' in m))
  await page.getByRole('button', { name: 'Turn microphone off', exact: true }).click()
  const audioCount = liveMessages.filter(
    (m) => (m.realtimeInput as { audio?: unknown })?.audio,
  ).length
  await page.waitForTimeout(300)
  assert.equal(
    liveMessages.filter((m) => (m.realtimeInput as { audio?: unknown })?.audio).length,
    audioCount,
  )
  await page.getByRole('button', { name: 'Play replies aloud', exact: true }).click()
  await page.getByRole('button', { name: 'Mute replies', exact: true }).click()
  passed.push('independent microphone and playback controls; mute stops audio uploads')

  assert.ok(socket)
  socket.send(
    JSON.stringify({
      serverContent: {
        outputTranscription: { text: 'A linen layer is another option.' },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://example.com/reference', title: 'Reference lookup' } },
          ],
          searchEntryPoint: {
            renderedContent: '<a href="https://google.com/search?q=jeans">Google Search</a>',
          },
        },
        turnComplete: true,
      },
    }),
  )
  await page.getByText('A linen layer is another option.').waitFor()
  assert.equal(await page.locator('section[data-expanded] iframe').count(), 0)
  assert.equal(await page.locator('section[data-expanded] a[href^="http"]').count(), 0)
  assert.equal(await page.getByText('Google Search', { exact: true }).count(), 0)
  passed.push('reference lookup metadata never becomes external shopping results or search cards')
  await page.screenshot({ path: new URL('desktop.png', output).pathname, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.getByRole('button', { name: 'Show conversation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Show conversation', exact: true }).click()
  await page.screenshot({ path: new URL('mobile.png', output).pathname, fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByRole('button', { name: 'Minimize conversation', exact: true }).click()
  assert.ok(await page.getByRole('textbox').isVisible())
  passed.push('desktop and mobile composition; collapsed mobile composer remains available')

  await page.getByRole('button', { name: 'End conversation', exact: true }).click()
  await page.getByText('Conversation ended', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await page.getByRole('textbox').fill('I want a black jacket')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  if (await page.getByRole('button', { name: 'Show conversation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Show conversation', exact: true }).click()
  await page.getByText('Would you like a lighter layer?', { exact: false }).waitFor()
  passed.push('ending and restarting a session works without stale state')
  await page.goto(`${base}/shop`, { waitUntil: 'networkidle' })
  assert.ok(await page.locator('#live-filter-input').isEnabled())
  passed.push('original shop retains its live sentence input')
  assert.deepEqual(failures, [])
  await writeFile(
    new URL('report.json', output),
    JSON.stringify({ passed, failures, decisionCount: decisions.length }, null, 2),
  )
  console.log(JSON.stringify({ passed, failures, output: output.pathname }))
} catch (error) {
  console.log(
    JSON.stringify({
      error: error instanceof Error ? error.message : 'failed',
      failures,
      body: await page.locator('body').innerText(),
      liveMessageCount: liveMessages.length,
      decisionCount: decisions.length,
    }),
  )
  await page.screenshot({ path: new URL('failure.png', output).pathname, fullPage: true })
  throw error
} finally {
  await browser.close()
  await handle.db.delete(sessions).where(eq(sessions.id, id))
  await handle.close()
}
