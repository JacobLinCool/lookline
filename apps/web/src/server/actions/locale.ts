'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n'

/** Footer switcher: remember the reader's language and return them to the page they were on. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get('locale')
  if (isLocale(locale)) {
    const store = await cookies()
    store.set(LOCALE_COOKIE, locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: LOCALE_COOKIE_MAX_AGE,
    })
  }
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
