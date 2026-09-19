'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Languages, Mic, Square, X } from 'lucide-react'
import type { FilterDecision, ProductSearch, ProductSearchResult } from '@lookline/engine'
import { isFilterHintId, openingHints, type FilterHintId } from '@lookline/engine/hints'
import { Button, EmptyState, Input, Notice, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/client'
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
import { HintRow } from './hint-row'
import { nextHint, withChoice, type HintChoice } from './hints'
import { Pagination } from './pagination'
import { ProductGrid } from './product-grid'
import { searchFromParams, searchToParams, shopHref, SHOP_SORTS } from './query'

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
  const { t, locale } = useI18n()
  const [search, setSearch] = useState(initialSearch)
  const [result, setResult] = useState(initialResult)
  const [resultKey, setResultKey] = useState(keyOf(initialSearch))
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState(false)
  const [hints, setHints] = useState<FilterHintId[]>(() => openingHints(initialSearch))
  const [skipped, setSkipped] = useState<ReadonlySet<FilterHintId>>(() => new Set())
  const [focused, setFocused] = useState(false)
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
  const field = useRef<HTMLInputElement>(null)
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

  function resetHints(next: ProductSearch) {
    setHints(openingHints(next))
    setSkipped(new Set())
  }

  /** An answer becomes the sentence's next clause; Jev reads the whole sentence again. */
  function choose(choice: HintChoice) {
    if (voicePhase !== 'idle') stopVoice()
    const next = withChoice(draftValue.current, choice)
    input(next)
    const element = field.current
    if (!element) return
    element.focus()
    afterPaint(() => element.setSelectionRange(next.length, next.length))
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
      const response = await fetch(`/api/products/search?${searchToParams(next)}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(t.shop.sentence.refreshFailed)
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
        setError(cause instanceof Error ? cause.message : t.shop.sentence.refreshFailedShort)
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
      if (!response.ok) throw new Error(data.error ?? t.shop.sentence.resolveFailed)
      if (data.revision !== revision || !data.filters || !Array.isArray(data.unresolved))
        throw new Error(t.shop.sentence.unverified)
      const next = applyLiveFilters(job.base, data.filters)
      setSearch(next)
      setHints(Array.isArray(data.hints) ? data.hints.filter(isFilterHintId) : [])
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
        setError(cause instanceof Error ? cause.message : t.shop.sentence.resolveFailed)
    } finally {
      if (queue.isCurrent(revision) && mounted.current) setDeciding(false)
    }
  }

  function input(text: string, final = false) {
    if (text.length > 500) {
      queue.cancel()
      stopVoice()
      setDeciding(false)
      setError(t.shop.sentence.tooLong)
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
    resetHints(committed.current)
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
    resetHints(next)
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
    resetHints(committed.current)
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
      locale,
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
  const hint = available && (editing || focused) ? nextHint(hints, skipped) : undefined
  const languageLabel = VOICE_LANGUAGES.filter((language) => voiceLanguages.includes(language.code))
    .map((language) => language.label)
    .join(' + ')
  const phaseText =
    voicePhase === 'listening'
      ? t.shop.sentence.listening
      : voicePhase === 'connecting'
        ? t.shop.sentence.connecting
        : voicePhase === 'finishing'
          ? t.shop.sentence.finishing
          : deciding
            ? t.shop.sentence.reading
            : ''

  return (
    <div onClickCapture={captureLink} className="flex flex-col gap-4 pt-5 md:pt-7">
      <form
        aria-label={t.shop.sentence.label}
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
              aria-label={t.shop.sentence.field}
              value={draft}
              maxLength={500}
              autoComplete="off"
              placeholder={t.shop.sentence.placeholder}
              className={cn(styles.liveInput, 'pr-24')}
              ref={field}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
              aria-label={t.shop.sentence.field}
              disabled
              placeholder={t.shop.sentence.unavailable}
              className={cn(styles.liveInput, 'pr-24')}
            />
          ) : (
            <Link
              href="/login?next=%2Fshop"
              className="flex h-10 w-full items-center rounded-sm border border-line bg-card px-3 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              {t.shop.sentence.signIn}
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
                aria-label={t.shop.sentence.speak}
                title={t.shop.sentence.speak}
              >
                <Mic />
              </button>
            ) : (
              <button
                type="button"
                className={cn(iconButton, 'text-accent')}
                onClick={() => void voice.current?.stop()}
                aria-label={t.shop.sentence.stop}
                title={t.shop.sentence.stop}
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
                  aria-label={t.shop.sentence.languagesOf(languageLabel)}
                  title={t.shop.sentence.languagesOf(languageLabel)}
                >
                  <Languages />
                </summary>
                <fieldset
                  className="absolute top-full right-0 z-20 mt-1 flex w-52 flex-col gap-2 rounded-md border border-line bg-card p-3 text-[13px] shadow-lift"
                  disabled={voicePhase !== 'idle'}
                >
                  <legend className="sr-only">{t.shop.sentence.languages}</legend>
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
              {t.common.apply}
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label={t.common.clear}
              onClick={discard}
              icon={<X />}
            />
          </>
        ) : null}
      </form>

      {hint ? (
        <HintRow
          id={hint}
          onChoose={choose}
          onSkip={() => setSkipped((previous) => new Set(previous).add(hint))}
        />
      ) : null}
      {preview && !deciding ? (
        <div className="flex items-center gap-2">
          <Tag tone="ink" size="md">
            {t.common.preview}
          </Tag>
          <Button size="sm" onClick={() => manual(search)}>
            {t.common.apply}
          </Button>
          <Button size="sm" variant="ghost" onClick={discard}>
            {t.common.discard}
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
              {t.common.retry}
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
          {t.shop.filters.sort}
          <select
            aria-label={t.shop.filters.sortField}
            value={search.sort ?? 'relevance'}
            onChange={(event) =>
              manual({ ...search, sort: event.target.value as ProductSearch['sort'], page: 1 })
            }
          >
            {SHOP_SORTS.map((option) => (
              <option key={option} value={option}>
                {t.shop.sort[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-[13rem_1fr] md:gap-8">
        <aside className="md:sticky md:top-20 md:self-start">
          <FilterDisclosure className="md:hidden" label={t.shop.filters.label}>
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
                ? t.common.updating
                : t.shop.results.previous
              : result
                ? preview
                  ? t.shop.results.withPreview(t.common.count.pieces(result.total))
                  : t.common.count.pieces(result.total)
                : t.shop.results.unavailable}
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
              title={t.shop.results.emptyTitle}
              description={t.shop.results.emptyDescription}
            />
          )}
        </div>
      </div>
    </div>
  )
}
