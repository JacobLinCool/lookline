/**
 * Engine 01 — intent. Contract exports: `parseIntent`, `parseIntentOffline`, `intentToVector`
 * (docs/CONTRACTS.md); everything else is an addition.
 */
import { getLlm } from '../llm'
import type { Intent, IntentResult } from '../types'
import { isFollowUp, mergeIntent } from './dialogue'
import { finalize } from './finalize'
import { parseIntentOffline } from './lexicon-parser'
import { intentPromptV1, mergeLlm, parseIntentLlm } from './llm-parser'
import type { IntentContextExt, IntentExt } from './schema'

/** Contract `IntentResult` whose `intent` is the engine-extended shape. */
export interface IntentResultExt extends IntentResult {
  intent: IntentExt
}
import { intentToVector } from './vectorize'

export { parseIntentOffline, seasonOfDate } from './lexicon-parser'
export { intentToVector, referenceLookVector, FALLBACK_AESTHETICS } from './vectorize'
export { finalize, computeConfidence, giftCategoryPrior, SEASON_AXIS_TARGETS } from './finalize'
export { buildClarifications, isClarificationAnswer } from './clarify'
export { applyClarification, detectFollowUp, isFollowUp, mergeIntent } from './dialogue'
export {
  mergeLlm,
  parseIntentLlm,
  intentPromptV1,
  INTENT_PROMPT_VERSION,
  userMessage,
  fuzzySlug,
} from './llm-parser'
export {
  IntentSchema,
  LlmIntentOutput,
  RELATIONS,
  type IntentExt,
  type IntentSignals,
  type IntentContextExt,
  type IntentContact,
  type IntentBrand,
  type LlmIntentOutputT,
} from './schema'
export { normalise, normalizeText, detectLocale } from './normalize'
export { cjkToNumber, findNumbers } from './numbers'
export { extractBudget } from './money'
export { scanText, buildDictionary, getDictionary } from './lexicon'

/** Static accessor kept for callers that want the prompt text (built lazily). */
export const INTENT_PROMPT_V1 = {
  get text(): string {
    return intentPromptV1()
  },
}

/**
 * §1.3: always run the offline parser; add the LLM parse when a provider is configured and
 * `ctx.offline` is not set; merge; follow-ups merge onto `ctx.previousIntent`.
 */
export async function parseIntent(
  utterance: string,
  ctx: IntentContextExt = {},
): Promise<IntentResultExt> {
  const t0 = performance.now()
  const previous = ctx.previousIntent ?? null
  const followUp = previous !== null && isFollowUp(utterance, previous)
  const lex = parseIntentOffline(utterance, ctx)
  const withPrevious = (intent: IntentExt): IntentExt =>
    followUp && previous ? mergeIntent(previous, intent, ctx) : intent
  const vectorOpts = { trendingAesthetics: ctx.trendingAesthetics, eventCount: ctx.eventCount }
  const base = ctx.user?.preferenceVector ?? null

  const offline = (): IntentResultExt => {
    const intent = withPrevious(lex)
    return {
      intent,
      vector: intentToVector(intent, base, vectorOpts),
      provider: 'offline',
      model: null,
      latencyMs: Math.round(performance.now() - t0),
    }
  }
  if (ctx.offline) return offline()
  const llm = getLlm()
  if (llm.provider === 'offline') return offline()
  const raw = await parseIntentLlm(utterance, ctx, llm)
  if (!raw) return offline()
  let merged: IntentExt
  try {
    merged = finalize(mergeLlm(lex, raw, ctx), ctx)
  } catch {
    return offline()
  }
  const intent = withPrevious(merged)
  return {
    intent,
    vector: intentToVector(intent, base, vectorOpts),
    provider: llm.provider,
    model: llm.textModel,
    latencyMs: Math.round(performance.now() - t0),
  }
}

export type { Intent }
