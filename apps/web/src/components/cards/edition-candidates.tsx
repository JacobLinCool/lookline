'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { InstantForm } from '@/components/latency/instant-form'
import { generateCandidateAction } from '@/server/actions/studio'
import { settleEditionAction } from '@/server/actions/collections'

export function EditionCandidates({
  collectionId,
  sessionId,
  candidates,
  max,
  editionSize,
  settled,
}: {
  collectionId: string
  sessionId: string
  candidates: Array<{ id: string; position: number }>
  max: number
  editionSize: number
  settled: boolean
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

      {!settled ? (
        <div className="flex flex-wrap items-center gap-3">
          <InstantForm
            action={generateCandidateAction}
            name="generate-edition"
            confirmation="已生成"
          >
            <input type="hidden" name="sessionId" value={sessionId} />
            <Button type="submit" variant="secondary" icon={<RefreshCw />} disabled={full}>
              {full ? `已滿 ${max} 張` : candidates.length === 0 ? '生成第一張' : '再生成一張'}
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
