/**
 * @lookline/sim — synthetic personas, the social-history simulation and the evaluation
 * persistence scripts (docs/ARCHITECTURE.md, docs/CONTRACTS.md "@lookline/sim").
 */
export * from './types'
export { CLUSTER_ARCHETYPES, CLUSTER_COUNT, clusterBySlug } from './clusters'
export {
  DEFAULT_PERSONA_COUNT,
  DEMO_PERSONAS,
  GIFT_SHARE,
  generatePersonas,
  personaId,
  pickSizes,
} from './personas'
export {
  DEMO_CIRCLE,
  INTER_EDGE_P,
  INTRA_EDGE_P,
  MIN_FRIENDS,
  buildSocialGraph,
  edgeDensities,
} from './graph'
export {
  GROUP_PRIOR,
  TASTE_BLOCK_WEIGHTS,
  buildTasteVector,
  tasteKey,
  tasteSimilarity,
} from './taste'
export {
  ProductPool,
  SHORTLIST_PER_GROUP,
  budgetFit,
  chooseOptions,
  chooseOutfit,
  chooseProduct,
  compatibleDepartments,
  pickGroup,
  remixFallback,
  type Shortlist,
  type TasteProfile,
} from './pool'
export {
  DAY_MS,
  DEFAULT_DAYS,
  TREND_SEEDS,
  emptyCounts,
  eventTime,
  planSimulation,
  remixProbability,
  type PlanConfig,
} from './schedule'
export { createMemorySink, type MemoryLook, type MemoryRows, type MemorySink } from './sink/memory'
export { createDbSink, type DbSinkOptions } from './sink/db'
export { simulateSocial } from './simulate'
export { pickName, asciiHandle } from './names'
export { PRESETS_BY_ARCHETYPE, pickPreset, pickOccasion, searchUtterance, lookTitle } from './vocab'
