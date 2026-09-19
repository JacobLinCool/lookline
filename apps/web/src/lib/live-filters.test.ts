import { afterEach, expect, it, vi } from 'vitest'
import { applyLiveFilters, LatestDecisionQueue } from './live-filters'
import { advanceTranscript, emptyTranscript } from './transcript'

afterEach(() => vi.useRealTimers())
it('replaces interim speech, accumulates finalized fragments once and accepts a correction', () => {
  let state = emptyTranscript()
  state = advanceTranscript(state, { interimInputTranscription: { text: 'black' } }).state
  state = advanceTranscript(state, { interimInputTranscription: { text: 'black coat' } }).state
  const first = advanceTranscript(state, {
    inputTranscription: { text: 'black coat', finished: true },
  })
  expect(first.text).toBe('black coat')
  expect(first.finalized).toBe(true)
  const fragment = advanceTranscript(first.state, {
    inputTranscription: { text: '不是黑色，', finished: false },
  })
  expect(fragment.finalized).toBe(false)
  const final = advanceTranscript(fragment.state, {
    inputTranscription: { text: '改成海軍藍', finished: true },
  })
  expect(final.text).toBe('black coat 不是黑色，改成海軍藍')
})
it('coalesces continuous input, runs one decision at a time and drops superseded revisions', async () => {
  vi.useFakeTimers()
  const jobs: Array<{ value: string; revision: number; signal: AbortSignal; finish: () => void }> =
    []
  const queue = new LatestDecisionQueue<string>(
    (value, revision, signal) =>
      new Promise<void>((finish) => jobs.push({ value, revision, signal, finish })),
  )
  queue.push('black')
  await vi.advanceTimersByTimeAsync(100)
  queue.push('black coat')
  await vi.advanceTimersByTimeAsync(100)
  expect(jobs.map((j) => j.value)).toEqual(['black coat'])
  queue.push('not black')
  queue.push('navy coat', true)
  expect(jobs).toHaveLength(1)
  expect(queue.isCurrent(jobs[0]!.revision)).toBe(false)
  jobs[0]!.finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(jobs.map((j) => j.value)).toEqual(['black coat', 'navy coat'])
  queue.cancel()
  expect(jobs[1]!.signal.aborted).toBe(true)
  expect(queue.isCurrent(jobs[1]!.revision)).toBe(false)
  jobs[1]!.finish()
})
it('reconciles against a base snapshot and removes category-specific constraints on replacement', () => {
  expect(
    applyLiveFilters(
      { categoryGroups: ['tops'], subcategory: 'hoodie', q: 'black', priceMax: 5000, brandId: 2 },
      { categoryGroups: ['outerwear'], colorFamilies: ['blue'], priceMax: 3000 },
    ),
  ).toEqual({
    categoryGroups: ['outerwear'],
    colorFamilies: ['blue'],
    priceMax: 3000,
    brandId: 2,
    q: undefined,
    page: 1,
  })
})
