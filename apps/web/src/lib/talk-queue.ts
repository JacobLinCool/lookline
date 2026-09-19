export interface TalkJob<T> {
  value: T
  revision: number
  epoch: number
  signal: AbortSignal
}

/** A bounded coalescing throttle: incoming fragments cannot starve a running decision. */
export class TalkQueue<T> {
  private revision = 0
  private epoch = 0
  private applied = 0
  private pending?: { value: T; revision: number; immediate: boolean }
  private active?: AbortController
  private timer?: ReturnType<typeof setTimeout>
  private lastStart = -Infinity
  constructor(
    private run: (job: TalkJob<T>) => Promise<void>,
    private delay = 300,
  ) {}
  push(value: T, immediate = false) {
    this.pending = { value, revision: ++this.revision, immediate }
    if (immediate) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.schedule()
    return this.revision
  }
  get version() {
    return { revision: this.revision, epoch: this.epoch }
  }
  applicable(job: Pick<TalkJob<T>, 'epoch' | 'revision'>) {
    return job.epoch === this.epoch && job.revision >= this.applied
  }
  accept(job: Pick<TalkJob<T>, 'epoch' | 'revision'>) {
    if (!this.applicable(job)) return false
    this.applied = job.revision
    return true
  }
  invalidate() {
    this.epoch++
    this.pending = undefined
    clearTimeout(this.timer)
    this.timer = undefined
    this.active?.abort()
  }
  private schedule() {
    if (this.active || this.timer || !this.pending) return
    const wait = this.pending.immediate
      ? 0
      : Math.max(0, this.lastStart + this.delay - performance.now())
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.drain()
    }, wait)
  }
  private async drain() {
    if (this.active || !this.pending) return
    const pending = this.pending
    this.pending = undefined
    const controller = new AbortController()
    this.active = controller
    this.lastStart = performance.now()
    try {
      await this.run({ ...pending, epoch: this.epoch, signal: controller.signal })
    } finally {
      this.active = undefined
      this.schedule()
    }
  }
}
