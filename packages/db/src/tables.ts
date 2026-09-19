/**
 * Every application table in foreign-key-safe insertion order (used by dump / import scripts).
 *
 * `article_vision` is deliberately absent. It is the raw record of what a model read off each
 * photograph — a seed-time artifact the app never queries, and `materialize` is the only thing
 * that reads it. Copying 105 000 payloads into D1 would cost storage for data nothing there
 * would ever select.
 */
export const TABLE_ORDER = [
  'brands',
  'articles',
  'article_vectors',
  'type_affinity',
  'hm_customers',
  'users',
  'sessions',
  'sim_personas',
  'looks',
  'look_articles',
  'look_participants',
  'previews',
  'preview_articles',
  'purchases',
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
