import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createLlmClient } from './client'

afterEach(() => vi.unstubAllGlobals())

/** Exercise the real SDK serializers without contacting a provider. */
function interceptHttp(response: unknown): Request[] {
  const requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    Object.assign(
      vi.fn(async (...args: Parameters<typeof fetch>) => {
        requests.push(new Request(...args))
        return Response.json(response)
      }),
      { Response },
    ),
  )
  return requests
}

const schema = z.object({ ok: z.boolean() })
const imageBytes = Buffer.from('image-fixture')

describe('provider request contracts', () => {
  it('sends Luna medium reasoning with strict structured output to OpenAI', async () => {
    const requests = interceptHttp({
      id: 'resp_test',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }],
        },
      ],
    })
    const client = createLlmClient({ env: { OPENAI_API_KEY: 'test-key' } })
    expect(
      await client.generateJson({ schema, system: 'Extract intent.', prompt: 'A navy suit.' }),
    ).toEqual({ ok: true })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe('https://api.openai.com/v1/responses')
    const body = await requests[0]!.json()
    expect(body).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning: { effort: 'medium' },
      text: { format: { type: 'json_schema', strict: true } },
    })
    expect(body).not.toHaveProperty('temperature')
  })

  it('sends Flash-Lite medium thinking with JSON output to Gemini', async () => {
    const requests = interceptHttp({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }],
    })
    const client = createLlmClient({ env: { GEMINI_API_KEY: 'test-key' } })
    expect(
      await client.generateJson({ schema, system: 'Extract intent.', prompt: 'A navy suit.' }),
    ).toEqual({ ok: true })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    )
    const body = await requests[0]!.json()
    expect(body).toMatchObject({
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: 'MEDIUM' },
      },
    })
    expect(body).toHaveProperty('generationConfig.responseJsonSchema.properties.ok')
    expect(body).not.toHaveProperty('generationConfig.temperature')
    expect(body).not.toHaveProperty('generationConfig.thinkingConfig.thinkingBudget')
  })

  it.each([false, true])(
    'sends Flare high quality with reference photo = %s',
    async (withPhoto) => {
      const requests = interceptHttp({ data: [{ b64_json: imageBytes.toString('base64') }] })
      const client = createLlmClient({ env: { OPENAI_API_KEY: 'test-key' } })
      const result = await client.generateImage({
        prompt: 'A navy suit in a studio.',
        referenceImages: withPhoto ? [{ data: imageBytes, mimeType: 'image/png' }] : [],
      })
      expect(result).toMatchObject({
        provider: 'openai',
        model: 'gpt-image-2.5-flare',
        data: imageBytes,
      })
      expect(requests).toHaveLength(1)
      const request = requests[0]!
      expect(request.url).toBe(
        `https://api.openai.com/v1/images/${withPhoto ? 'edits' : 'generations'}`,
      )
      if (withPhoto) {
        const form = await request.formData()
        expect(form.get('model')).toBe('gpt-image-2.5-flare')
        expect(form.get('quality')).toBe('high')
        const reference = form.get('image[]')
        expect(reference).toBeInstanceOf(File)
        expect(Buffer.from(await (reference as File).arrayBuffer())).toEqual(imageBytes)
        expect(form.has('reasoning')).toBe(false)
      } else {
        const body = await request.json()
        expect(body).toMatchObject({ model: 'gpt-image-2.5-flare', quality: 'high' })
        expect(body).not.toHaveProperty('reasoning')
      }
    },
  )

  it('sends Gemini image references without imposing the text thinking setting', async () => {
    const inlineData = { mimeType: 'image/png', data: imageBytes.toString('base64') }
    const requests = interceptHttp({ candidates: [{ content: { parts: [{ inlineData }] } }] })
    const client = createLlmClient({ env: { GEMINI_API_KEY: 'test-key' } })
    expect(
      await client.generateImage({
        prompt: 'A navy suit in a studio.',
        referenceImages: [{ data: imageBytes, mimeType: 'image/png' }],
      }),
    ).toMatchObject({ provider: 'gemini', model: 'gemini-3.1-flash-image', data: imageBytes })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent',
    )
    const body = await requests[0]!.json()
    expect(body).toHaveProperty('contents.0.parts', expect.arrayContaining([{ inlineData }]))
    expect(body).toMatchObject({ generationConfig: { responseModalities: ['IMAGE'] } })
    expect(body).not.toHaveProperty('generationConfig.thinkingConfig')
  })

  it('names each labelled reference so a composite can refer to it by role', async () => {
    const png = { mimeType: 'image/png', data: imageBytes }
    const references = [
      { ...png, label: 'Garment 1' },
      { ...png, label: 'Person reference 1' },
    ]

    const gemini = interceptHttp({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: imageBytes.toString('base64') } }],
          },
        },
      ],
    })
    await createLlmClient({ env: { GEMINI_API_KEY: 'test-key' } }).generateImage({
      prompt: 'Compose the outfit.',
      referenceImages: references,
    })
    const geminiBody = (await gemini[0]!.json()) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>
    }
    const parts = geminiBody.contents[0]!.parts
    // Each name arrives immediately before the bytes it names.
    expect(parts.map((part) => part.text ?? '[image]')).toEqual([
      'Compose the outfit.',
      'Garment 1:',
      '[image]',
      'Person reference 1:',
      '[image]',
    ])

    vi.unstubAllGlobals()
    const openai = interceptHttp({ data: [{ b64_json: imageBytes.toString('base64') }] })
    await createLlmClient({ env: { OPENAI_API_KEY: 'test-key' } }).generateImage({
      prompt: 'Compose the outfit.',
      referenceImages: references,
    })
    const form = await openai[0]!.formData()
    expect(form.getAll('image[]').map((file) => (file as File).name)).toEqual([
      'garment-1.png',
      'person-reference-1.png',
    ])
  })

  it('honours an explicit image quality setting and rejects invalid settings', async () => {
    const requests = interceptHttp({ data: [{ b64_json: imageBytes.toString('base64') }] })
    const client = createLlmClient({
      env: { OPENAI_API_KEY: 'test-key', LLM_IMAGE_QUALITY: 'medium' },
    })
    await client.generateImage({ prompt: 'A navy suit in a studio.' })
    expect(await requests[0]!.json()).toMatchObject({ quality: 'medium' })
    expect(() =>
      createLlmClient({ env: { OPENAI_API_KEY: 'test-key', LLM_IMAGE_QUALITY: 'invalid' } }),
    ).toThrow('Invalid LLM_IMAGE_QUALITY')
  })
})
