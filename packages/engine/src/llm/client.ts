/**
 * Provider-agnostic LLM client. Provider order: `LLM_TEXT_PROVIDER` / `LLM_IMAGE_PROVIDER`
 * (openai | gemini | offline) else the first configured key in order openai → gemini → offline.
 * Every call walks the chain (primary, then the other configured provider) and returns null after
 * the last failure; failures never throw and log exactly one warning each.
 */
import type { LlmProvider } from '@lookline/db'
import type { LlmClient, LlmImageRequest, LlmImageResult, LlmJsonRequest } from '../types'
import { geminiImage, geminiText } from './gemini'
import { prepareSchema } from './json-schema'
import { openaiImage, openaiText } from './openai'
import { withTimeout } from './timeout'
import {
  DEFAULT_MODELS,
  IMAGE_TIMEOUT_MS,
  TEXT_TIMEOUT_MS,
  type ImageAdapter,
  type LlmEnv,
  type TextAdapter,
} from './types'

const ORDER: readonly LlmProvider[] = ['openai', 'gemini']

const asProvider = (value: string | undefined): LlmProvider | undefined => {
  const v = value?.trim().toLowerCase()
  return v === 'openai' || v === 'gemini' || v === 'offline' ? v : undefined
}

/** Ordered provider chain for one modality; empty means offline. */
export function resolveProviderChain(env: LlmEnv, override: string | undefined): LlmProvider[] {
  const configured = ORDER.filter((p) =>
    p === 'openai' ? Boolean(env.OPENAI_API_KEY) : Boolean(env.GEMINI_API_KEY),
  )
  const forced = asProvider(override)
  if (forced === 'offline') return []
  if (forced && configured.includes(forced)) {
    return [forced, ...configured.filter((p) => p !== forced)]
  }
  return configured
}

export interface LlmClientOptions {
  env?: LlmEnv
  /** Test hook: replaces the adapters of the resolved chain. */
  textAdapters?: TextAdapter[]
  imageAdapters?: ImageAdapter[]
  warn?: (message: string) => void
  textTimeoutMs?: number
  imageTimeoutMs?: number
}

const describe = (err: unknown): string => {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status
    return `${err.name}${typeof status === 'number' ? ` ${status}` : ''}: ${err.message}`
  }
  return String(err)
}

export function createLlmClient(options: LlmClientOptions = {}): LlmClient {
  const env = options.env ?? (process.env as LlmEnv)
  const warn = options.warn ?? ((m: string) => console.warn(m))
  const textTimeout = options.textTimeoutMs ?? TEXT_TIMEOUT_MS
  const imageTimeout = options.imageTimeoutMs ?? IMAGE_TIMEOUT_MS

  const textAdapters =
    options.textAdapters ??
    resolveProviderChain(env, env.LLM_TEXT_PROVIDER).map((p) =>
      p === 'openai'
        ? openaiText(env.OPENAI_API_KEY ?? '', env.OPENAI_TEXT_MODEL || DEFAULT_MODELS.openaiText)
        : geminiText(env.GEMINI_API_KEY ?? '', env.GEMINI_TEXT_MODEL || DEFAULT_MODELS.geminiText),
    )
  const imageAdapters =
    options.imageAdapters ??
    resolveProviderChain(env, env.LLM_IMAGE_PROVIDER).map((p) =>
      p === 'openai'
        ? openaiImage(
            env.OPENAI_API_KEY ?? '',
            env.OPENAI_IMAGE_MODEL || DEFAULT_MODELS.openaiImage,
            env.LLM_IMAGE_QUALITY,
          )
        : geminiImage(
            env.GEMINI_API_KEY ?? '',
            env.GEMINI_IMAGE_MODEL || DEFAULT_MODELS.geminiImage,
          ),
    )

  const primaryText = textAdapters[0]
  const primaryImage = imageAdapters[0]

  return {
    provider: primaryText?.provider ?? 'offline',
    textModel: primaryText?.model ?? null,
    imageModel: primaryImage?.model ?? null,

    async generateJson<T>(req: LlmJsonRequest<T>): Promise<T | null> {
      if (textAdapters.length === 0) return null
      const purpose = req.purpose ?? 'json'
      let prepared
      try {
        prepared = prepareSchema(req.schema)
      } catch (err) {
        warn(`[llm] ${purpose}: schema conversion failed (${describe(err)})`)
        return null
      }
      const { jsonSchema, stripOptionalNulls } = prepared
      const deadline = performance.now() + Math.min(textTimeout, req.timeoutMs ?? textTimeout)
      for (const adapter of textAdapters) {
        const remaining = deadline - performance.now()
        if (remaining <= 0 || req.signal?.aborted) break
        try {
          const raw = await withTimeout(
            remaining,
            (signal) =>
              adapter.generateJson({
                system: req.system,
                prompt: req.prompt,
                schemaName: purpose.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'output',
                jsonSchema,
                signal,
              }),
            req.signal,
          )
          const parsed = req.schema.safeParse(stripOptionalNulls(raw))
          if (parsed.success) return parsed.data
          throw new Error(`schema validation failed: ${parsed.error.issues[0]?.message ?? '?'}`)
        } catch (err) {
          warn(`[llm] ${adapter.provider}/${adapter.model} ${purpose} failed (${describe(err)})`)
        }
      }
      return null
    },

    async generateImage(req: LlmImageRequest): Promise<LlmImageResult | null> {
      const purpose = req.purpose ?? 'image'
      const deadline = performance.now() + Math.min(imageTimeout, req.timeoutMs ?? imageTimeout)
      for (const adapter of imageAdapters) {
        const remaining = deadline - performance.now()
        if (remaining <= 0 || req.signal?.aborted) break
        try {
          return await withTimeout(
            remaining,
            (signal) => adapter.generateImage(req, signal),
            req.signal,
          )
        } catch (err) {
          warn(`[llm] ${adapter.provider}/${adapter.model} ${purpose} failed (${describe(err)})`)
        }
      }
      return null
    },
  }
}
