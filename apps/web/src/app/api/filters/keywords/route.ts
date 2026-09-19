import { extractSearchKeywords, getLlm } from '@lookline/engine'
import { z } from 'zod'
import { getMessages } from '@/i18n/server'
import { liveAccess } from '@/server/live-access'

const inputSchema = z.object({
  utterance: z.string().trim().min(1).max(500),
  revision: z.number().int().min(0),
})
const headers = { 'Cache-Control': 'no-store' }

/**
 * `POST /api/filters/keywords` `{ utterance, revision }` → `{ keywords, revision, provider, model,
 * contractVersion, latencyMs }`: the free-text search terms of a sentence the filter decision
 * reported as `freeText`, from the fast generative model, for the full-text index. It runs after
 * the attribute filters have already painted; `keywords: []` means the model found nothing beyond
 * the attributes, and 503 means no provider answered — the attribute results stand either way.
 */
export async function POST(request: Request) {
  const access = await liveAccess(request, 'keywords')
  if (access.response) return access.response
  const { errors } = (await getMessages()).ui
  try {
    if (Number(request.headers.get('content-length')) > 4_000)
      return Response.json({ error: errors.tooLarge }, { status: 413, headers })
    const parsed = inputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return Response.json({ error: errors.invalidRequest }, { status: 400, headers })
    const extraction = await extractSearchKeywords(parsed.data.utterance, {
      llm: getLlm(),
      signal: request.signal,
    })
    if (!extraction)
      return Response.json({ error: errors.keywordsUnavailable }, { status: 503, headers })
    return Response.json({ ...extraction, revision: parsed.data.revision }, { headers })
  } catch (error) {
    console.warn('[filters] keywords failed', error)
    return Response.json({ error: errors.keywordsUnavailable }, { status: 503, headers })
  } finally {
    access.release!()
  }
}
