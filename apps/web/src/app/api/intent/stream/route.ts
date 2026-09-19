import { getLlm } from '@lookline/engine'
import { z } from 'zod'
import { getSessionUser } from '@/server/auth'
import { MAX_UTTERANCE, recommendFor, understand } from '@/server/intent'
import type { IntentStreamEvent } from '@/lib/intent-stream'

const schema = z.object({
  q: z.string().trim().min(1).max(MAX_UTTERANCE),
  clarify: z.array(z.string().max(120)).max(8).optional(),
  previous: z.string().max(64).nullable().optional(),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return Response.json({ error: 'Enter a sentence of up to 500 characters.' }, { status: 400 })
  const controller = new AbortController()
  const signal = AbortSignal.any([request.signal, controller.signal])
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(output) {
      const emit = (event: IntentStreamEvent) => {
        if (!signal.aborted) output.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      try {
        const user = await getSessionUser()
        signal.throwIfAborted()
        const input = {
          q: parsed.data.q,
          clarify: parsed.data.clarify,
          previousSessionId: parsed.data.previous,
          user,
          signal,
        }
        const understanding = await understand({ ...input, offline: true })
        signal.throwIfAborted()
        emit({ type: 'understood', understanding })
        if (!understanding.parse.ok)
          throw new Error('We could not read this request. Please try another sentence.')
        const recommendation = await recommendFor(understanding, user?.id ?? null)
        signal.throwIfAborted()
        emit({ type: 'result', understanding, recommendation })
        if (getLlm().provider !== 'offline') {
          const enriched = await understand(input)
          signal.throwIfAborted()
          if (enriched.parse.ok && enriched.parse.provider !== 'offline') {
            const refined = await recommendFor(enriched, user?.id ?? null, false)
            signal.throwIfAborted()
            if (refined.result.ok)
              emit({ type: 'refinement', understanding: enriched, recommendation: refined })
          }
        }
      } catch (error) {
        console.warn('[intent] recommendations failed', error)
        if (!signal.aborted)
          emit({
            type: 'error',
            message: 'Recommendations could not be loaded. Please try again.',
          })
      } finally {
        if (!signal.aborted) {
          emit({ type: 'done' })
          output.close()
        }
      }
    },
    cancel() {
      controller.abort()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
