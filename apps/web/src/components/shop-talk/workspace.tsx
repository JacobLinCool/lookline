'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ProductSearch, ProductSearchResult } from '@lookline/engine'
import { conversationSchema, type ConversationEvent } from '@lookline/engine/conversation'
import { Button, EmptyState, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import { liveBase } from '@/lib/live-filters'
import { TalkConversation } from '@/lib/talk-conversation'
import { ShopTalkLive, type TalkImage, type TalkPhase } from '@/lib/shop-talk-live'
import { TalkSearch, talkSearchKey } from '@/lib/talk-search'
import { ActiveFilters, DepartmentPills } from '../shop/active-filters'
import { FilterRail } from '../shop/filter-rail'
import { FilterDisclosure } from '../shop/disclosure'
import { ShopPathProvider } from '../shop/path'
import { Pagination } from '../shop/pagination'
import { ProductGrid } from '../shop/product-grid'
import { searchFromParams, searchToParams, SHOP_SORTS } from '../shop/query'
import { TalkChat } from './chat'
import styles from './talk.module.css'

export function ShopTalkWorkspace({
  initialSearch,
  initialResult,
  initialError,
  signedIn,
  available,
}: {
  initialSearch: ProductSearch
  initialResult: ProductSearchResult | null
  initialError: string | null
  signedIn: boolean
  available: boolean
}) {
  const { t } = useI18n()
  const copy = t.shopTalk
  const [search, setSearch] = useState(initialSearch)
  const [result, setResult] = useState(initialResult)
  const [resultKey, setResultKey] = useState(talkSearchKey(initialSearch))
  const [events, setEvents] = useState<ConversationEvent[]>([])
  const [phase, setPhase] = useState<TalkPhase>('idle')
  const [microphone, setMicrophone] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [chatError, setChatError] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const stopped = useRef(false)
  const changed = useRef<(final: boolean) => void>(() => {})
  const [history, setHistory] = useState(
    () => new TalkConversation((final) => changed.current(final)),
  )
  const [engine] = useState(
    () =>
      new TalkSearch(initialSearch, {
        search: (next) => {
          if (!mounted.current) return
          setSearch(next)
          const qs = searchToParams(next).toString()
          window.history.replaceState(null, '', qs ? `/shop-talk?${qs}` : '/shop-talk')
        },
        result: (next, key) => {
          if (mounted.current) {
            setResult(next)
            setResultKey(key)
          }
        },
        busy: (value) => {
          if (mounted.current) setBusy(value)
        },
        error: (key) => {
          if (mounted.current) {
            setError(key ? copy[key] : null)
            if (key === 'full') {
              stopped.current = true
              setFull(true)
              setChatError(copy.full)
              engine.stop()
              live.current?.close()
            }
          }
        },
      }),
  )
  const live = useRef<ShopTalkLive | null>(null)
  const currentHistory = useRef(history)
  currentHistory.current = history
  function connection() {
    live.current ??= new ShopTalkLive(currentHistory.current, liveBase(engine.current), {
      phase: (value) => {
        if (mounted.current) setPhase(value)
      },
      microphone: (value) => {
        if (mounted.current) setMicrophone(value)
      },
      speaker: (value) => {
        if (mounted.current) setSpeaker(value)
      },
      speaking: (value) => {
        if (mounted.current) setSpeaking(value)
      },
      error: (key) => {
        if (mounted.current) setChatError(copy[key])
      },
    })
    return live.current
  }
  changed.current = (final) => {
    if (!mounted.current) return
    const conversation = currentHistory.current
    setEvents([...conversation.events])
    if (stopped.current) return
    if (!conversation.validate()) {
      stopped.current = true
      setFull(true)
      setChatError(copy.full)
      engine.stop()
      live.current?.close()
      return
    }
    engine.update(conversation.events, final)
  }
  function manual(next: ProductSearch) {
    const before = liveBase(engine.current)
    const keywords =
      JSON.stringify(next.keywords ?? []) === JSON.stringify(engine.current.keywords ?? [])
        ? undefined
        : (next.keywords ?? [])
    engine.manual(next)
    try {
      const event = currentHistory.current.edit(before, liveBase(next), keywords)
      if (event) live.current?.context(event)
    } catch {
      setFull(true)
      setChatError(copy.full)
      stop()
    }
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
    if (url.origin !== location.origin || url.pathname !== '/shop-talk') return
    event.preventDefault()
    event.stopPropagation()
    manual(searchFromParams(url.searchParams))
  }
  function stop() {
    stopped.current = true
    engine.stop()
    live.current?.close()
  }
  function restart() {
    stop()
    live.current = null
    const next = new TalkConversation((final) => changed.current(final))
    currentHistory.current = next
    setHistory(next)
    setEvents([])
    engine.reset()
    stopped.current = false
    setFull(false)
    setPhase('idle')
    setChatError(null)
    setError(null)
  }
  async function send(text: string, image?: TalkImage) {
    if (
      !conversationSchema.safeParse([
        ...history.events,
        { kind: 'message', id: 'pending', role: 'user', text, status: 'complete' },
      ]).success
    ) {
      setChatError(copy.full)
      return false
    }
    setChatError(null)
    stopped.current = false
    try {
      await connection().send(text, image)
      return true
    } catch {
      setChatError(history.validate() ? copy.connectionError : copy.full)
      return false
    }
  }
  function startVoice() {
    stopped.current = false
    setChatError(null)
    const session = connection()
    void session.setSpeaker(true)
    void session.setMicrophone(true)
  }
  useEffect(() => {
    mounted.current = true
    const pop = () => manual(searchFromParams(new URLSearchParams(location.search)))
    window.addEventListener('popstate', pop)
    return () => {
      mounted.current = false
      stopped.current = true
      engine.stop()
      live.current?.close()
      window.removeEventListener('popstate', pop)
    }
    // Mutable controllers own the current state; navigation must not recreate them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])
  useEffect(() => {
    // Mobile keyboards can shrink the visual viewport without changing CSS viewport units.
    const visual = window.visualViewport
    const update = () => {
      const height = visual?.height ?? window.innerHeight
      const bottom = Math.max(0, window.innerHeight - height - (visual?.offsetTop ?? 0))
      const tabs = document.querySelector('[data-mobile-tabbar]')?.getBoundingClientRect()
      const visibleBottom = height + (visual?.offsetTop ?? 0)
      const visibleTabs = tabs?.width
        ? Math.max(0, Math.min(tabs.height, visibleBottom - tabs.top))
        : 0
      viewport.current?.style.setProperty('--talk-visible-tabs', `${visibleTabs}px`)
      viewport.current?.setAttribute('data-compact-height', String(height <= 500))
      viewport.current?.style.setProperty('--talk-viewport-height', `${height}px`)
      viewport.current?.style.setProperty('--talk-viewport-bottom', `${bottom}px`)
    }
    update()
    window.addEventListener('resize', update)
    visual?.addEventListener('resize', update)
    visual?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      visual?.removeEventListener('resize', update)
      visual?.removeEventListener('scroll', update)
    }
  }, [])
  const stale = resultKey !== talkSearchKey(search)
  return (
    <ShopPathProvider path="/shop-talk">
      <div ref={viewport} className={styles.workspace} onClickCapture={captureLink}>
        <header className={styles.header}>
          <h1>{copy.title}</h1>
          <span className={styles.experiment}>{copy.experiment}</span>
        </header>
        <div className={styles.layout}>
          <div className={styles.catalog}>
            <div className={styles.toolbar}>
              <DepartmentPills search={search} />
              <ActiveFilters search={search} />
              <label className={styles.sort}>
                {t.shop.filters.sort}
                <select
                  aria-label={t.shop.filters.sortField}
                  value={search.sort ?? 'relevance'}
                  onChange={(event) =>
                    manual({
                      ...search,
                      sort: event.target.value as ProductSearch['sort'],
                      page: 1,
                    })
                  }
                >
                  {SHOP_SORTS.map((value) => (
                    <option key={value} value={value}>
                      {t.shop.sort[value]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error ? (
              <div className={styles.catalogNotice}>
                <Notice
                  tone="warning"
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setError(null)
                        if (history.events.length) engine.update(history.events, true)
                        else void engine.loadProducts()
                      }}
                    >
                      {t.common.retry}
                    </Button>
                  }
                >
                  {error}
                </Notice>
              </div>
            ) : null}
            <div className={styles.mobileFilters}>
              <FilterDisclosure label={t.shop.filters.label}>
                <FilterRail search={search} facets={result?.facets} stale={stale} />
              </FilterDisclosure>
            </div>
            <div className={styles.browse}>
              <aside className={styles.rail} tabIndex={0} aria-label={t.shop.filters.label}>
                <FilterRail search={search} facets={result?.facets} stale={stale} />
              </aside>
              <section
                className={styles.results}
                aria-busy={busy}
                aria-label={t.nav.shop}
                tabIndex={0}
                data-shop-results
              >
                <p className={styles.resultStatus} role="status">
                  {busy
                    ? t.common.updating
                    : stale
                      ? t.shop.results.previous
                      : result
                        ? t.common.count.pieces(result.total)
                        : t.shop.results.unavailable}
                </p>
                {result?.items.length ? (
                  <>
                    <ProductGrid items={result.items} columns={3} />
                    <div className="mt-8">
                      {!stale ? (
                        <Pagination
                          search={search}
                          total={result.total}
                          page={result.page}
                          pageSize={result.pageSize}
                        />
                      ) : null}
                    </div>
                  </>
                ) : !result ? (
                  <EmptyState
                    title={t.shop.results.unavailable}
                    description={t.shop.loadError}
                    action={
                      <Button variant="secondary" onClick={() => void engine.loadProducts()}>
                        {t.common.retry}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    title={t.shop.results.emptyTitle}
                    description={t.shop.results.emptyDescription}
                  />
                )}
              </section>
            </div>
          </div>
          <TalkChat
            events={events}
            phase={phase}
            microphone={microphone}
            speaker={speaker}
            speaking={speaking}
            full={full}
            available={available}
            signedIn={signedIn}
            error={chatError}
            onSend={send}
            onVoice={startVoice}
            onMicrophone={() => {
              stopped.current = false
              void connection().setMicrophone(!microphone)
            }}
            onSpeaker={() => void connection().setSpeaker(!speaker)}
            onEnd={stop}
            onRestart={restart}
            onReconnect={() => {
              stopped.current = false
              setChatError(null)
              void connection()
                .connect()
                .catch(() => {})
            }}
          />
        </div>
      </div>
    </ShopPathProvider>
  )
}
