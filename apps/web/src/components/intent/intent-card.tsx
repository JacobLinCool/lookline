import { X } from 'lucide-react'
import type { Intent } from '@lookline/engine'
import { Tag, type TagTone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { intentTags } from '@/lib/reason'
import { humanize } from '@/server/format'
import type { Understanding } from '@/server/intent'
import { clarifyHref, intentHref, type IntentQuery } from './urls'

// ---------------------------------------------------------------------------
// Consumer view: the understood sentence as a row of tags, plus one question if needed
// ---------------------------------------------------------------------------

export interface IntentTagsRowProps {
  understanding: Understanding
  query: IntentQuery
  className?: string
}

/**
 * What was understood, as tags a shopper can read in a glance: occasion and budget in ink, styles
 * and colours plain, avoids in tag red. Answered clarifications are removable; an open
 * clarification is one question with its options.
 */
export function IntentTagsRow({ understanding, query, className }: IntentTagsRowProps) {
  const { parse, sessionId } = understanding
  if (!parse.ok) return null
  const { intent } = parse
  const tags = intentTags(intent)
  const answered = understanding.clarify
  const open = intent.clarifications[0]

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {tags.length > 0 || answered.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Understood">
          {tags.map((tag) => (
            <li key={tag.key}>
              <Tag tone={tag.tone} size="md">
                {tag.label}
              </Tag>
            </li>
          ))}
          {answered.map((answer) => (
            <li key={answer.slot}>
              <Tag
                tone="ink"
                size="md"
                href={intentHref({
                  q: query.q,
                  clarify: (query.clarify ?? []).filter((c) => !c.startsWith(`${answer.slot}:`)),
                  previous: sessionId,
                })}
              >
                {answer.value}
                <X aria-hidden className="size-3 opacity-70" />
                <span className="sr-only">Remove</span>
              </Tag>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-2">
          <p className="display text-[19px] md:text-[21px]">{open.question}</p>
          <ul className="flex flex-wrap gap-1.5">
            {open.options.map((option) => (
              <li key={option}>
                <Tag
                  tone="neutral"
                  size="md"
                  href={clarifyHref(query, open.slot, option, sessionId)}
                >
                  {option}
                </Tag>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Engine view: every slot, every assumption with its confidence
// ---------------------------------------------------------------------------

interface SlotChip {
  key: string
  label: string
  tone?: TagTone
}

interface SlotRow {
  label: string
  chips: SlotChip[]
}

const twd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function budgetLabel(budget: Intent['budget']): string | null {
  if (!budget) return null
  const { min, max } = budget
  if (min != null && max != null) return `NT$${twd.format(min)}–${twd.format(max)}`
  if (max != null) return `up to NT$${twd.format(max)}`
  if (min != null) return `from NT$${twd.format(min)}`
  return budget.original ?? null
}

function modeLabel(mode: Intent['mode']): string {
  switch (mode) {
    case 'outfit':
      return 'Whole outfit'
    case 'single':
      return 'Single piece'
    case 'browse':
      return 'Browse'
  }
}

function departmentLabel(value: string | undefined) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : null
}

function recipientLabel(recipient: Intent['recipient']): string | null {
  if (recipient.kind === 'self') return 'For you'
  if (recipient.kind === 'undisclosed') return null
  const who =
    recipient.label ?? (recipient.relation ? humanize(recipient.relation) : 'someone else')
  const dept = departmentLabel(recipient.department)
  return dept ? `For ${who} · ${dept.toLowerCase()}` : `For ${who}`
}

function tokenValue(token: string): string {
  const colon = token.indexOf(':')
  return humanize(colon >= 0 ? token.slice(colon + 1) : token)
}

function chips(values: readonly string[], prefix: string, tone?: TagTone): SlotChip[] {
  return values.map((value) => ({ key: `${prefix}-${value}`, label: humanize(value), tone }))
}

/** Every filled slot of the intent as labelled chip rows; empty slots are omitted. */
export function slotRows(intent: Intent): SlotRow[] {
  const rows: SlotRow[] = []
  const push = (label: string, list: SlotChip[]) => {
    if (list.length > 0) rows.push({ label, chips: list })
  }

  push('Mode', [{ key: 'mode', label: modeLabel(intent.mode), tone: 'ink' }])
  const dept = departmentLabel(intent.department)
  push('Department', dept ? [{ key: 'dept', label: dept }] : [])
  push('Categories', [
    ...chips(intent.categoryGroups, 'group', 'outline'),
    ...chips(intent.subcategories, 'sub'),
  ])
  const families = intent.colorFamilies.filter((f) => !intent.colors.includes(f))
  push('Colours', [...chips(intent.colors, 'color'), ...chips(families, 'family', 'outline')])
  push('Aesthetics', chips(intent.aesthetics, 'aesthetic'))
  push('Materials & fit', [
    ...chips(intent.materials, 'material'),
    ...chips(intent.patterns, 'pattern', 'outline'),
    ...chips(intent.fits, 'fit', 'outline'),
  ])
  push('Occasion & season', [
    ...(intent.occasion ? [{ key: 'occasion', label: humanize(intent.occasion) }] : []),
    ...(intent.season
      ? [{ key: 'season', label: humanize(intent.season), tone: 'outline' as const }]
      : []),
  ])
  const budget = budgetLabel(intent.budget)
  push('Budget', budget ? [{ key: 'budget', label: budget, tone: 'ink' }] : [])
  const recipient = recipientLabel(intent.recipient)
  push('Recipient', recipient ? [{ key: 'recipient', label: recipient }] : [])
  push(
    'Sizes',
    Object.entries(intent.sizes ?? {}).map(([system, size]) => ({
      key: `size-${system}`,
      label: `${humanize(system)} ${size}`,
      tone: 'outline',
    })),
  )
  push(
    'Must have',
    intent.mustHave.map((token) => ({
      key: `have-${token}`,
      label: tokenValue(token),
      tone: 'ink',
    })),
  )
  push(
    'Must avoid',
    intent.mustAvoid.map((token) => ({
      key: `avoid-${token}`,
      label: tokenValue(token),
      tone: 'accent',
    })),
  )
  push('Vibe', intent.vibe ? [{ key: 'vibe', label: intent.vibe, tone: 'outline' }] : [])
  return rows
}

export interface IntentCardProps {
  understanding: Understanding
  className?: string
}

/** Engine view only: the full parse — slots, assumptions with confidence, provider and latency. */
export function IntentCard({ understanding, className }: IntentCardProps) {
  const { parse } = understanding
  if (!parse.ok) return null
  const { intent } = parse
  const rows = slotRows(intent)

  return (
    <div className={cn('flex flex-col gap-6 rounded-md bg-mist p-5', className)}>
      <p className="tabular text-[12px] text-muted">
        {parse.provider}
        {parse.model ? ` · ${parse.model}` : ''} · {parse.latencyMs} ms · confidence{' '}
        {Math.round(intent.confidence * 100)}%
      </p>

      <dl className="grid gap-x-6 gap-y-3 md:grid-cols-[9rem_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="pt-1 text-[12px] text-muted">{row.label}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {row.chips.map((chip) => (
                <Tag key={chip.key} tone={chip.tone ?? 'neutral'} size="md">
                  {chip.label}
                </Tag>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      {intent.assumptions.length > 0 ? (
        <div className="hairline flex flex-col gap-3 pt-5">
          <p className="text-[13px] font-medium">Assumptions</p>
          <ul className="flex flex-col gap-2.5">
            {intent.assumptions.map((assumption) => (
              <li
                key={`${assumption.slot}-${assumption.value}`}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 md:grid-cols-[9rem_1fr_6rem]"
              >
                <span className="text-[12px] text-muted">
                  {humanize(assumption.slot.split('.').pop() ?? assumption.slot)}
                </span>
                <span className="text-[13px] md:col-start-2">
                  {assumption.value}
                  <span className="text-muted"> — {assumption.reason}</span>
                </span>
                <span
                  className="flex items-center gap-2 md:col-start-3"
                  title={`Confidence ${Math.round(assumption.confidence * 100)}%`}
                >
                  <span className="h-1 w-16 overflow-hidden rounded-xs bg-line">
                    <span
                      className="block h-full bg-ink"
                      style={{ width: `${Math.round(assumption.confidence * 100)}%` }}
                    />
                  </span>
                  <span className="tabular text-[11px] text-muted">
                    {Math.round(assumption.confidence * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
