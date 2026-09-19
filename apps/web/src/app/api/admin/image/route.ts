import { getLlm } from '@lookline/engine'
import { z } from 'zod'

const inputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2_000),
    aspectRatio: z.enum(['3:4', '1:1', '4:5', '9:16']),
  })
  .strict()
const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > 8_000)
      return Response.json({ error: 'Request too large.' }, { status: 413, headers })
    const parsed = inputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return Response.json(
        { error: 'Enter a prompt between 1 and 2,000 characters and choose a valid ratio.' },
        { status: 400, headers },
      )
    const start = performance.now()
    const result = await getLlm().generateImage({
      prompt: parsed.data.prompt,
      aspectRatio: parsed.data.aspectRatio,
      purpose: 'admin-playground',
      signal: request.signal,
      timeoutMs: 25_000,
    })
    if (!result?.data.length)
      return Response.json(
        {
          error: 'Image generation is unavailable. Check the configured image provider and retry.',
        },
        { status: 503, headers },
      )
    return Response.json(
      {
        image: `data:${result.mimeType};base64,${result.data.toString('base64')}`,
        mimeType: result.mimeType,
        latencyMs: performance.now() - start,
      },
      { headers },
    )
  } catch (error) {
    console.warn('[admin/image] generation failed', error)
    return Response.json(
      { error: 'The image could not be generated. Review the prompt and try again.' },
      { status: 503, headers },
    )
  }
}
