'use client'

import { useRef, useState, useTransition } from 'react'
import { Heart, X } from 'lucide-react'
import type { Explanation } from '@lookline/engine'
import { FactorBreakdown, ProductCard, Tag, type ProductCardData } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import { afterPaint, startInteraction } from '@/lib/latency'
import { cn } from '@/lib/cn'
import { GENERIC_FACTORS, reasonLine } from '@/lib/reason'
import { sendFeedbackAction } from '@/server/actions/feedback'

export interface RankedItemCardProps {
  product: ProductCardData
  href: string
  score: number
  explanation: Explanation
  position: number
  sessionId: string
  signedIn: boolean
  engineView?: boolean
  priority?: boolean
}

type Verdict = 'none' | 'saved' | 'dismissed'

const iconButton =
  'inline-flex size-8 items-center justify-center rounded-full border border-line bg-card/95 text-ink shadow-none transition-colors hover:border-ink disabled:opacity-40 [&_svg]:size-4'

/**
 * A recommended piece: the card, one plain reason, and two quiet controls over the artwork —
 * save (heart) and not for me (×) — sent optimistically as feedback.
 */
export function RankedItemCard({
  product,
  href,
  score,
  explanation,
  position,
  sessionId,
  signedIn,
  engineView = false,
  priority,
}: RankedItemCardProps) {
  const { t, locale } = useI18n()
  const copy = t.home.items
  const saving = useRef(false)
  const [verdict, setVerdict] = useState<Verdict>('none')
  const [hint, setHint] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function send(next: Exclude<Verdict, 'none'>) {
    if (saving.current) return
    if (!signedIn) {
      setHint(copy.signInToSave)
      return
    }
    saving.current = true
    const trace = startInteraction('instant', 'product-feedback')
    const previous = verdict
    setVerdict(next)
    setHint(null)
    afterPaint(() => {
      trace.mark('acknowledged')
      trace.mark('usable')
    })
    startTransition(async () => {
      try {
        const result = await sendFeedbackAction({
          kind: next === 'saved' ? 'save' : 'dismiss',
          productId: product.id,
          position,
          intentSessionId: sessionId,
        })
        if (result.ok) {
          trace.mark('final')
          return
        }
        setVerdict(previous)
        setHint(result.reason === 'anonymous' ? copy.signInToSave : copy.notSaved)
        trace.mark('failed')
      } catch {
        setVerdict(previous)
        setHint(copy.notSaved)
        trace.mark('failed')
      } finally {
        saving.current = false
      }
    })
  }

  const overlay = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => send('saved')}
        disabled={pending}
        aria-pressed={verdict === 'saved'}
        aria-label={verdict === 'saved' ? copy.saved : copy.save}
        className={cn(iconButton, verdict === 'saved' && 'border-ink bg-ink text-paper')}
      >
        <Heart fill={verdict === 'saved' ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        onClick={() => send('dismissed')}
        disabled={pending}
        aria-pressed={verdict === 'dismissed'}
        aria-label={verdict === 'dismissed' ? copy.hidden : copy.notForMe}
        className={cn(iconButton, verdict === 'dismissed' && 'border-ink bg-ink text-paper')}
      >
        <X />
      </button>
    </div>
  )

  const footer =
    hint || engineView ? (
      <div className="flex flex-col gap-2">
        {hint ? (
          <p role="status" className="text-[12px] text-muted">
            {hint}
          </p>
        ) : null}
        {engineView ? (
          <details className="rounded-md bg-mist p-3 text-[12px]">
            <summary className="flex cursor-pointer items-center justify-between gap-2">
              <span className="text-muted">{t.home.engine.label}</span>
              <Tag tone="outline">{score.toFixed(2)}</Tag>
            </summary>
            <div className="mt-3">
              <FactorBreakdown explanation={explanation} showEvidence locale={locale} />
            </div>
          </details>
        ) : null}
      </div>
    ) : undefined

  return (
    <div className={cn('transition-opacity', verdict === 'dismissed' && 'opacity-40')}>
      <ProductCard
        product={product}
        href={href}
        priority={priority}
        overlay={overlay}
        reason={reasonLine(explanation, locale, 1, GENERIC_FACTORS) || undefined}
        footer={footer}
      />
    </div>
  )
}
