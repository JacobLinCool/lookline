import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from './config'
import { CATALOGS, type Messages } from './messages'

/**
 * The reader's language on the server. `getI18n()` is what a server component calls:
 *
 *     const { t, locale } = await getI18n()
 *     <h1>{t.shop.title}</h1>
 *
 * The cookie the footer switcher writes wins; otherwise the browser's `Accept-Language` decides.
 * Both reads are per-request cached, so asking in twenty components costs one lookup.
 */

export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies()
  const chosen = store.get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen
  try {
    return matchLocale((await headers()).get('accept-language'))
  } catch {
    return DEFAULT_LOCALE
  }
})

export async function getMessages(): Promise<Messages> {
  return CATALOGS[await getLocale()]
}

export async function getI18n(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale()
  return { locale, t: CATALOGS[locale] }
}
