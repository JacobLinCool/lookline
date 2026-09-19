import OpenAI, { toFile } from 'openai'
import type { LlmImageRequest, LlmImageResult } from '../types'
import type { ImageAdapter, TextAdapter } from './types'

const SIZE_BY_ASPECT: Record<NonNullable<LlmImageRequest['aspectRatio']>, string> = {
  '3:4': '1024x1536',
  '1:1': '1024x1024',
  '4:5': '1024x1536',
  '9:16': '1024x1536',
}

type ImageQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto'

const asQuality = (q: string | undefined): ImageQuality => {
  if (!q) return 'high'
  if (q === 'low' || q === 'medium' || q === 'high' || q === 'xhigh' || q === 'max' || q === 'auto')
    return q
  throw new Error(`Invalid LLM_IMAGE_QUALITY: ${q}`)
}

export function openaiText(apiKey: string, model: string): TextAdapter {
  const client = new OpenAI({ apiKey, maxRetries: 0 })
  return {
    provider: 'openai',
    model,
    async generateJson({ system, prompt, schemaName, jsonSchema, signal }) {
      const response = await client.responses.create(
        {
          model,
          input: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          reasoning: { effort: 'medium' },
          text: {
            format: { type: 'json_schema', name: schemaName, schema: jsonSchema, strict: true },
          },
        },
        { signal },
      )
      const text = response.output_text
      if (!text) throw new Error('empty response')
      return JSON.parse(text) as unknown
    },
  }
}

export function openaiImage(
  apiKey: string,
  model: string,
  quality: string | undefined,
): ImageAdapter {
  const client = new OpenAI({ apiKey, maxRetries: 0 })
  const imageQuality = asQuality(quality)
  return {
    provider: 'openai',
    model,
    async generateImage(req, signal): Promise<LlmImageResult> {
      const size = SIZE_BY_ASPECT[req.aspectRatio ?? '3:4']
      const refs = req.referenceImages ?? []
      const common = { model, prompt: req.prompt, n: 1, size, quality: imageQuality } as const
      const result =
        refs.length > 0
          ? await client.images.edit(
              {
                ...common,
                image: await Promise.all(
                  refs.map((r, i) =>
                    toFile(r.data, `reference-${i}.${r.mimeType.split('/')[1] ?? 'png'}`, {
                      type: r.mimeType,
                    }),
                  ),
                ),
              },
              { signal },
            )
          : await client.images.generate({ ...common, output_format: 'png' }, { signal })
      const first = result.data?.[0]
      if (!first?.b64_json) throw new Error('no image data')
      return {
        mimeType: 'image/png',
        data: Buffer.from(first.b64_json, 'base64'),
        provider: 'openai',
        model,
      }
    },
  }
}
