/** Run `fn` with an AbortSignal that fires after `ms`; rejects with `LlmTimeoutError` on timeout. */
export class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms} ms`)
    this.name = 'LlmTimeoutError'
  }
}

export function withTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      controller.abort(parent?.reason)
      reject(parent?.reason ?? new Error('Cancelled'))
    }
    const timer = setTimeout(
      () => {
        cleanup()
        const error = new LlmTimeoutError(ms)
        controller.abort(error)
        reject(error)
      },
      Math.max(0, ms),
    )
    if (parent?.aborted) return abort()
    parent?.addEventListener('abort', abort, { once: true })
    Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted()
        return fn(controller.signal)
      })
      .then(
        (value) => {
          cleanup()
          resolve(value)
        },
        (err: unknown) => {
          cleanup()
          reject(err instanceof Error ? err : new Error(String(err)))
        },
      )
  })
}
