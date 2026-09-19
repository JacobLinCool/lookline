import type { LlmProvider } from '@lookline/db'
import type { LlmImageRequest, LlmImageResult } from '../types'

/** Text adapter: returns parsed JSON (already an object) or throws. */
export interface TextAdapter {
  provider: LlmProvider
  model: string
  generateJson(input: {
    system: string
    prompt: string
    schemaName: string
    jsonSchema: Record<string, unknown>
    signal: AbortSignal
  }): Promise<unknown>
}

/** Image adapter: returns the image or throws. */
export interface ImageAdapter {
  provider: LlmProvider
  model: string
  generateImage(req: LlmImageRequest, signal: AbortSignal): Promise<LlmImageResult>
}

export interface LlmEnv {
  OPENAI_API_KEY?: string
  GEMINI_API_KEY?: string
  LLM_TEXT_PROVIDER?: string
  LLM_IMAGE_PROVIDER?: string
  OPENAI_TEXT_MODEL?: string
  OPENAI_IMAGE_MODEL?: string
  GEMINI_TEXT_MODEL?: string
  GEMINI_IMAGE_MODEL?: string
  LLM_IMAGE_QUALITY?: string
}

export const DEFAULT_MODELS = {
  openaiText: 'gpt-5.6-luna',
  openaiImage: 'gpt-image-2.5-flare',
  geminiText: 'gemini-3.5-flash-lite',
  geminiImage: 'gemini-3.1-flash-image',
} as const

// Total budgets across all providers, leaving time for transport and paint.
export const TEXT_TIMEOUT_MS = 3_500
export const IMAGE_TIMEOUT_MS = 25_000
