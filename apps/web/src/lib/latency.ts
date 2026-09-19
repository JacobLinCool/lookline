/** Browser-only, content-free interaction measurements; server timers never count as paint. */
export const LATENCY = {
  acknowledgement: 100,
  instant: 400,
  progress: 800,
  usable: 5_000,
  image: 30_000,
} as const
export type LatencyClass = 'instant' | 'generative' | 'creative'
export type Milestone =
  | 'acknowledged'
  | 'progress'
  | 'usable'
  | 'visual'
  | 'final'
  | 'failed'
  | 'cancelled'

export function startInteraction(kind: LatencyClass, name: string) {
  const id = crypto.randomUUID()
  const start = performance.now()
  let lastProgress = start
  let ended = false
  return {
    id,
    mark(milestone: Milestone) {
      if (ended) return
      const now = performance.now()
      const elapsed = now - start
      const meaningful = ['progress', 'usable', 'visual', 'final'].includes(milestone)
      const gap =
        meaningful || ['failed', 'cancelled'].includes(milestone) ? now - lastProgress : null
      if (meaningful) lastProgress = now
      const budget =
        milestone === 'acknowledged'
          ? LATENCY.acknowledgement
          : milestone === 'usable'
            ? kind === 'instant'
              ? LATENCY.instant
              : LATENCY.usable
            : milestone === 'visual'
              ? LATENCY.usable
              : milestone === 'final' && kind === 'creative'
                ? LATENCY.image
                : null
      const detail = {
        id,
        kind,
        name,
        milestone,
        elapsed,
        gap,
        deadlineMiss: budget !== null && elapsed > budget,
        progressMiss: kind !== 'instant' && gap !== null && gap > LATENCY.progress,
      }
      performance.mark(`lookline:${name}:${milestone}`, { detail })
      window.dispatchEvent(new CustomEvent('lookline:latency', { detail }))
      if (['final', 'failed', 'cancelled'].includes(milestone)) ended = true
    },
  }
}

export type InteractionTrace = ReturnType<typeof startInteraction>
/** Two frames separate a DOM commit from its first opportunity to paint. */
export function afterPaint(callback: () => void) {
  let second = 0
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(callback)
  })
  return () => {
    cancelAnimationFrame(first)
    cancelAnimationFrame(second)
  }
}
