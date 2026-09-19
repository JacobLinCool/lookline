import { compileSearchIntent } from '@lookline/engine'
import { z } from 'zod'

const inputSchema = z.object({ query: z.string().trim().min(1).max(500) }).strict()
const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > 4_000)
      return Response.json({ error: 'Request too large.' }, { status: 413, headers })
    const parsed = inputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return Response.json(
        { error: 'Enter a search phrase between 1 and 500 characters.' },
        { status: 400, headers },
      )
    const intent = await compileSearchIntent(parsed.data.query, {
      signal: request.signal,
      timeoutMs: 5_000,
    })
    return Response.json(intent, { headers })
  } catch (error) {
    console.warn('[admin/search-intent] compilation failed', error)
    return Response.json(
      { error: 'The intent compiler is unavailable. Check the TypeSafe configuration and retry.' },
      { status: 503, headers },
    )
  }
}
