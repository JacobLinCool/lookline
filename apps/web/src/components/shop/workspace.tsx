'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Languages, Mic, Square, X } from 'lucide-react'
import type { FilterDecision, ProductSearch, ProductSearchResult } from '@lookline/engine'
import { Button, EmptyState, Input, Notice, Tag } from '@/components/ui'
import { cn } from '@/lib/cn'
import { afterPaint } from '@/lib/latency'
import { applyLiveFilters, LatestDecisionQueue, liveBase } from '@/lib/live-filters'
import { VoiceCapture, type VoicePhase } from '@/lib/voice'
import {
  DEFAULT_VOICE_LANGUAGES,
  VOICE_LANGUAGES,
  VOICE_LANGUAGES_STORAGE_KEY,
  isVoiceLanguageSelection,
  type VoiceLanguageCode,
} from '@/lib/voice-config'
import { ActiveFilters, DepartmentPills } from './active-filters'
import { FilterDisclosure } from './disclosure'
import styles from './filters.module.css'
import { FilterRail } from './filter-rail'
import { Pagination } from './pagination'
import { ProductGrid } from './product-grid'
import { searchFromParams, searchToParams, shopHref, SORT_OPTIONS } from './query'

type Job = { text: string; final: boolean; base: ProductSearch; started: number }
const keyOf = (search: ProductSearch) => searchToParams(search).toString()

const iconButton =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-mist hover:text-ink disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4'

