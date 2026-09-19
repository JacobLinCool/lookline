import type { Explanation, FactorName, Intent } from '@lookline/engine'
import { formatTwd, humanize } from '@/server/format'

/**
 * Plain-language reasons for consumer surfaces. The engine's factor breakdown stays available
 * behind Engine view; here a recommendation gets one short line a shopper can read at a glance.
 */

const FACTOR_PHRASES: Record<FactorName, string> = {
  style_similarity: 'Matches the style',
  attribute_match: 'What you asked for',
  budget_fit: 'In budget',
  user_preference: 'Close to your taste',
  social_signal: 'Friends chose it',
  trend_momentum: 'Trending now',
  brand_affinity: 'A brand you buy',
  popularity_prior: 'Popular',
  diversity: 'Something different',
  compatibility: 'Goes together',
}

/**
 * The strongest positive factors as short phrases, joined with ` · `. Pass `omit` to skip the
 * factors every result shares (style match, attribute match) so only the notable reasons remain.
 */
export function reasonLine(
  explanation: Explanation | null | undefined,
  max = 2,
  omit: readonly FactorName[] = [],
): string {
  if (!explanation) return ''
  const top = explanation.factors
    .filter(
      (f) => Number.isFinite(f.contribution) && f.contribution > 0 && !omit.includes(f.factor),
    )
    .toSorted((a, b) => b.contribution - a.contribution)
    .slice(0, max)
  const phrases = top.map((f) => FACTOR_PHRASES[f.factor] ?? humanize(f.factor))
  return [...new Set(phrases)].join(' · ')
}

/** Factors that apply to almost every result of a query; not worth a line on each card. */
export const GENERIC_FACTORS: readonly FactorName[] = ['style_similarity', 'attribute_match']

export interface IntentTag {
  /** Stable key, e.g. `occasion`, `budget`, `aesthetic:quiet-luxury`. */
  key: string
  label: string
  tone: 'neutral' | 'ink' | 'accent'
}

function budgetLabel(budget: Intent['budget']): string | null {
  if (!budget) return null
  const { min, max } = budget
  if (min != null && max != null) return `${formatTwd(min)}–${formatTwd(max)}`
  if (max != null) return `Under ${formatTwd(max)}`
  if (min != null) return `From ${formatTwd(min)}`
  return budget.original ?? null
}

function recipientLabel(recipient: Intent['recipient']): string | null {
  if (recipient.kind === 'self' || recipient.kind === 'undisclosed') return null
  const who = recipient.label ?? (recipient.relation ? humanize(recipient.relation) : null)
  return who ? `For ${who}` : 'For someone else'
}

/**
 * The understood intent as a short row of tags in the order a shopper thinks: occasion, budget,
 * who it is for, the styles, the colours, then what to avoid (tag red). Mode, department, locale,
 * sizes and every internal slot stay out; Engine view shows those.
 */
export function intentTags(intent: Intent, limit = 8): IntentTag[] {
  const tags: IntentTag[] = []
  if (intent.occasion) tags.push({ key: 'occasion', label: humanize(intent.occasion), tone: 'ink' })
  const budget = budgetLabel(intent.budget)
  if (budget) tags.push({ key: 'budget', label: budget, tone: 'ink' })
  const recipient = recipientLabel(intent.recipient)
  if (recipient) tags.push({ key: 'recipient', label: recipient, tone: 'ink' })
  for (const a of intent.aesthetics.slice(0, 3))
    tags.push({ key: `aesthetic:${a}`, label: humanize(a), tone: 'neutral' })
  for (const c of intent.colors.slice(0, 2))
    tags.push({ key: `color:${c}`, label: humanize(c), tone: 'neutral' })
  for (const s of intent.subcategories.slice(0, 2))
    tags.push({ key: `sub:${s}`, label: humanize(s), tone: 'neutral' })
  if (intent.season) tags.push({ key: 'season', label: humanize(intent.season), tone: 'neutral' })
  for (const token of intent.mustAvoid.slice(0, 2)) {
    const colon = token.indexOf(':')
    tags.push({
      key: `avoid:${token}`,
      label: `No ${humanize(colon >= 0 ? token.slice(colon + 1) : token).toLowerCase()}`,
      tone: 'accent',
    })
  }
  return tags.slice(0, limit)
}

/** `Wedding guest · Under NT$5,000 · Quiet luxury` — the intent in one line. */
export function intentHeadline(intent: Intent, max = 3): string {
  return intentTags(intent, max)
    .map((t) => t.label)
    .join(' · ')
}
