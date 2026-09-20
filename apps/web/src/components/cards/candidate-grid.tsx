'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { InstantForm } from '@/components/latency/instant-form'
import {
  abandonSessionAction,
  generateCandidateAction,
  settleCardAction,
} from '@/server/actions/studio'

export interface CandidateItem {
  id: string
  position: number
}

/**
 * Four slots, filled one at a time. Candidates sit side by side rather than replacing each other,
 * which is what lets any of them — not just the newest — become the card.
 */
export function CandidateGrid({
  sessionId,
  candidates,
  max,
  settled,
  issuedCardId,
}: {
  sessionId: string
  candidates: CandidateItem[]
  max: number
  settled: boolean
  /** Set once the session has produced a card, so the settled state can link to it. */
  issuedCardId: string | null
}) {
  const [picked, setPicked] = useState<string | null>(null)
  // The first candidate is selected by default, but the list is empty on the first render and a
  // `useState` initialiser never runs again — so resolve it here rather than freezing in `null`
  // and leaving the issue button disabled with nothing on screen saying why.
  const chosen = picked ?? candidates[0]?.id ?? null
  const setChosen = setPicked
  const full = candidates.length >= max
  const slots = Array.from({ length: max }, (_, i) => candidates[i] ?? null)

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {slots.map((c, i) => (
          <li key={c?.id ?? `empty-${i}`}>
            {c ? (
              <button
                type="button"
                onClick={() => setChosen(c.id)}
                className={cn(
                  'flex w-full flex-col gap-2 rounded-lg border-2 p-1 transition-colors',
                  chosen === c.id ? 'border-ink' : 'border-transparent hover:border-line',
                )}
              >
                <img
                  src={`/api/cards/candidate/${c.id}`}
                  alt={`候選 ${c.position}`}
                  width={600}
                  height={840}
                  className="w-full rounded-md"
                />
                <span className="px-1 text-left text-[12px] text-muted">候選 {c.position}</span>
              </button>
            ) : (
              <div className="flex aspect-[5/7] items-center justify-center rounded-lg border border-dashed border-line text-[12px] text-muted">
                空位 {i + 1}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* `items-start`, not `items-center`: an `InstantForm` carries a status line under its
          button, so its box is taller than a plain form's and centring the row lifted its
          button clear of the one beside it. Aligning the tops lines the buttons up. */}
      {!settled ? (
        <div className="flex flex-wrap items-start gap-3">
          <InstantForm
            action={generateCandidateAction}
            name="generate-candidate"
            confirmation="已生成"
          >
            <input type="hidden" name="sessionId" value={sessionId} />
            <Button type="submit" variant="secondary" icon={<RefreshCw />} disabled={full}>
              {full ? `已滿 ${max} 張` : candidates.length === 0 ? '生成第一張' : '再生成一張'}
            </Button>
          </InstantForm>

          <form action={settleCardAction}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="candidateId" value={chosen ?? ''} />
            <Button type="submit" disabled={!chosen}>
              就選這張，正式發行
            </Button>
          </form>

          {candidates.length === 0 ? (
            <form action={abandonSessionAction} className="ml-auto">
              <input type="hidden" name="sessionId" value={sessionId} />
              <Button type="submit" variant="link" size="sm">
                放棄並取回額度
              </Button>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-muted">這次製卡已經定稿。</p>
          {/* Without this the page is a dead end: the card it produced is one click away and
              nothing on screen said where. */}
          {issuedCardId ? <Button href={`/cards/${issuedCardId}`}>看這張卡</Button> : null}
        </div>
      )}
    </div>
  )
}
