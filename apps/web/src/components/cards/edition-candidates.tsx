'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Notice } from '@/components/ui'
import { cn } from '@/lib/cn'
import { InstantForm } from '@/components/latency/instant-form'
import { useStudioProgress } from '@/components/cards/use-studio-progress'
import { generateCandidateAction } from '@/server/actions/studio'
import { settleEditionAction } from '@/server/actions/collections'

/** One of the four places: a picture, a render on its way, or nothing yet. */
type Slot =
  | { kind: 'made'; candidate: { id: string; position: number } }
  | { kind: 'rendering' }
  | { kind: 'empty' }

export function EditionCandidates({
  collectionId,
  sessionId,
  candidates,
  pending,
  error,
  max,
  editionSize,
  settled,
}: {
  collectionId: string
  sessionId: string
  candidates: Array<{ id: string; position: number }>
  /** Renders already running when the page was drawn; the grid follows them from there. */
  pending: number
  /** Why the last render produced nothing, when none is running. */
  error: string | null
  max: number
  editionSize: number
  settled: boolean
}) {
  const progress = useStudioProgress(sessionId, { candidates, pending, error })
  const [picked, setPicked] = useState<string | null>(null)
  // The first candidate is selected by default, but the list is empty on the first render and a
  // `useState` initialiser never runs again — so resolve it here rather than freezing in `null`
  // and leaving the issue button disabled with nothing on screen saying why.
  const made = progress.candidates
  const chosen = picked ?? made[0]?.id ?? null
  const setChosen = setPicked
  // A render on its way already holds a place, so the button goes quiet before the grid is full.
  const full = made.length + progress.pending >= max
  const slots: Slot[] = Array.from({ length: max }, (_, i) =>
    made[i] ? { kind: 'made', candidate: made[i]! } : { kind: 'empty' },
  )
  for (let i = made.length; i < Math.min(max, made.length + progress.pending); i++) {
    slots[i] = { kind: 'rendering' }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {slots.map((slot, i) => (
          <li key={slot.kind === 'made' ? slot.candidate.id : `${slot.kind}-${i}`}>
            {slot.kind === 'made' ? (
              <button
                type="button"
                onClick={() => setChosen(slot.candidate.id)}
                className={cn(
                  'flex w-full flex-col gap-2 rounded-lg border-2 p-1 transition-colors',
                  chosen === slot.candidate.id
                    ? 'border-ink'
                    : 'border-transparent hover:border-line',
                )}
              >
                <img
                  src={`/api/cards/candidate/${slot.candidate.id}`}
                  alt={`候選 ${slot.candidate.position}`}
                  width={600}
                  height={840}
                  className="w-full rounded-md"
                />
                <span className="px-1 text-left text-[12px] text-muted">
                  候選 {slot.candidate.position}
                </span>
              </button>
            ) : slot.kind === 'rendering' ? (
              <div className="flex aspect-[5/7] animate-pulse flex-col items-center justify-center gap-1 rounded-lg border border-line bg-mist px-3 text-center text-[12px] text-muted">
                <span>生成中…</span>
                <span className="text-[11px]">每位成員各穿自己的那幾件，大約需要半分鐘</span>
              </div>
            ) : (
              <div className="flex aspect-[5/7] items-center justify-center rounded-lg border border-dashed border-line text-[12px] text-muted">
                空位 {i + 1}
              </div>
            )}
          </li>
        ))}
      </ul>

      {progress.error ? <Notice tone="warning">{progress.error}</Notice> : null}

      {/* `items-start`, not `items-center`: an `InstantForm` carries a status line under its
          button, so its box is taller than a plain form's and centring the row lifted its
          button clear of the one beside it. Aligning the tops lines the buttons up. */}
      {!settled ? (
        <div className="flex flex-wrap items-start gap-3">
          <InstantForm
            action={generateCandidateAction}
            name="generate-edition"
            confirmation="開始生成"
          >
            <input type="hidden" name="sessionId" value={sessionId} />
            <Button type="submit" variant="secondary" icon={<RefreshCw />} disabled={full}>
              {full
                ? progress.pending > 0
                  ? '生成中…'
                  : `已滿 ${max} 張`
                : made.length + progress.pending === 0
                  ? '生成第一張'
                  : '再生成一張'}
            </Button>
          </InstantForm>
          <form action={settleEditionAction}>
            <input type="hidden" name="collectionId" value={collectionId} />
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="candidateId" value={chosen ?? ''} />
            <Button type="submit" disabled={!chosen}>
              發行 {editionSize} 份
            </Button>
          </form>
        </div>
      ) : (
        <p className="text-[13px] text-muted">這次發行已經完成。</p>
      )}
    </div>
  )
}
