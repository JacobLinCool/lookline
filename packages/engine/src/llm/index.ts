/**
 * `getLlm()` — cached provider-agnostic client (OpenAI → Gemini → offline). Never throws on
 * provider errors; every LLM-backed feature has an offline fallback (docs/CONTRACTS.md).
 */
import type { LlmClient } from '../types'
import { createLlmClient } from './client'

export { createLlmClient, resolveProviderChain, type LlmClientOptions } from './client'
export { assertGrounded, groundingViolations } from './guard'
export { prepareSchema, type PreparedSchema } from './json-schema'
export { withTimeout, LlmTimeoutError } from './timeout'
export {
  DEFAULT_MODELS,
  TEXT_TIMEOUT_MS,
  IMAGE_TIMEOUT_MS,
  type LlmEnv,
  type TextAdapter,
  type ImageAdapter,
} from './types'

let cached: LlmClient | null = null

/** Provider-agnostic LLM client (OpenAI → Gemini → offline). Never throws on provider errors. */
export function getLlm(): LlmClient {
  if (!cached) cached = createLlmClient()
  return cached
}

/** Replace (or clear) the cached client — tests and scripts that change `process.env`. */
export function setLlm(client: LlmClient | null): void {
  cached = client
}
