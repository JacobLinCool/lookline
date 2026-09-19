import { getMessages } from '@/i18n/server'
import { getSessionUser } from './auth'

const windows = new Map<string, { until: number; count: number; active: boolean }>()

/** Process-local prototype limits, plus authenticated same-origin POSTs. */
export async function liveAccess(request: Request, capability: 'filters' | 'voice') {
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
  if (entry.active || entry.count >= (capability === 'voice' ? 6 : 300))
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
