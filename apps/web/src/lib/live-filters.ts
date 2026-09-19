import type { FilterState, ProductSearch } from '@lookline/engine'

export const FILTER_KEYS = [
  'department',
  'categoryGroups',
  'excludedCategoryGroups',
  'colorFamilies',
  'excludedColorFamilies',
  'aesthetics',
  'excludedAesthetics',
  'priceMin',
  'priceMax',
  'sort',
] as const
export function liveBase(search: ProductSearch): FilterState {
  return Object.fromEntries(
    FILTER_KEYS.filter((key) => search[key] !== undefined).map((key) => [key, search[key]]),
  ) as FilterState
}
export function applyLiveFilters(base: ProductSearch, filters: FilterState): ProductSearch {
  const next = { ...base, q: undefined, page: 1 }
  for (const key of FILTER_KEYS) delete next[key]
  Object.assign(next, filters)
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
