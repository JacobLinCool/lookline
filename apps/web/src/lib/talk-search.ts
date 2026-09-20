import { SHOP_REQUEST_TIMEOUT_MS } from '@/lib/shop-timeouts'
import type {
  FilterDecision,
  KeywordExtraction,
  ProductSearch,
  ProductSearchResult,
} from '@lookline/engine'
import type { ConversationEvent } from '@lookline/engine/conversation'
import { formatKeyword } from '@lookline/engine/keywords'
import { searchToParams } from '@/components/shop/query'
import { applyLiveFilters, liveBase } from './live-filters'
import { TalkQueue, type TalkJob } from './talk-queue'

type Snapshot = { events: readonly ConversationEvent[]; final: boolean }
type Callbacks = {
  search: (search: ProductSearch) => void
  result: (result: ProductSearchResult, key: string) => void
  busy: (busy: boolean) => void
  error: (error: 'filterError' | 'keywordError' | 'full' | null) => void
}
export const talkSearchKey = (search: ProductSearch) => searchToParams(search).toString()

/** Independent of the Live transport: only validated transcript snapshots can change search. */
export class TalkSearch {
  current: ProductSearch
  private initial: ProductSearch
  private queue: TalkQueue<Snapshot>
  private products?: AbortController
  private keywords?: AbortController
  private keywordTimer?: ReturnType<typeof setTimeout>
  private lastChange = 0
  private active = true
  private working = 0
  constructor(
    initial: ProductSearch,
    private callbacks: Callbacks,
  ) {
    this.initial = initial
    this.current = initial
    this.queue = new TalkQueue((job) => this.resolve(job))
  }
  update(events: readonly ConversationEvent[], final: boolean) {
    this.active = true
    this.lastChange = performance.now()
    this.cancelKeywords()
    this.queue.push({ events: structuredClone(events), final }, final)
  }
  private begin() {
    this.working++
    this.callbacks.busy(true)
  }
  private end() {
    this.working = Math.max(0, this.working - 1)
    this.callbacks.busy(this.working > 0)
  }
  private body(job: TalkJob<Snapshot>) {
    return {
      base: liveBase(this.initial),
      events: job.value.events,
      revision: job.revision,
      epoch: job.epoch,
    }
  }
  private async resolve(job: TalkJob<Snapshot>) {
    this.begin()
    const started = performance.now()
    try {
      const response = await fetch('/api/shop-talk/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.body(job)),
        signal: AbortSignal.any([job.signal, AbortSignal.timeout(SHOP_REQUEST_TIMEOUT_MS)]),
      })
      const decision = (await response.json()) as FilterDecision & {
        revision: number
        epoch: number
      }
      if (!this.active || job.signal.aborted || !this.queue.applicable(job)) return
      if (response.status === 413) {
        this.callbacks.error('full')
        return
      }
      if (
        !response.ok ||
        decision.revision !== job.revision ||
        decision.epoch !== job.epoch ||
        !decision.filters ||
        !Array.isArray(decision.unresolved)
      )
        throw new Error('Invalid decision')
      this.queue.accept(job)
      this.callbacks.error(null)
      const next = applyLiveFilters(
        this.current,
        decision.filters,
        decision.freeText ? this.current.keywords : undefined,
      )
      // A transcript-only change must not reset pagination or issue another catalog request.
      if (
        talkSearchKey({ ...next, page: undefined }) !==
        talkSearchKey({ ...this.current, page: undefined })
      )
        this.apply(next)
      if (typeof window !== 'undefined')
        window.dispatchEvent(
          new CustomEvent('lookline:talk-decision', {
            detail: {
              revision: job.revision,
              decisionMs: decision.latencyMs,
              elapsedMs: performance.now() - started,
            },
          }),
        )
      if (decision.freeText && job.revision === this.queue.version.revision)
        this.scheduleKeywords(job)
    } catch {
      if (this.active && !job.signal.aborted && this.queue.applicable(job))
        this.callbacks.error('filterError')
    } finally {
      this.end()
    }
  }
  private scheduleKeywords(job: TalkJob<Snapshot>) {
    const delay = job.value.final ? 0 : Math.max(0, 500 - (performance.now() - this.lastChange))
    this.keywordTimer = setTimeout(() => {
      this.keywordTimer = undefined
      void this.refine(job)
    }, delay)
  }
  private async refine(job: TalkJob<Snapshot>) {
    const controller = new AbortController()
    this.keywords = controller
    this.begin()
    try {
      const response = await fetch('/api/shop-talk/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.body(job)),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(SHOP_REQUEST_TIMEOUT_MS)]),
      })
      const data = (await response.json()) as KeywordExtraction & {
        revision: number
        epoch: number
      }
      if (
        !this.active ||
        controller.signal.aborted ||
        !this.queue.applicable(job) ||
        job.revision !== this.queue.version.revision
      )
        return
      if (
        !response.ok ||
        data.revision !== job.revision ||
        data.epoch !== job.epoch ||
        !Array.isArray(data.keywords)
      )
        throw new Error('Invalid keywords')
      const keywords = data.keywords.map(formatKeyword)
      if (JSON.stringify(keywords) !== JSON.stringify(this.current.keywords ?? []))
        this.apply({ ...this.current, keywords: keywords.length ? keywords : undefined, page: 1 })
    } catch {
      if (this.active && !controller.signal.aborted) this.callbacks.error('keywordError')
    } finally {
      if (this.keywords === controller) this.keywords = undefined
      this.end()
    }
  }
  private cancelKeywords() {
    clearTimeout(this.keywordTimer)
    this.keywordTimer = undefined
    this.keywords?.abort()
    this.keywords = undefined
  }
  private apply(next: ProductSearch) {
    this.current = next
    this.callbacks.search(next)
    void this.loadProducts()
  }
  async loadProducts() {
    this.products?.abort()
    const controller = new AbortController()
    this.products = controller
    const key = talkSearchKey(this.current)
    this.begin()
    try {
      const response = await fetch(`/api/articles/search?${key}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(SHOP_REQUEST_TIMEOUT_MS)]),
      })
      const result = (await response.json()) as ProductSearchResult
      if (controller.signal.aborted) return
      if (!response.ok || !Array.isArray(result.items)) throw new Error('Invalid products')
      this.callbacks.result(result, key)
    } catch {
      if (!controller.signal.aborted) this.callbacks.error('filterError')
    } finally {
      this.end()
    }
  }
  manual(next: ProductSearch) {
    this.queue.invalidate()
    this.cancelKeywords()
    this.callbacks.error(null)
    this.apply(next)
  }
  stop() {
    this.active = false
    this.queue.invalidate()
    this.cancelKeywords()
    this.products?.abort()
  }
  reset() {
    this.stop()
    this.initial = this.current
    this.active = true
  }
}
