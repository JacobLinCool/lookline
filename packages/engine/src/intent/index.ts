/**
 * Engine 01 — intent. Contract exports: `parseIntent`, `parseIntentOffline`, `intentToVector`
 * (docs/CONTRACTS.md); everything else is an addition.
 */
import { compileSearchIntent, type SearchIntent } from '../decisions/search-intent'
import { getLlm } from '../llm'
import type { Intent, IntentResult } from '../types'
import { isFollowUp, mergeIntent } from './dialogue'
import { finalize } from './finalize'
import {
  decisionsConfigured,
  INTENT_DECISION_TIMEOUT_MS,
  mergeJev,
  routeIntent,
  type IntentRoute,
} from './jev-parser'
import { parseIntentOffline } from './lexicon-parser'
import { intentPromptV1, mergeLlm, parseIntentLlm } from './llm-parser'
import type { IntentContextExt, IntentExt } from './schema'

/** Contract `IntentResult` whose `intent` is the engine-extended shape. */
export interface IntentResultExt extends IntentResult {
  intent: IntentExt
  /** Whether the decision stage handed off to the generative parser, and why. */
  route: IntentRoute
  /**
   * Present only under `ctx.deferRefinement` when the route escalated: runs the generative parser
   * over the same lexical and decision stages and returns the refined result.
   */
  refine?: () => Promise<IntentResultExt>
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
export {
  decisionsConfigured,
  mergeJev,
  routeIntent,
  INTENT_DECISION_TIMEOUT_MS,
  MIN_TYPE_RELEVANCE,
  type IntentRoute,
  type RouteReason,
} from './jev-parser'

/** Static accessor kept for callers that want the prompt text (built lazily). */
export const INTENT_PROMPT_V1 = {
  get text(): string {
    return intentPromptV1()
  },
}

/**
 * §1.3 — the lexicon parser always runs. The closed-option decision (Jev) runs in front of the
 * generative parser and finishes most sentences on its own inside the latency budget; only the
 * escalations `routeIntent` names reach the LLM, which is the one stage that cannot meet it.
 *
 * `ctx.deferRefinement` returns the decision without waiting for that escalation, leaving it to
 * the caller — `apps/web` runs it in `after()` and updates the intent session.
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

  const done = (
    intent: IntentExt,
    provider: IntentResultExt['provider'],
    model: string | null,
    route: IntentRoute,
  ): IntentResultExt => {
    const final = withPrevious(intent)
    return {
      intent: final,
      vector: intentToVector(final, base, vectorOpts),
      provider,
      model,
      latencyMs: Math.round(performance.now() - t0),
      route,
    }
  }
  const NO_ROUTE: IntentRoute = { escalate: false, reason: null }
  if (ctx.offline) return done(lex, 'offline', null, NO_ROUTE)

  let search: SearchIntent | null = null
  if (decisionsConfigured()) {
    try {
      search = await compileSearchIntent(utterance, {
        signal: ctx.signal,
        timeoutMs: INTENT_DECISION_TIMEOUT_MS,
      })
    } catch (error) {
      // Explicit, never silent: the spec forbids a failed decision from quietly becoming an LLM
      // call, so the escalation that follows is announced.
      console.warn(`[intent] decision stage failed (${String(error)}); escalating`)
    }
  }

  /** One `finalize` over whichever stages spoke, so occasion priors are applied exactly once. */
  const compose = (llmRaw: Parameters<typeof mergeLlm>[1] | null): IntentExt => {
    let intent = llmRaw ? mergeLlm(lex, llmRaw, ctx) : lex
    if (search) intent = mergeJev(intent, search, ctx)
    return finalize(intent, ctx)
  }

  const route = routeIntent(lex, search)
  let decided: IntentExt
  try {
    decided = compose(null)
  } catch {
    decided = lex
  }
  const decision = (): IntentResultExt =>
    done(decided, search ? 'jev' : 'offline', search?.model ?? null, route)

  const escalate = async (): Promise<IntentResultExt> => {
    const llm = getLlm()
    if (llm.provider === 'offline') return decision()
    const raw = await parseIntentLlm(utterance, ctx, llm)
    if (!raw) return decision()
    try {
      return done(compose(raw), llm.provider, llm.textModel, route)
    } catch {
      return decision()
    }
  }

  if (!route.escalate) return decision()
  // Deferred: the caller shows the decision now and runs `refine` out of band.
  if (ctx.deferRefinement) return { ...decision(), refine: escalate }
  return escalate()
}

export type { Intent }
