'use client'

import { useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { reactToLookAction } from '@/server/actions/looks'
import { afterPaint, startInteraction } from '@/lib/latency'

/** A heart. Pressed once it stays filled; the owner learns someone liked the Look. */
export function ReactionButton({
  lookId,
  initiallyReacted,
}: {
  lookId: string
  initiallyReacted: boolean
}) {
  const [reacted, setReacted] = useState(initiallyReacted)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={reacted}
        aria-label={reacted ? 'Liked' : 'Like this Look'}
        disabled={reacted}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium transition-colors',
          reacted ? 'text-accent' : 'text-ink hover:bg-mist',
          'disabled:pointer-events-none',
        )}
        onClick={async () => {
          if (busy.current) return
          busy.current = true
          const trace = startInteraction('instant', 'react-to-look')
          setReacted(true)
          setError(null)
          afterPaint(() => {
            trace.mark('acknowledged')
            trace.mark('usable')
          })
          const data = new FormData()
          data.set('lookId', lookId)
          try {
            const result = await reactToLookAction(data)
            if (!result.ok) throw new Error(result.message)
            afterPaint(() => trace.mark('final'))
          } catch (cause) {
            setReacted(false)
            setError(cause instanceof Error ? cause.message : 'Your like was not saved. Try again.')
            trace.mark('failed')
          } finally {
            busy.current = false
          }
        }}
      >
        <Heart className={cn('size-4', reacted && 'fill-current')} />
        {reacted ? 'Liked' : 'Like'}
      </button>
      {error ? (
        <p role="alert" className="text-[12px] text-muted">
          {error}
        </p>
      ) : null}
    </div>
  )
}
