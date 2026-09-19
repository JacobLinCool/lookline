/**
 * @lookline/engine — intent (Engine 01), explainable recommendation (Engine 02),
 * preference feedback loop (Engine 03), social write paths, Look presets/posters,
 * graph/lineage/trend analytics.
 *
 * Each module directory has exactly one owner; this barrel only re-exports (docs/CONTRACTS.md).
 */
export * from './types'
export * from './llm'
export * from './intent'
export * from './recommend'
export * from './preference'
export * from './social'
export * from './looks'
export * from './analytics'
export * from './decisions/filters'
export * from './decisions/candidates'
export * from './decisions/keywords'
export { facetIncludes, facetExcludes, facetColumn } from './decisions/facets'
export {
  FILTER_HINTS,
  MIN_HINT_CONFIDENCE,
  hintKey,
  hintQuestion,
  hintQuestions,
  isFilterHintId,
  openingHints,
  reduceHints,
  type ChoiceAnswer,
  type FilterHint,
  type FilterHintId,
  type HintBase,
} from './decisions/hints'
export * from './decisions/search-intent'
