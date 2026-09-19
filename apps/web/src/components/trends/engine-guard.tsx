/** Guard service calls so independent page sections remain usable on failure. */
export type EngineResult<T> =
  | { ok: true; value: T }
  | { ok: false; capability: string; message: string }

export async function callEngine<T>(
  capability: string,
  fn: () => Promise<T>,
): Promise<EngineResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[lookline] ${capability} unavailable:`, message)
    return { ok: false, capability, message }
  }
}
