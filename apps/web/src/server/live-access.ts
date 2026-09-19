import { getMessages } from '@/i18n/server'
import { getSessionUser } from './auth'

const windows = new Map<string, { until: number; count: number; active: boolean }>()

/** Process-local prototype limits, plus authenticated same-origin POSTs. */
const LIMITS = { filters: 300, voice: 6, keywords: 60 } as const

export async function liveAccess(request: Request, capability: keyof typeof LIMITS) {
  const { errors } = (await getMessages()).ui
  const origin = request.headers.get('origin')
  if (origin !== new URL(request.url).origin)
    return { response: Response.json({ error: errors.wrongOrigin }, { status: 403 }) }
  const user = await getSessionUser()
  if (!user) return { response: Response.json({ error: errors.signInRequired }, { status: 401 }) }
  const now = Date.now()
  for (const [key, value] of windows) if (value.until <= now && !value.active) windows.delete(key)
  const key = `${capability}:${user.id}`
  const current = windows.get(key)
  const entry =
    current && current.until > now
      ? current
      : { until: now + 60_000, count: 0, active: current?.active ?? false }
  if (entry.active || entry.count >= LIMITS[capability])
    return {
      response: Response.json(
        { error: errors.slowDown },
        { status: 429, headers: { 'Retry-After': '2' } },
      ),
    }
  entry.count++
  entry.active = true
  windows.set(key, entry)
  return {
    release: () => {
      entry.active = false
    },
  }
}
