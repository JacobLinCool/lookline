import type { Understanding, Recommendation } from '@/server/intent'
export type IntentStreamEvent =
  | { type: 'understood'; understanding: Understanding }
  | { type: 'result'; understanding: Understanding; recommendation: Recommendation }
  | { type: 'refinement'; understanding: Understanding; recommendation: Recommendation }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** NDJSON preserves event boundaries across split UTF-8 network chunks. */
export async function readIntentStream(
  response: Response,
  onEvent: (event: IntentStreamEvent) => void,
) {
  if (!response.ok || !response.body)
    throw new Error('Recommendations could not be loaded. Please retry.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let doneEvent = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line.trim()) continue
        const event = JSON.parse(line) as IntentStreamEvent
        if (event.type === 'done') doneEvent = true
        onEvent(event)
      }
    }
    if (buffer.trim() || !doneEvent)
      throw new Error('The connection ended early. Your current results are still available.')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
