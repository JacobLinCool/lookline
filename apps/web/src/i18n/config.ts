/**
 * Locale selection for Lookline.
 *
 * The locale lives in the `ll_locale` cookie, set by the footer switcher; without it the
 * `Accept-Language` header decides, and English is the fallback. URLs carry no locale prefix:
 * a `/shop?...` link keeps its filters and stays shareable between people reading different
 * languages. Catalog nouns (categories, colours, aesthetics) are not translated here — they
 * come from `@lookline/catalog`'s `labelZh` through `@/i18n/taxonomy`.
 */

export const LOCALES = ['en', 'zh-TW'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'll_locale'
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

/** The switcher shows each language in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-TW': '繁體中文',
}

/** BCP-47 tags for `<html lang>` and `Intl`. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en',
  'zh-TW': 'zh-Hant-TW',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** `zh-TW` for any Chinese except explicitly simplified (`zh-CN`, `zh-Hans`); English otherwise. */
export function localeFromTag(tag: string): Locale | null {
  const lower = tag.toLowerCase()
  if (lower === 'zh' || lower.startsWith('zh-')) {
    return lower.includes('hans') || lower.includes('-cn') || lower.includes('-sg') ? null : 'zh-TW'
  }
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  return null
}

/** The first understood language of an `Accept-Language` header, by descending quality. */
export function matchLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE
  const entries = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2)
      const quality = q === undefined ? 1 : Number.parseFloat(q)
      return { tag: tag?.trim() ?? '', quality: Number.isFinite(quality) ? quality : 0 }
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .toSorted((a, b) => b.quality - a.quality)
  for (const entry of entries) {
    const locale = localeFromTag(entry.tag)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}
