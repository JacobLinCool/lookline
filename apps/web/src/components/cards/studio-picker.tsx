'use client'

import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Avatar, Button, ProductImage, Tag } from '@/components/ui'
import { cn } from '@/lib/cn'
import { startSessionAction } from '@/server/actions/studio'

export interface PickerPersona {
  id: string
  displayName: string
  kind: 'person' | 'avatar'
  avatarSeed: number
}

export interface PickerArticle {
  articleId: string
  name: string
  categoryGroup: string
  /** Where the right to wear it comes from — shown, because it decides the card's tier. */
  source: 'purchase' | 'loan'
}

/** Owned over total, counting each article once. Mirrors `ownedRatioOf` on the server. */
function tierOf(picked: PickerArticle[]): { label: string; ratio: number } {
  if (picked.length === 0) return { label: '—', ratio: 0 }
  const owned = picked.filter((p) => p.source === 'purchase').length
  const ratio = owned / picked.length
  const label =
    ratio >= 1
      ? '全數自有'
      : ratio >= 0.75
        ? '多數自有'
        : ratio >= 0.5
          ? '半數自有'
          : ratio >= 0.25
            ? '部分自有'
            : '全數借用'
  return { label, ratio }
}

export function StudioPicker({
  personas,
  articles,
  credits,
  selectedPersona,
}: {
  personas: PickerPersona[]
  articles: PickerArticle[]
  credits: number
  selectedPersona: string
}) {
  const [personaId, setPersonaId] = useState(selectedPersona)
  const [picked, setPicked] = useState<string[]>([])

  const chosen = articles.filter((a) => picked.includes(a.articleId))
  const tier = tierOf(chosen)
  const canStart = credits > 0 && picked.length > 0 && personaId

  return (
    <form action={startSessionAction} className="flex flex-col gap-6">
      <input type="hidden" name="personaId" value={personaId} />
      {picked.map((id) => (
        <input key={id} type="hidden" name="articleId" value={id} />
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-medium">主角</h2>
        <ul className="flex flex-wrap gap-2">
          {personas.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPersonaId(p.id)}
                data-selected={personaId === p.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-[14px] transition-colors',
                  personaId === p.id ? 'border-ink bg-ink text-paper' : 'border-line hover:bg-mist',
                )}
              >
                <Avatar seed={p.avatarSeed} name={p.displayName} size="xs" />
                {p.displayName}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium">衣櫃</h2>
          <span className="text-[12px] text-muted">
            選了 {picked.length} 件 · 等級 {tier.label}
            {chosen.length > 0 ? `（自有 ${Math.round(tier.ratio * 100)}%）` : ''}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {articles.map((a) => {
            const on = picked.includes(a.articleId)
            return (
              <li key={a.articleId}>
                <button
                  type="button"
                  onClick={() =>
                    setPicked((prev) =>
                      prev.includes(a.articleId)
                        ? prev.filter((x) => x !== a.articleId)
                        : [...prev, a.articleId],
                    )
                  }
                  className={cn(
                    'relative flex w-full flex-col gap-1 rounded-md border p-1 text-left transition-colors',
                    on ? 'border-ink' : 'border-transparent hover:border-line',
                  )}
                >
                  <ProductImage articleId={a.articleId} alt={a.name} aspect="3/4" />
                  {on ? (
                    <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-ink text-paper">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : null}
                  <span className="truncate px-1 text-[12px]">{a.name}</span>
                  <span className="px-1">
                    {a.source === 'loan' ? <Tag tone="accent">朋友借你</Tag> : <Tag>自有</Tag>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-paper/95 py-3 backdrop-blur-sm">
        <p className="text-[12px] text-muted">
          開始會用掉 1 次額度（目前 {credits}），可生成最多 4 張候選，選 1 張定稿。
        </p>
        <Button type="submit" icon={<Sparkles />} disabled={!canStart}>
          開始製卡
        </Button>
      </div>
    </form>
  )
}
