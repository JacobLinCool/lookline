/**
 * Every application table in foreign-key-safe insertion order (used by dump / import scripts).
 *
 * A table left out of this list is not simply skipped. `dump` writes `00_reset.sql` from it too,
 * so an omitted table is neither cleared nor refilled: `pnpm d1:remote` would empty `users` and
 * write new ones while leaving every persona, card and collection behind, pointing at owners that
 * no longer exist. Add new tables here in the same commit that migrates them.
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
  'friendships',
  'activity_sharing',
  'recent_article_views',
  'sessions',
  'sim_personas',
  'previews',
  'preview_articles',
  'purchases',
  'personas',
  'persona_transfers',
  'wardrobe_entitlements',
  'wardrobe_loans',
  'credit_ledger',
  'card_sessions',
  'generation_attempts',
  'card_candidates',
  'cards',
  'collections',
  'collection_members',
  'collection_editions',
  'collection_invites',
  'card_copies',
  'intent_sessions',
  'feedback_events',
  'preference_snapshots',
  'bandit_state',
  'trend_signals',
  'manufacturing_recommendations',
  'search_trends',
  'home_trend',
  'evaluation_runs',
] as const

export type TableName = (typeof TABLE_ORDER)[number]
