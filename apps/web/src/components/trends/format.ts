/** Small number formatters shared by the dashboard and the profile card. */

/** `0.42` → `42%`. */
export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '–'
  return `${(value * 100).toFixed(digits)}%`
}

/** Fixed-digit number, `–` when not finite. */
export function num(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '–'
}

/** `2025-09-03` → `Sep 3`. */
export function shortDay(day: string): string {
  const d = new Date(day)
  if (Number.isNaN(d.getTime())) return day
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
}

/** `Sep 3, 2026` */
export function longDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return String(date)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/** `aesthetic|category` keys from `trend_signals` → `['aesthetic', 'category']`. */
export function splitPairKey(key: string): [string, string] {
  const i = key.indexOf('|')
  if (i < 0) return [key, '']
  return [key.slice(0, i), key.slice(i + 1)]
}
