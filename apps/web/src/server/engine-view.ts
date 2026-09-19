import { cookies } from 'next/headers'

export const ENGINE_VIEW_COOKIE = 'll_engine'

/**
 * Engine view: a session-wide switch (footer) that reveals how results were chosen — intent slots
 * with confidence, factor breakdowns, latency. Off by default so consumer pages stay quiet; on for
 * judges and the team. Read-only here; `toggleEngineViewAction` sets the cookie.
 */
export async function isEngineView(): Promise<boolean> {
  try {
    const store = await cookies()
    return store.get(ENGINE_VIEW_COOKIE)?.value === '1'
  } catch {
    return false
  }
}
