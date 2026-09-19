'use client'

import { createContext, use, type ReactNode } from 'react'
import { DEFAULT_LOCALE, type Locale } from './config'
import { CATALOGS, type Messages } from './messages'

/**
 * The reader's language in the browser. The root layout puts the locale in context; the catalogs
 * are ordinary modules, so only the locale itself crosses the server boundary.
 *
 *     const { t, locale } = useI18n()
 */

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>
}

export function useLocale(): Locale {
  return use(LocaleContext)
}

export function useI18n(): { locale: Locale; t: Messages } {
  const locale = use(LocaleContext)
  return { locale, t: CATALOGS[locale] }
}
