'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/ui'
import { CardFace } from '@/components/cards/card-face'
import { cn } from '@/lib/cn'

export interface LibraryCard {
  kind: 'card' | 'copy'
  id: string
  href: string
  imageUrl: string
  personaName: string
  personaId: string
  avatarSeed: number
  verificationCode: string
  tierLabel: string | null
  /** For a collection copy: "2/3" and which collection it belongs to. */
  editionNumber: number | null
  editionSize: number | null
  collectionTitle: string | null
  /** Issue time in epoch ms; the library's only sort key. */
  issuedAt: number
}

type Filter = 'all' | 'card' | 'copy'

/** A facet is only worth a row of chips once there is something to choose between. */
function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ key: string; label: string }>
  value: string
  onChange: (key: string) => void
}) {
  if (options.length < 2) return null
  return (
    <>
      <span className="ml-2 text-[12px] text-muted">{label}</span>
      <button type="button" onClick={() => onChange('all')} className={chip(value === 'all')}>
        不限
      </button>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={chip(value === o.key)}
        >
          {o.label}
        </button>
      ))}
    </>
  )
}

const chip = (active: boolean): string =>
  cn(
    'rounded-full border px-3 py-1 text-[12px] transition-colors',
    active ? 'border-ink bg-ink text-paper' : 'border-line hover:bg-mist',
  )

/**
 * Everything this account holds, through the personas it manages (#38).
 *
 * Copies are listed one per row even when several belong to the same artwork: holding three of a
 * three-copy edition is holding three, and collapsing them by artwork would report one.
 */
export function CardLibrary({ items }: { items: LibraryCard[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [persona, setPersona] = useState<string>('all')
  const [tier, setTier] = useState<string>('all')
  const [collection, setCollection] = useState<string>('all')
  const [newestFirst, setNewestFirst] = useState(true)

  const personaNames = new Map(items.map((i) => [i.personaId, i.personaName]))
  const tiers = [...new Set(items.map((i) => i.tierLabel).filter((t): t is string => !!t))]
  const collections = [
    ...new Set(items.map((i) => i.collectionTitle).filter((t): t is string => !!t)),
  ]
  const shown = items
    .filter(
      (i) =>
        (filter === 'all' || i.kind === filter) &&
        (persona === 'all' || i.personaId === persona) &&
        (tier === 'all' || i.tierLabel === tier) &&
        (collection === 'all' || i.collectionTitle === collection),
    )
    .toSorted((a, b) => (newestFirst ? b.issuedAt - a.issuedAt : a.issuedAt - b.issuedAt))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}>
          全部 {items.length}
        </button>
        <button type="button" onClick={() => setFilter('card')} className={chip(filter === 'card')}>
          個人卡 {items.filter((i) => i.kind === 'card').length}
        </button>
        <button type="button" onClick={() => setFilter('copy')} className={chip(filter === 'copy')}>
          收藏卡 {items.filter((i) => i.kind === 'copy').length}
        </button>
        <ChipGroup
          label="主角"
          options={[...personaNames].map(([id, name]) => ({ key: id, label: name }))}
          value={persona}
          onChange={setPersona}
        />
        <ChipGroup
          label="等級"
          options={tiers.map((t) => ({ key: t, label: t }))}
          value={tier}
          onChange={setTier}
        />
        <ChipGroup
          label="收藏"
          options={collections.map((t) => ({ key: t, label: t }))}
          value={collection}
          onChange={setCollection}
        />
        <button
          type="button"
          onClick={() => setNewestFirst((v) => !v)}
          className={cn(chip(false), 'ml-auto')}
        >
          {newestFirst ? '新到舊' : '舊到新'}
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="這裡還沒有卡片" description="到製卡工作室做第一張。" />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {shown.map((i) => (
            <li key={`${i.kind}-${i.id}`}>
              {/* The subject, the number and the code are printed on the card now, so the tile is
                  the card and nothing is repeated beside it. */}
              <Link href={i.href} className="block tile-lift">
                <CardFace
                  imageUrl={i.imageUrl}
                  personaName={i.personaName}
                  verificationCode={i.verificationCode}
                  tierLabel={i.tierLabel}
                  editionNumber={i.editionNumber}
                  editionSize={i.editionSize}
                  collectionTitle={i.collectionTitle}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
