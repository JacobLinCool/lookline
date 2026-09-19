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

/** Integer TWD → `NT$1,290`. */
export function formatTwd(amount: number): string {
  return `NT$${twdFormatter.format(Math.round(amount))}`
}

/** `1234` → `1.2K`; used for counts on cards and dashboards. */
export function formatCompact(value: number): string {
  return compactFormatter.format(value)
}

/**
 * Relative time in editorial English: `just now`, `4 min ago`, `3 h ago`, `yesterday`,
 * `5 d ago`, `3 w ago`, then `Mar 3` / `Mar 3, 2025` for older dates.
 */
export function formatRelative(date: Date | string | number, now: Date = new Date()): string {
  const then = date instanceof Date ? date : new Date(date)
  const diffMs = now.getTime() - then.getTime()
  if (Number.isNaN(diffMs)) return ''
  const seconds = Math.round(diffMs / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks} w ago`
  return then.getFullYear() === now.getFullYear()
    ? monthDay.format(then)
    : monthDayYear.format(then)
}

/** `pluralize(3, 'Look')` → `3 Looks`; pass an explicit plural for irregular nouns. */
export function pluralize(
  count: number,
  singular: string,
  plural: string = `${singular}s`,
): string {
  return `${twdFormatter.format(count)} ${count === 1 ? singular : plural}`
}

/** `quiet-luxury` → `Quiet luxury`; used for slugs that have no label lookup yet. */
export function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
