'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n/client'
import { flyArticlesToBag } from '@/lib/fly-to-bag'
import { afterPaint, startInteraction } from '@/lib/latency'

export type ActionResult = { ok: true; next?: string } | { ok: false; message: string }

/** Optimistic state belongs to this mutation; failures leave the form intact for retry. */
export function InstantForm({
  action,
  children,
  confirmation,
  name,
  className,
  flyToBag,
}: {
  action: (data: FormData) => Promise<ActionResult>
  children: ReactNode
  confirmation: string
  name: string
  className?: string
  /** Articles this form puts in the bag; they fly there as the submit is acknowledged. */
  flyToBag?: readonly string[]
}) {
  const { t } = useI18n()
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
        if (flyToBag?.length) flyArticlesToBag(flyToBag)
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
          setError(t.ui.instantForm.failed)
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
      {/* The line is always there, empty or not: letting it appear grew the form and nudged
          whatever sits beside it in a flex row the moment a confirmation arrived. */}
      <p
        role={error ? 'alert' : 'status'}
        aria-live="polite"
        className="min-h-5 text-[13px] leading-5 text-muted"
      >
        {error ??
          (state !== 'idle'
            ? state === 'saving'
              ? t.ui.instantForm.syncing(confirmation)
              : confirmation
            : '')}
      </p>
    </form>
  )
}
