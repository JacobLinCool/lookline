'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { afterPaint, startInteraction } from '@/lib/latency'

export type ActionResult = { ok: true; next?: string } | { ok: false; message: string }

/** Optimistic state belongs to this mutation; failures leave the form intact for retry. */
export function InstantForm({
  action,
  children,
  confirmation,
  name,
  className,
}: {
  action: (data: FormData) => Promise<ActionResult>
  children: ReactNode
  confirmation: string
  name: string
  className?: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        if (busy.current) return
        busy.current = true
        const trace = startInteraction('instant', name)
        setState('saving')
        setError(null)
        afterPaint(() => {
          trace.mark('acknowledged')
          trace.mark('usable')
        })
        try {
          const result = await action(data)
          if (!result.ok) {
            setState('idle')
            setError(result.message)
            trace.mark('failed')
            return
          }
          setState('saved')
          afterPaint(() => trace.mark('final'))
          if (result.next) router.push(result.next)
          else router.refresh()
        } catch {
          setState('idle')
          setError('This change could not be saved. Please retry.')
          trace.mark('failed')
        } finally {
          busy.current = false
        }
      }}
      onChange={() => {
        if (!busy.current) setState('idle')
      }}
    >
      <fieldset disabled={state === 'saving'} className="contents">
        {children}
      </fieldset>
      <p role={error ? 'alert' : 'status'} aria-live="polite" className="text-[13px] text-muted">
        {error ??
          (state !== 'idle' ? `${confirmation}${state === 'saving' ? ' · syncing' : ''}` : '')}
      </p>
    </form>
  )
}
