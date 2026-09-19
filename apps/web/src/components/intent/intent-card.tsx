'use client'

import { X } from 'lucide-react'
import type { Intent } from '@lookline/engine'
import { Tag, type TagTone } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import type { Locale } from '@/i18n'
import { CATALOGS } from '@/i18n/messages'
import {
  aestheticLabel,
  categoryGroupLabel,
  colorFamilyLabel,
  colorLabel,
  departmentLabel,
  facetLabel,
  occasionLabel,
  seasonLabel,
  subcategoryLabel,
} from '@/i18n/taxonomy'
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
  const { t, locale } = useI18n()
  const { parse, sessionId } = understanding
  if (!parse.ok) return null
  const { intent } = parse
  const tags = intentTags(intent, locale)
  const answered = understanding.clarify
  const open = intent.clarifications[0]

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {tags.length > 0 || answered.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label={t.home.tags.understood}>
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
                <span className="sr-only">{t.common.remove}</span>
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

const engineMessages = (locale: Locale) => CATALOGS[locale].home.engine

function budgetLabel(budget: Intent['budget'], locale: Locale): string | null {
  if (!budget) return null
  const m = engineMessages(locale)
  const { min, max } = budget
  if (min != null && max != null) return `NT$${twd.format(min)}–${twd.format(max)}`
  if (max != null) return m.budgetUpTo(`NT$${twd.format(max)}`)
  if (min != null) return m.budgetFrom(`NT$${twd.format(min)}`)
  return budget.original ?? null
}

function recipientLabel(recipient: Intent['recipient'], locale: Locale): string | null {
  const m = engineMessages(locale)
  if (recipient.kind === 'self') return m.forYou
  if (recipient.kind === 'undisclosed') return null
  const who = recipient.label ?? (recipient.relation ? humanize(recipient.relation) : m.someoneElse)
  const dept = recipient.department ? departmentLabel(locale, recipient.department) : null
  return dept ? m.forRecipientIn(who, dept) : m.forRecipient(who)
}

function chips(
  values: readonly string[],
  prefix: string,
  label: (value: string) => string,
  tone?: TagTone,
): SlotChip[] {
  return values.map((value) => ({ key: `${prefix}-${value}`, label: label(value), tone }))
}

/** Every filled slot of the intent as labelled chip rows; empty slots are omitted. */
export function slotRows(intent: Intent, locale: Locale): SlotRow[] {
  const m = engineMessages(locale)
  const facet = (value: string) => facetLabel(locale, value)
  const rows: SlotRow[] = []
  const push = (label: string, list: SlotChip[]) => {
    if (list.length > 0) rows.push({ label, chips: list })
  }

  push(m.slots.mode, [{ key: 'mode', label: m.modes[intent.mode], tone: 'ink' }])
  const dept = intent.department ? departmentLabel(locale, intent.department) : null
  push(m.slots.department, dept ? [{ key: 'dept', label: dept }] : [])
  push(m.slots.categories, [
    ...chips(intent.categoryGroups, 'group', (v) => categoryGroupLabel(locale, v), 'outline'),
    ...chips(intent.subcategories, 'sub', (v) => subcategoryLabel(locale, v)),
  ])
  const families = intent.colorFamilies.filter((f) => !intent.colors.includes(f))
  push(m.slots.colours, [
    ...chips(intent.colors, 'color', (v) => colorLabel(locale, v)),
    ...chips(families, 'family', (v) => colorFamilyLabel(locale, v), 'outline'),
  ])
  push(
    m.slots.aesthetics,
    chips(intent.aesthetics, 'aesthetic', (v) => aestheticLabel(locale, v)),
  )
  push(m.slots.materialsFit, [
    ...chips(intent.materials, 'material', facet),
    ...chips(intent.patterns, 'pattern', facet, 'outline'),
    ...chips(intent.fits, 'fit', facet, 'outline'),
  ])
  push(m.slots.occasionSeason, [
    ...(intent.occasion
      ? [{ key: 'occasion', label: occasionLabel(locale, intent.occasion) }]
      : []),
    ...(intent.season
      ? [{ key: 'season', label: seasonLabel(locale, intent.season), tone: 'outline' as const }]
      : []),
  ])
  const budget = budgetLabel(intent.budget, locale)
  push(m.slots.budget, budget ? [{ key: 'budget', label: budget, tone: 'ink' }] : [])
  const recipient = recipientLabel(intent.recipient, locale)
  push(m.slots.recipient, recipient ? [{ key: 'recipient', label: recipient }] : [])
  push(
    m.slots.sizes,
    Object.entries(intent.sizes ?? {}).map(([system, size]) => ({
      key: `size-${system}`,
      label: `${humanize(system)} ${size}`,
      tone: 'outline',
    })),
  )
  push(
    m.slots.mustHave,
    intent.mustHave.map((token) => ({
      key: `have-${token}`,
      label: facet(token),
      tone: 'ink',
    })),
  )
  push(
    m.slots.mustAvoid,
    intent.mustAvoid.map((token) => ({
      key: `avoid-${token}`,
      label: facet(token),
      tone: 'accent',
    })),
  )
  push(m.slots.vibe, intent.vibe ? [{ key: 'vibe', label: intent.vibe, tone: 'outline' }] : [])
  return rows
}

export interface IntentCardProps {
  understanding: Understanding
  className?: string
}

/** Engine view only: the full parse — slots, assumptions with confidence, provider and latency. */
export function IntentCard({ understanding, className }: IntentCardProps) {
  const { t, locale } = useI18n()
  const { parse } = understanding
  if (!parse.ok) return null
  const { intent } = parse
  const rows = slotRows(intent, locale)

  return (
    <div className={cn('flex flex-col gap-6 rounded-md bg-mist p-5', className)}>
      <p className="tabular text-[12px] text-muted">
        {parse.provider}
        {parse.model ? ` · ${parse.model}` : ''} · {parse.latencyMs} ms ·{' '}
        {t.home.engine.confidence(Math.round(intent.confidence * 100))}
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
          <p className="text-[13px] font-medium">{t.home.engine.assumptions}</p>
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
                  title={t.home.engine.confidenceOf(Math.round(assumption.confidence * 100))}
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
