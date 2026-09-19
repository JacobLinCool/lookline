/**
 * QA helper: launch the locally installed Google Chrome through playwright-core (no browser download).
 *   import { launchBrowser } from './browser'
 *   const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
 */
import { chromium, type Browser } from 'playwright-core'

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/opt/homebrew/bin/chromium',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

export async function launchBrowser(args: string[] = []): Promise<Browser> {
  const { existsSync } = await import('node:fs')
  const executablePath = CANDIDATES.find((p) => existsSync(p))
  if (!executablePath) throw new Error('no local Chrome/Chromium found')
  return chromium.launch({ executablePath, headless: true, args })
}

/** Cookie object for playwright `context.addCookies` from a `ll_session` value. */
export function sessionCookie(value: string, _port: number) {
  return {
    name: 'll_session',
    value,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    url: undefined,
    expires: -1,
    secure: false,
  }
}
