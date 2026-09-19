/** Every application table in foreign-key-safe insertion order (used by dump / import scripts). */
export const TABLE_ORDER = [
  'brands',
  'articles',
  'article_vectors',
  'users',
  'sessions',
  'sim_personas',
  'looks',
  'look_articles',
  'look_participants',
  'purchases',
  'asks',
  'ask_responses',
  'interactions',
  'relationships',
  'intent_sessions',
  'feedback_events',
  'preference_snapshots',
  'bandit_state',
  'lineage_stats',
  'trend_signals',
  'manufacturing_recommendations',
  'evaluation_runs',
] as const

export type TableName = (typeof TABLE_ORDER)[number]