export function ShopWorkspace({
  initialSearch,
  initialResult,
  initialError,
  signedIn,
  semanticAvailable,
  voiceAvailable,
}: {
  initialSearch: ProductSearch
  initialResult: ProductSearchResult | null
  initialError: string | null
  signedIn: boolean
  semanticAvailable: boolean
  voiceAvailable: boolean
}) {
  const [search, setSearch] = useState(initialSearch)
  const [result, setResult] = useState(initialResult)
  const [resultKey, setResultKey] = useState(keyOf(initialSearch))
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState(false)
  const [unresolved, setUnresolved] = useState<string[]>([])
  const [deciding, setDeciding] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')
  const [voiceLanguages, setVoiceLanguages] =
    useState<readonly VoiceLanguageCode[]>(DEFAULT_VOICE_LANGUAGES)
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(VOICE_LANGUAGES_STORAGE_KEY) ?? 'null')
      if (isVoiceLanguageSelection(saved)) setVoiceLanguages(saved)
    } catch {
      /* Storage is optional in private browsing. */
    }
  }, [])
  function toggleVoiceLanguage(code: VoiceLanguageCode) {
    if (voicePhase !== 'idle') return
    const next = voiceLanguages.includes(code)
      ? voiceLanguages.filter((value) => value !== code)
      : [...voiceLanguages, code]
    if (!next.length) return
    setVoiceLanguages(next)
    try {
      localStorage.setItem(VOICE_LANGUAGES_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* Keep the in-memory selection. */
    }
  }
  const committed = useRef(initialSearch)
  const base = useRef(initialSearch)
  const productsRequest = useRef<AbortController | null>(null)
  const voice = useRef<VoiceCapture | null>(null)
  const mounted = useRef(true)
  const handler = useRef<(job: Job, revision: number, signal: AbortSignal) => Promise<void>>(
    async () => {},
  )
  const queue = useMemo(
    () => new LatestDecisionQueue<Job>((...args) => handler.current(...args)),
    [],
  )
  const available = signedIn && semanticAvailable
  const draftValue = useRef('')
  const composing = useRef(false)

  function stopVoice() {
    const current = voice.current
    voice.current = null
    current?.cancel()
    setVoicePhase('idle')
  }

  async function loadProducts(
    next: ProductSearch,
    measured?: { job: Job; revision: number; decision: FilterDecision },
  ) {
    productsRequest.current?.abort()
    const controller = new AbortController()
    productsRequest.current = controller
    setLoading(true)
    try {
      const response = await fetch(`/api/articles/search?${searchToParams(next)}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error('Pieces could not refresh. Your previous results are still here.')
      if (controller.signal.aborted || !mounted.current) return
      setResult(data)
      setResultKey(keyOf(next))
      afterPaint(() => {
        if (measured && !controller.signal.aborted)
          window.dispatchEvent(
            new CustomEvent('lookline:filters', {
              detail: {
                revision: measured.revision,
                model: measured.decision.model,
                decisionMs: measured.decision.latencyMs,
                productsMs: performance.now() - measured.job.started,
                final: measured.job.final,
              },
            }),
          )
      })
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current)
        setError(cause instanceof Error ? cause.message : 'Pieces could not refresh.')
    } finally {
      if (productsRequest.current === controller && mounted.current) setLoading(false)
    }
  }

  function commit(next: ProductSearch, push = true) {
    committed.current = next
    setPreview(false)
    if (push && keyOf(next) !== new URLSearchParams(window.location.search).toString())
      window.history.pushState(null, '', shopHref(next, { page: next.page ?? 1 }))
  }

  handler.current = async (job, revision, signal) => {
    try {
      const response = await fetch('/api/filters/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: job.text, base: liveBase(job.base), revision }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]),
      })
      const data = (await response.json()) as FilterDecision & { revision: number; error?: string }
      if (!queue.isCurrent(revision) || signal.aborted || !mounted.current) return
      if (!response.ok) throw new Error(data.error ?? 'Filtering by sentence is unavailable.')
      if (data.revision !== revision || !data.filters || !Array.isArray(data.unresolved))
        throw new Error('The filter response could not be verified.')
      const next = applyLiveFilters(job.base, data.filters)
      setSearch(next)
      setUnresolved(data.unresolved)
      setPreview(true)
      setError(null)
      if (job.final && data.unresolved.length === 0) commit(next)
      afterPaint(() => {
        if (queue.isCurrent(revision))
          window.dispatchEvent(
            new CustomEvent('lookline:filters', {
              detail: {
                revision,
                model: data.model,
                filtersMs: performance.now() - job.started,
                decisionMs: data.latencyMs,
                final: job.final,
              },
            }),
          )
      })
      void loadProducts(next, { job, revision, decision: data })
    } catch (cause) {
      if (queue.isCurrent(revision) && !signal.aborted && mounted.current)
        setError(cause instanceof Error ? cause.message : 'Filtering by sentence is unavailable.')
    } finally {
      if (queue.isCurrent(revision) && mounted.current) setDeciding(false)
    }
  }

  function input(text: string, final = false) {
    if (text.length > 500) {
      queue.cancel()
      stopVoice()
      setDeciding(false)
      setError('That sentence is too long. Keep the preview or start a shorter one.')
      return
    }
    const value = text
    draftValue.current = value
    setDraft(value)
    // A newer utterance invalidates any query started for an older preview.
    productsRequest.current?.abort()
    setLoading(false)
    if (!value.trim()) {
      discard()
      return
    }
    setDeciding(true)
    queue.push({ text: value, final, base: base.current, started: performance.now() }, final)
  }

  function discard() {
    queue.cancel()
    stopVoice()
    draftValue.current = ''
    setDraft('')
    setDeciding(false)
    setUnresolved([])
    setPreview(false)
    setError(null)
    base.current = committed.current
    setSearch(committed.current)
    void loadProducts(committed.current)
  }

  function manual(next: ProductSearch, push = true) {
    queue.cancel()
    stopVoice()
    base.current = next
    draftValue.current = ''
    setDraft('')
    setUnresolved([])
    setDeciding(false)
    setSearch(next)
    setError(null)
    commit(next, push)
    void loadProducts(next)
  }

  function captureLink(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const url = new URL(anchor.href)
    if (url.origin !== window.location.origin || url.pathname !== '/shop') return
    event.preventDefault()
    event.stopPropagation()
    manual(searchFromParams(url.searchParams))
  }

  function startVoice() {
    queue.cancel()
    setDeciding(false)
    setUnresolved([])
    void loadProducts(committed.current)
    base.current = committed.current
    setSearch(committed.current)
    setPreview(false)
    setError(null)
    setDraft('')
    draftValue.current = ''
    const session = new VoiceCapture(
      {
        phase: (phase) => {
          if (mounted.current && voice.current === session) setVoicePhase(phase)
        },
        transcript: (text, final) => {
          if (mounted.current && voice.current === session) input(text, final)
        },
        error: (message) => {
          if (mounted.current && voice.current === session) setError(message)
        },
      },
      voiceLanguages,
    )
    voice.current = session
    void session.start()
  }

  const initialKey = keyOf(initialSearch)
  useEffect(() => {
    if (keyOf(committed.current) !== initialKey) manual(initialSearch, false)
    // A navigation from outside the workspace supplies a new initial search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])
  useEffect(() => {
    mounted.current = true
    const pop = () => manual(searchFromParams(new URLSearchParams(window.location.search)), false)
    window.addEventListener('popstate', pop)
    return () => {
      mounted.current = false
      queue.cancel()
      voice.current?.cancel()
      productsRequest.current?.abort()
      window.removeEventListener('popstate', pop)
    }
    // Methods use refs for committed state; the listener lives for this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  const stale = resultKey !== keyOf(search)
  const editing = draft.length > 0 || voicePhase !== 'idle'
  const languageLabel = VOICE_LANGUAGES.filter((language) => voiceLanguages.includes(language.code))
    .map((language) => language.label)
    .join(' + ')
  const phaseText =
    voicePhase === 'listening'
      ? 'Listening'
      : voicePhase === 'connecting'
        ? 'Connecting…'
        : voicePhase === 'finishing'
          ? 'Finishing…'
          : deciding
            ? 'Reading…'
            : ''

  return (
    <div onClickCapture={captureLink} className="flex flex-col gap-4 pt-5 md:pt-7">
      <form
        aria-label="Filter by sentence"
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (available) input(draftValue.current, true)
        }}
      >
        <div className="relative min-w-0 flex-1">
          {available ? (
            <Input
              id="live-filter-input"
              aria-label="Describe what you are looking for"
              value={draft}
              maxLength={500}
              autoComplete="off"
              placeholder="黑色或海軍藍外套，三千以內，不要紅色…"
              className={cn(styles.liveInput, 'pr-24')}
              onChange={(event) => {
                if (voicePhase !== 'idle') stopVoice()
                if (composing.current) {
                  draftValue.current = event.target.value
                  setDraft(event.target.value)
                  return
                }
                input(event.target.value)
              }}
              onCompositionStart={() => {
                composing.current = true
                queue.cancel()
                setDeciding(false)
              }}
              onCompositionEnd={(event) => {
                composing.current = false
                input(event.currentTarget.value)
              }}
            />
          ) : signedIn ? (
            <Input
              id="live-filter-input"
              aria-label="Describe what you are looking for"
              disabled
              placeholder="Filtering by sentence is unavailable right now"
              className={cn(styles.liveInput, 'pr-24')}
            />
          ) : (
            <Link
              href="/login?next=%2Fshop"
              className="flex h-10 w-full items-center rounded-sm border border-line bg-card px-3 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              Sign in to filter by sentence
            </Link>
          )}
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            <span
              role="status"
              className={cn(
                'text-[12px]',
                voicePhase === 'listening' ? 'text-accent' : 'text-muted',
              )}
            >
              {phaseText}
            </span>
            {voicePhase === 'idle' ? (
              <button
                type="button"
                className={iconButton}
                disabled={!available || !voiceAvailable}
                onClick={startVoice}
                aria-label="Speak"
                title="Speak"
              >
                <Mic />
              </button>
            ) : (
              <button
                type="button"
                className={cn(iconButton, 'text-accent')}
                onClick={() => void voice.current?.stop()}
                aria-label="Stop"
                title="Stop"
              >
                <Square />
              </button>
            )}
            {available && voiceAvailable ? (
              <details className="relative">
                <summary
                  className={cn(
                    iconButton,
                    'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
                  )}
                  aria-label={`Voice languages: ${languageLabel}`}
                  title={`Voice languages: ${languageLabel}`}
                >
                  <Languages />
                </summary>
                <fieldset
                  className="absolute top-full right-0 z-20 mt-1 flex w-52 flex-col gap-2 rounded-md border border-line bg-card p-3 text-[13px] shadow-lift"
                  disabled={voicePhase !== 'idle'}
                >
                  <legend className="sr-only">Voice languages</legend>
                  {VOICE_LANGUAGES.map((language) => (
                    <label key={language.code} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-ink"
                        checked={voiceLanguages.includes(language.code)}
                        disabled={
                          voiceLanguages.length === 1 && voiceLanguages.includes(language.code)
                        }
                        onChange={() => toggleVoiceLanguage(language.code)}
                      />
                      {language.label}
                    </label>
                  ))}
                </fieldset>
              </details>
            ) : null}
          </div>
        </div>
        {editing ? (
          <>
            <Button type="submit" disabled={!available || !draft.trim() || voicePhase !== 'idle'}>
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label="Clear"
              onClick={discard}
              icon={<X />}
            />
          </>
        ) : null}
      </form>

      {unresolved.length > 0 ? (
        <p className="text-[13px] text-muted">Not understood: {unresolved.join(', ')}.</p>
      ) : null}
      {preview && !deciding ? (
        <div className="flex items-center gap-2">
          <Tag tone="ink" size="md">
            Preview
          </Tag>
          <Button size="sm" onClick={() => manual(search)}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={discard}>
            Discard
          </Button>
        </div>
      ) : null}
      {error ? (
        <Notice
          tone="warning"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                draft.trim() && available ? input(draft, false) : void loadProducts(search)
              }
            >
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <DepartmentPills search={search} />
        <ActiveFilters search={search} />
        <label className={cn(styles.sort, 'ml-auto')}>
          Sort
          <select
            aria-label="Sort articles"
            value={search.sort ?? 'relevance'}
            onChange={(event) =>
              manual({ ...search, sort: event.target.value as ProductSearch['sort'], page: 1 })
            }
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-[13rem_1fr] md:gap-8">
        <aside className="md:sticky md:top-20 md:self-start">
          <FilterDisclosure className="md:hidden" label="Filters">
            <FilterRail search={search} facets={stale ? undefined : result?.facets} />
          </FilterDisclosure>
          <div className="hidden md:block">
            <FilterRail search={search} facets={stale ? undefined : result?.facets} />
          </div>
        </aside>
        <div className={styles.results} aria-busy={loading} data-shop-results>
          <p role="status" className={styles.resultsStatus}>
            {stale
              ? loading
                ? 'Updating…'
                : 'Previous results'
              : result
                ? `${result.total.toLocaleString()} pieces${preview ? ' · preview' : ''}`
                : 'Pieces unavailable'}
          </p>
          {result?.items.length ? (
            <>
              <ProductGrid items={result.items} />
              {!stale && (
                <div className="mt-10">
                  <Pagination
                    search={search}
                    total={result.total}
                    page={result.page}
                    pageSize={result.pageSize}
                  />
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title="No pieces match."
              description="Try another colour, a wider category or a higher price."
            />
          )}
        </div>
      </div>
    </div>
  )
}
