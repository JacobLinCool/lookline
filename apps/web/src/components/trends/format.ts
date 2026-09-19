import { LOCALE_TAGS, type Locale } from '@/i18n/config'

/** Small number and date formatters shared by the dashboard and the profile card. */

/** `0.42` → `42%`. */
export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '–'
  return `${(value * 100).toFixed(digits)}%`
}

/** Fixed-digit number, `–` when not finite. */
export function num(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '–'
}

const MONTH_DAY: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(LOCALE_TAGS.en, { month: 'short', day: 'numeric' }),
  'zh-TW': new Intl.DateTimeFormat(LOCALE_TAGS['zh-TW'], { month: 'numeric', day: 'numeric' }),
}

const MONTH_DAY_YEAR: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(LOCALE_TAGS.en, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  'zh-TW': new Intl.DateTimeFormat(LOCALE_TAGS['zh-TW'], {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }),
}

/** `2025-09-03` → `Sep 3` / `9/3`. */
export function shortDay(day: string, locale: Locale = 'en'): string {
  const d = new Date(day)
  if (Number.isNaN(d.getTime())) return day
  return MONTH_DAY[locale].format(d)
}

/** `Sep 3, 2026` / `2026/9/3` */
export function longDate(date: Date | string, locale: Locale = 'en'): string {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return String(date)
  return MONTH_DAY_YEAR[locale].format(d)
}

/** `aesthetic|category` keys from `trend_signals` → `['aesthetic', 'category']`. */
export function splitPairKey(key: string): [string, string] {
  const i = key.indexOf('|')
  if (i < 0) return [key, '']
  return [key.slice(0, i), key.slice(i + 1)]
}
