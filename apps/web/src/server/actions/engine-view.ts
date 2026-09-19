'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ENGINE_VIEW_COOKIE } from '@/server/engine-view'

/** Footer switch: `on=1` reveals engine internals across the site; anything else hides them. */
export async function toggleEngineViewAction(formData: FormData): Promise<void> {
  const store = await cookies()
  const on = formData.get('on') === '1'
  if (on) {
    store.set(ENGINE_VIEW_COOKIE, '1', {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    })
  } else {
    store.delete(ENGINE_VIEW_COOKIE)
  }
  // Stay on the page the switch was flipped from.
  const referer = (await headers()).get('referer')
  let next = '/'
  if (referer) {
    try {
      const url = new URL(referer)
      next = `${url.pathname}${url.search}`
    } catch {
      next = '/'
    }
  }
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/')
}
