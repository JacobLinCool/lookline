'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Notice, Select } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import { afterPaint, startInteraction, type InteractionTrace } from '@/lib/latency'

export interface EditionState {
  id: string
  status: 'pending' | 'ready' | 'failed'
  provider: string | null
  generationId: string | null
  startedAt: string | null
  error: string | null
  imageUrl: string
}

/**
 * The Look image. While a render runs, a thin progress line sits under the image and the owner's
 * button reads "Rendering…"; the previous visual stays until the new one has decoded.
 */
export function EditionCanvas({
  initial,
  title,
  isOwner,
  stylePreset,
  presets,
}: {
  initial: EditionState
  title: string
  isOwner: boolean
  stylePreset: string
  presets: { value: string; label: string }[]
}) {
  const { t } = useI18n()
  const [state, setState] = useState(initial)
  const [preset, setPreset] = useState(stylePreset)
  const [requesting, setRequesting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [displayedUrl, setDisplayedUrl] = useState(initial.imageUrl)
  const trace = useRef<InteractionTrace | null>(null)
  const displayed = useRef(initial.imageUrl)
  const mutation = useRef(false)
  const pollRevision = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      trace.current?.mark('cancelled')
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'pending') return
    const controller = new AbortController()
    const generationId = state.generationId
    const revision = ++pollRevision.current
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const response = await fetch(`/api/looks/${state.id}/generate`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4_000)]),
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(t.looks.canvas.checkFailed)
        const next = (await response.json()) as EditionState
        if (controller.signal.aborted || revision !== pollRevision.current) return
        setProblem(null)
        setState(next)
        if (next.generationId && next.generationId !== generationId)
          trace.current?.mark('cancelled')
        if (next.status === 'failed') trace.current?.mark('failed')
        if (next.status === 'pending') timer = setTimeout(poll, 600)
      } catch (error) {
        if (!controller.signal.aborted) {
          setProblem(error instanceof Error ? error.message : t.looks.canvas.checkFailed)
          timer = setTimeout(poll, 1_000)
        }
      }
    }
    timer = setTimeout(poll, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [state.status, state.generationId, state.id, t])

  // Decode off-screen, then replace the existing visual in one paint.
  useEffect(() => {
    if (state.imageUrl === displayed.current) return
    let active = true
    const image = new Image()
    image.src = state.imageUrl
    void image
      .decode()
      .then(() => {
        if (!active) return
        displayed.current = state.imageUrl
        setDisplayedUrl(state.imageUrl)
        afterPaint(() => {
          if (active) trace.current?.mark(state.status === 'ready' ? 'final' : 'visual')
        })
      })
      .catch(() => {
        if (active) setProblem(t.looks.canvas.imageLoadFailed)
      })
    return () => {
      active = false
    }
  }, [state.imageUrl, state.status, t])

  async function render() {
    if (mutation.current) return
    mutation.current = true
    trace.current?.mark('cancelled')
    trace.current = startInteraction('creative', 'edition-render')
    setRequesting(true)
    setProblem(null)
    afterPaint(() => {
      trace.current?.mark('acknowledged')
      trace.current?.mark('visual')
      trace.current?.mark('usable')
    })
    try {
      const response = await fetch(`/api/looks/${state.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylePreset: preset }),
        signal: AbortSignal.timeout(5_000),
      })
      const next = (await response.json()) as EditionState & { error?: string }
      if (!response.ok) throw new Error(next.error ?? t.looks.canvas.renderFailed)
      if (mounted.current) setState(next)
    } catch (error) {
      if (mounted.current)
        setProblem(error instanceof Error ? error.message : t.looks.canvas.renderFailed)
      trace.current?.mark('failed')
    } finally {
      mutation.current = false
      if (mounted.current) setRequesting(false)
    }
  }

  async function cancel() {
    if (mutation.current || !state.generationId) return
    mutation.current = true
    try {
      const response = await fetch(`/api/looks/${state.id}/generate`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: state.generationId }),
        signal: AbortSignal.timeout(5_000),
      })
      if (!response.ok) throw new Error(t.looks.canvas.cancelFailed)
      ++pollRevision.current
      if (mounted.current) setState((await response.json()) as EditionState)
      trace.current?.mark('cancelled')
    } catch (error) {
      if (mounted.current)
        setProblem(error instanceof Error ? error.message : t.looks.canvas.cancelFailed)
    } finally {
      mutation.current = false
    }
  }

  const rendering = state.status === 'pending' || requesting
  return (
    <figure className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-md bg-mist">
        <div className="aspect-3/4">
          <img
            src={displayedUrl}
            alt={title}
            width={600}
            height={800}
            className="size-full object-cover"
          />
        </div>
        {rendering ? (
          <div aria-hidden className="progress-line absolute inset-x-0 bottom-0" />
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {rendering
          ? t.looks.canvas.renderingStatus
          : state.status === 'ready'
            ? t.looks.canvas.ready
            : ''}
      </p>
      {problem || state.error ? (
        <Notice tone="warning">{problem ?? t.looks.canvas.imageUnavailable}</Notice>
      ) : null}
      {isOwner ? (
        <div className="flex items-center gap-2">
          <Select
            aria-label={t.looks.canvas.imageStyle}
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
            options={presets}
            className="h-9 flex-1 text-[13px]"
            disabled={rendering}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void render()}
            disabled={rendering}
            aria-busy={rendering}
          >
            {rendering
              ? t.looks.canvas.rendering
              : state.status === 'failed'
                ? t.common.retry
                : t.looks.canvas.render}
          </Button>
          {state.status === 'pending' ? (
            <Button variant="ghost" size="sm" onClick={() => void cancel()}>
              {t.common.cancel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </figure>
  )
}
