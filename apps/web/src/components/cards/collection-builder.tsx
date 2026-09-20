'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, Input } from '@/components/ui'
import { CardFace } from '@/components/cards/card-face'
import { cn } from '@/lib/cn'
import { createCollectionAction } from '@/server/actions/collections'

export interface BuilderCard {
  cardId: string
  personaId: string
  personaName: string
  avatarSeed: number
  tier: string
  code: string
}

/**
 * Picking the cards that go into a collection. One card per persona: two photographs of the same
 * persona would make the number of copies ambiguous, so the picker enforces it directly.
 */
export function CollectionBuilder({ cards }: { cards: BuilderCard[] }) {
  const [picked, setPicked] = useState<string[]>([])
  const pickedPersonas = new Set(
    cards.filter((c) => picked.includes(c.cardId)).map((c) => c.personaId),
  )

  const toggle = (card: BuilderCard) => {
    setPicked((prev) =>
      prev.includes(card.cardId)
        ? prev.filter((x) => x !== card.cardId)
        : // Replace whatever that persona already contributed.
          [
            ...prev.filter(
              (id) => cards.find((c) => c.cardId === id)?.personaId !== card.personaId,
            ),
            card.cardId,
          ],
    )
  }

  return (
    <form action={createCollectionAction} className="flex flex-col gap-4">
      {picked.map((id) => (
        <input key={id} type="hidden" name="cardId" value={id} />
      ))}
      <div className="flex items-end gap-3">
        <Field label="名稱" htmlFor="collection-title" className="flex-1">
          <Input id="collection-title" name="title" placeholder="夏天的那次出遊" />
        </Field>
        <Button type="submit" disabled={pickedPersonas.size < 1}>
          建立收藏（{pickedPersonas.size} 位）
        </Button>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {cards.map((c) => {
          const on = picked.includes(c.cardId)
          return (
            <li key={c.cardId}>
              <button
                type="button"
                onClick={() => toggle(c)}
                className={cn(
                  'relative flex w-full flex-col gap-2 rounded-lg border-2 p-1 text-left transition-colors',
                  on ? 'border-ink' : 'border-transparent hover:border-line',
                )}
              >
                <CardFace
                  imageUrl={`/api/cards/${c.cardId}`}
                  personaName={c.personaName}
                  verificationCode={c.code}
                  tierLabel={c.tier}
                />
                {on ? (
                  <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-ink text-paper">
                    <Check className="size-3" aria-hidden />
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-[12px] text-muted">
        每位 persona 帶一張卡。先放入你自己的，之後在收藏頁再邀請朋友的 persona 加入 ——
        要出哪張卡由對方自己決定。建立收藏不花額度，之後發行才會用掉 1 次，由按下發行的人支付。
      </p>
    </form>
  )
}
