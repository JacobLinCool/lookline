'use client'

import { DiscoveryHome } from '@/components/discovery/home'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Button, Container, Notice, Section, SkeletonCard, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import { afterPaint, LATENCY, startInteraction, type InteractionTrace } from '@/lib/latency'
import { readIntentStream } from '@/lib/intent-stream'
import { SHOP_REQUEST_TIMEOUT_MS } from '@/lib/shop-timeouts'
import type { Recommendation, Understanding } from '@/server/intent'
import { IntentCard, IntentTagsRow } from './intent-card'
import { ItemsSection } from './items-section'
import { OutfitsSection } from './outfits-section'
import { SayItForm } from './say-it-form'
import { intentHref, type IntentQuery } from './urls'

type Result = { understanding: Understanding; recommendation: Recommendation }

export function IntentWorkspace({
  initialQuery,
  signedIn,
  engineView = false,
}: {
  initialQuery: IntentQuery
  signedIn: boolean
  engineView?: boolean
}) {
  const { t } = useI18n()
  const initialKey = JSON.stringify(initialQuery)
  const activeQuery = useRef('')
  const [query, setQuery] = useState(initialQuery)
  const [understanding, setUnderstanding] = useState<Understanding | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [refinement, setRefinement] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [late, setLate] = useState(false)
  const request = useRef<AbortController | null>(null)
  const trace = useRef<InteractionTrace | null>(null)

  const run = useCallback(
    async (next: IntentQuery, push = true) => {
      request.current?.abort()
      trace.current?.mark('cancelled')
      const controller = new AbortController()
      request.current = controller
      const timing = startInteraction('generative', 'intent')
      trace.current = timing
      activeQuery.current = JSON.stringify(next)
      setQuery(next)
      setUnderstanding(null)
      setResult(null)
      setRefinement(null)
      setError(null)
      setLate(false)
      setBusy(true)
      if (push) window.history.pushState(null, '', intentHref(next))
      afterPaint(() => {
        if (!controller.signal.aborted) timing.mark('acknowledged')
      })
      let usable = false
      const deadline = setTimeout(() => {
        if (!usable) setLate(true)
      }, LATENCY.usable)
      // No request may leave the editor permanently busy if a transport stops producing bytes.
      const stop = setTimeout(
        () => controller.abort(new Error('Timed out.')),
        SHOP_REQUEST_TIMEOUT_MS,
      )
      try {
        const response = await fetch('/api/intent/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
          signal: controller.signal,
        })
        await readIntentStream(response, (event) => {
          if (controller.signal.aborted) return
          if (event.type === 'understood') {
            setUnderstanding(event.understanding)
            afterPaint(() => {
              if (!controller.signal.aborted) timing.mark('progress')
            })
          } else if (event.type === 'result') {
            setResult(event)
            usable = event.recommendation.result.ok
            setLate(!usable)
            afterPaint(() => {
              if (!controller.signal.aborted && usable) timing.mark('usable')
            })
          } else if (event.type === 'refinement') {
            setRefinement(event)
            afterPaint(() => {
              if (!controller.signal.aborted) timing.mark('progress')
            })
          } else if (event.type === 'error' && !usable) {
            setError(t.home.status.loadFailed)
          }
        })
        afterPaint(() => {
          if (!controller.signal.aborted) timing.mark(usable ? 'final' : 'failed')
        })
      } catch {
        if (request.current !== controller) return
        // A failed optional refinement must not label already usable results as a failure.
        if (!usable) setError(t.home.items.failed)
        timing.mark(usable ? 'final' : 'failed')
      } finally {
        clearTimeout(deadline)
        clearTimeout(stop)
        if (request.current === controller) setBusy(false)
      }
    },
    [t],
  )

  useEffect(() => {
    const initial = JSON.parse(initialKey) as IntentQuery
    if (
      initial.q &&
      (activeQuery.current !== initialKey || !request.current || request.current.signal.aborted)
    )
      void run(initial, false)
  }, [initialKey, run])

  useEffect(() => {
    const pop = () => {
      const params = new URLSearchParams(window.location.search)
      const next = {
        q: params.get('q') ?? '',
        clarify: params.getAll('clarify'),
        previous: params.get('previous'),
      }
      if (next.q) void run(next, false)
      else {
        request.current?.abort()
        request.current = null
        setQuery(next)
        setUnderstanding(null)
        setResult(null)
        setRefinement(null)
        setBusy(false)
      }
    }
    window.addEventListener('popstate', pop)
    return () => {
      request.current?.abort()
      request.current = null
      trace.current?.mark('cancelled')
      window.removeEventListener('popstate', pop)
    }
  }, [run])

  function followClarification(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const url = new URL(anchor.href)
    if (url.origin !== window.location.origin || url.pathname !== '/' || !url.searchParams.has('q'))
      return
    event.preventDefault()
    event.stopPropagation()
    void run({
      q: url.searchParams.get('q')!,
      clarify: url.searchParams.getAll('clarify'),
      previous: url.searchParams.get('previous'),
    })
  }

  const active = result?.understanding ?? understanding
  const ready = result?.recommendation.result.ok ? result.recommendation.result : null
  const showOutfits =
    result?.understanding.parse.ok && result.understanding.parse.intent.mode !== 'single'

  if (!query.q) {
    return (
      <Container className="pb-24">
        <section className="flex flex-col gap-5 pt-6 md:pt-16">
          <h1 className="display text-[28px] md:text-[40px]">{t.home.hero.title}</h1>
          <SayItForm key="hero" q="" onQuery={(q) => void run({ q })} />
        </section>

        <DiscoveryHome signedIn={signedIn} />
      </Container>
    )
  }

  return (
    <Container className="pb-24">
      <div onClickCapture={followClarification} className="flex flex-col gap-5 pt-6 md:pt-8">
        <SayItForm key={query.q} q={query.q} compact onQuery={(q) => void run({ q })} />
        {busy ? <div className="progress-line" aria-hidden /> : null}

        <p role="status" aria-live="polite" className={busy ? 'text-[13px] text-muted' : 'sr-only'}>
          {busy ? t.home.status.finding : ready ? t.home.status.ready(ready.items.length) : ''}
        </p>

        {active?.parse.ok ? <IntentTagsRow understanding={active} query={query} /> : null}

        {late && !ready ? (
          <Notice
            tone="warning"
            action={
              <Button onClick={() => void run(query, false)} size="sm" variant="secondary">
                {t.common.retry}
              </Button>
            }
          >
            {t.home.status.stillLooking}
          </Notice>
        ) : null}
        {error ? (
          <Notice
            tone="warning"
            action={
              <Button onClick={() => void run(query, false)} size="sm" variant="secondary">
                {t.common.retry}
              </Button>
            }
          >
            {error}
          </Notice>
        ) : null}

        {refinement ? (
          <div className="flex items-center gap-3">
            <Tag tone="ink" size="md">
              {t.home.refinement.label}
            </Tag>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setResult(refinement)
                setUnderstanding(refinement.understanding)
                setRefinement(null)
              }}
            >
              {t.home.refinement.show}
            </Button>
          </div>
        ) : null}

        {result ? (
          <>
            {showOutfits ? (
              <OutfitsSection {...result} query={query} engineView={engineView} />
            ) : null}
            <ItemsSection {...result} signedIn={signedIn} engineView={engineView} />
            {engineView ? (
              <Section title={t.home.engine.sectionTitle}>
                <IntentCard understanding={result.understanding} />
              </Section>
            ) : null}
          </>
        ) : busy ? (
          <ul
            className="grid grid-cols-2 gap-x-4 gap-y-8 pt-4 md:grid-cols-3 lg:grid-cols-4"
            aria-hidden
          >
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <SkeletonCard />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Container>
  )
}
