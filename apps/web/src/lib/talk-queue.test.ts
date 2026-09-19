import { afterEach, describe, expect, it, vi } from 'vitest'
import { TalkQueue, type TalkJob } from './talk-queue'

afterEach(() => vi.useRealTimers())
describe('conversation coalescing', () => {
  it('applies an in-flight snapshot during continuous input and runs only the latest pending snapshot', async () => {
    vi.useFakeTimers()
    const jobs: TalkJob<string>[] = []
    let finish!: () => void
    const queue = new TalkQueue<string>(async (job) => {
      jobs.push(job)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    queue.push('a')
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 8; i++) {
      queue.push(`a${i}`)
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(jobs).toHaveLength(1)
    expect(queue.accept(jobs[0]!)).toBe(true)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(jobs.map((job) => job.value)).toEqual(['a', 'a7'])
    finish()
    await vi.advanceTimersByTimeAsync(0)
  })
  it('invalidates work on a manual change and never accepts older applied versions', async () => {
    vi.useFakeTimers()
    let job!: TalkJob<string>
    const queue = new TalkQueue<string>(async (next) => {
      job = next
    })
    queue.push('old', true)
    await vi.advanceTimersByTimeAsync(0)
    queue.invalidate()
    expect(queue.accept(job)).toBe(false)
    queue.push('new', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(queue.accept(job)).toBe(true)
    expect(queue.accept({ epoch: job.epoch, revision: job.revision - 1 })).toBe(false)
  })
})
