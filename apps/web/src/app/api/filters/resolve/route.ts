import { filterStateSchema, resolveFilters } from '@lookline/engine'
import { z } from 'zod'
import { getMessages } from '@/i18n/server'
import { liveAccess } from '@/server/live-access'

const inputSchema = z.object({
  utterance: z.string().trim().min(1).max(500),
  base: filterStateSchema,
  revision: z.number().int().min(0),
})
export async function POST(request: Request) {
  const access = await liveAccess(request, 'filters')
  if (access.response) return access.response
  const { errors } = (await getMessages()).ui
  try {
    if (Number(request.headers.get('content-length')) > 12_000)
      return Response.json({ error: errors.tooLarge }, { status: 413 })
    const reader = request.body?.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > 12_000) {
            await reader.cancel()
            return Response.json({ error: errors.tooLarge }, { status: 413 })
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
    }
    let body: unknown
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      body = null
    }
    const parsed = inputSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: errors.invalidRequest }, { status: 400 })
    const decision = await resolveFilters(parsed.data.utterance, parsed.data.base, {
      signal: request.signal,
    })
    return Response.json(
      { ...decision, revision: parsed.data.revision },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.warn('[filters] resolve failed', error)
    return Response.json(
      { error: errors.filtersUnavailable },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  } finally {
    access.release!()
  }
}
