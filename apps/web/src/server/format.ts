import type { Locale } from '@/i18n/config'

const twdFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const monthDayYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** `1234` → `1,234`. Digits group the same way in both locales. */
export function formatNumber(value: number): string {
  return twdFormatter.format(value)
}

/** Integer TWD → `NT$1,290`. */
export function formatTwd(amount: number): string {
  return `NT$${twdFormatter.format(Math.round(amount))}`
}

/** `1234` → `1.2K`; used for counts on cards and dashboards. */
export function formatCompact(value: number): string {
  return compactFormatter.format(value)
}

const zhMonthDay = new Intl.DateTimeFormat('zh-Hant-TW', { month: 'numeric', day: 'numeric' })
const zhMonthDayYear = new Intl.DateTimeFormat('zh-Hant-TW', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/**
 * Relative time as a caption: `just now`, `4 min ago`, `3 h ago`, `yesterday`, `5 d ago`,
 * `3 w ago`, then `Mar 3` / `Mar 3, 2025` for older dates; `剛剛`, `4 分鐘前`, `3 小時前`,
 * `昨天`, `5 天前`, `3 週前`, `3月3日` in Traditional Chinese.
 */
export function formatRelative(
  date: Date | string | number,
  locale: Locale = 'en',
  now: Date = new Date(),
): string {
  const then = date instanceof Date ? date : new Date(date)
  const diffMs = now.getTime() - then.getTime()
  if (Number.isNaN(diffMs)) return ''
  const zh = locale === 'zh-TW'
  const seconds = Math.round(diffMs / 1000)
  if (seconds < 45) return zh ? '剛剛' : 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return zh ? `${minutes} 分鐘前` : `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return zh ? `${hours} 小時前` : `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return zh ? '昨天' : 'yesterday'
  if (days < 7) return zh ? `${days} 天前` : `${days} d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return zh ? `${weeks} 週前` : `${weeks} w ago`
  const sameYear = then.getFullYear() === now.getFullYear()
  if (zh) return sameYear ? zhMonthDay.format(then) : zhMonthDayYear.format(then)
  return sameYear ? monthDay.format(then) : monthDayYear.format(then)
}

/** `quiet-luxury` → `Quiet luxury`; used for slugs that have no label lookup yet. */
export function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
