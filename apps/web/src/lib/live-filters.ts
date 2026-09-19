import { SEARCH_FACET_FIELDS } from '@lookline/catalog'
import type { FilterState, ProductSearch } from '@lookline/engine'

/** The `ProductSearch` fields the sentence resolver decides: every registry facet plus the scalars. */
export const FILTER_KEYS = [
  'department',
  ...SEARCH_FACET_FIELDS,
  'priceMin',
  'priceMax',
  'sort',
] as const satisfies readonly (keyof FilterState & keyof ProductSearch)[]

export function liveBase(search: ProductSearch): FilterState {
  return Object.fromEntries(
    FILTER_KEYS.filter((key) => search[key] !== undefined).map((key) => [key, search[key]]),
  ) as FilterState
}

/**
 * The resolver's decision over the base snapshot. Free text (`q`) is replaced by the sentence;
 * `keywords` are dropped unless the caller carries the ones it already extracted for this
 * sentence, so a still-typing shopper keeps seeing the narrowed grid until the fresh extraction
 * lands rather than watching it widen on every keystroke.
 */
export function applyLiveFilters(
  base: ProductSearch,
  filters: FilterState,
  keywords?: readonly string[],
): ProductSearch {
  const next: ProductSearch = { ...base, q: undefined, page: 1 }
  for (const key of FILTER_KEYS) delete next[key]
  Object.assign(next, filters)
  if (keywords?.length) next.keywords = [...keywords]
  else delete next.keywords
  if (JSON.stringify(base.categoryGroups) !== JSON.stringify(filters.categoryGroups)) {
    delete next.category
    delete next.subcategory
  }
  return next
}

/** Serial, coalescing queue: continuous input cannot spawn concurrent provider calls. */
export class LatestDecisionQueue<T> {
  private revision = 0
  private pending?: { value: T; revision: number }
  private active?: AbortController
  private timer?: ReturnType<typeof setTimeout>
  constructor(private run: (value: T, revision: number, signal: AbortSignal) => Promise<void>) {}
  push(value: T, immediate = false) {
    this.pending = { value, revision: ++this.revision }
    if (immediate) {
      clearTimeout(this.timer)
      this.timer = undefined
      void this.drain()
    } else if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined
        void this.drain()
      }, 200)
  }
  isCurrent(revision: number) {
    return revision === this.revision
  }
  cancel() {
    this.revision++
    this.pending = undefined
    clearTimeout(this.timer)
    this.timer = undefined
    this.active?.abort()
  }
  private async drain() {
    if (this.active || !this.pending) return
    const job = this.pending
    this.pending = undefined
    const controller = new AbortController()
    this.active = controller
    try {
      await this.run(job.value, job.revision, controller.signal)
    } finally {
      if (this.active === controller) this.active = undefined
      if (this.pending) void this.drain()
    }
  }
}
