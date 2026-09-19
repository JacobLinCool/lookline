import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { LlmImageResult } from '../types'
import type { ImageAdapter, TextAdapter } from './types'

export function geminiText(apiKey: string, model: string): TextAdapter {
  const ai = new GoogleGenAI({ apiKey })
  return {
    provider: 'gemini',
    model,
    async generateJson({ system, prompt, jsonSchema, signal }) {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          abortSignal: signal,
        },
      })
      const text = response.text
      if (!text) throw new Error('empty response')
      return JSON.parse(text) as unknown
    },
  }
}

export function geminiImage(apiKey: string, model: string): ImageAdapter {
  const ai = new GoogleGenAI({ apiKey })
  return {
    provider: 'gemini',
    model,
    async generateImage(req, signal): Promise<LlmImageResult> {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: req.prompt },
      ]
      for (const ref of req.referenceImages ?? []) {
        if (ref.label) parts.push({ text: `${ref.label}:` })
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data.toString('base64') } })
      }
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: req.aspectRatio ?? '3:4' },
          abortSignal: signal,
        },
      })
      for (const candidate of response.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          const inline = part.inlineData
          if (inline?.data) {
            return {
              mimeType: inline.mimeType ?? 'image/png',
              data: Buffer.from(inline.data, 'base64'),
              provider: 'gemini',
              model,
            }
          }
        }
      }
      throw new Error('no image part in response')
    },
  }
}
