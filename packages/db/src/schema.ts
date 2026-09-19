/**
 * Lookline database schema — the single source of truth for every table (SQLite / Cloudflare D1).
 * See docs/ARCHITECTURE.md (contract) and docs/DATA_MODEL.md (semantics).
 *
 * Conventions
 * - Catalog entities (brands, products) use integer primary keys plus a stable slug.
 * - App entities use text primary keys (deterministic ids from the simulation, nanoid at runtime).
 * - Enums are `text` columns constrained by the `*_VALUES` tuples below.
 * - Arrays and objects are JSON text (`mode: 'json'`); every 64-d vector is a JSON array following
 *   the style-space layout in docs/ARCHITECTURE.md (`product_vectors` keeps a normalised copy of
 *   `products.style_vector` spread over 64 REAL columns for cosine ranking in SQL — see
 *   `vectors.ts` and `drizzle/0001_vectors_fts.sql`).
 * - Timestamps are integer milliseconds since the epoch (`mode: 'timestamp_ms'`, JS `Date`).
 * - Prices are integer TWD.
 */
import { sql } from 'drizzle-orm'
import {
  customType,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const STYLE_DIMENSIONS = 64

// ---------------------------------------------------------------------------
// Enum values
// ---------------------------------------------------------------------------

export const DEPARTMENT_VALUES = ['women', 'men', 'unisex', 'kids'] as const
export const SIZE_SYSTEM_VALUES = ['alpha', 'numeric-waist', 'eu-shoe', 'one-size'] as const
export const BRAND_TIER_VALUES = ['budget', 'mid', 'premium', 'luxury'] as const
export const LOOK_KIND_VALUES = ['edition', 'remix', 'together'] as const
export const IMAGE_STATUS_VALUES = ['pending', 'ready', 'failed'] as const
export const VISIBILITY_VALUES = ['private', 'link', 'public'] as const
export const PURCHASE_FOR_VALUES = ['self', 'other', 'undisclosed'] as const
export const ASK_KIND_VALUES = ['choose', 'style_me'] as const
export const ASK_STATUS_VALUES = ['open', 'answered', 'closed'] as const
export const INTERACTION_TYPE_VALUES = [
  'VIEW',
  'SEARCH',
  'SAVE',
  'DISMISS',
  'SHARE',
  'REACT',
  'ASK',
  'ADVISE',
  'STYLE',
  'REMIX',
  'TOGETHER',
  'INSPIRE',
  'LOOK_CREATE',
  'PURCHASE',
  'BUY_FOR',
] as const
export const FEEDBACK_KIND_VALUES = [
  'impression',
  'click',
  'save',
  'dismiss',
  'add_to_bag',
  'purchase',
  'ask_choice',
  'remix',
  'look_create',
] as const
export const RELATIONSHIP_KIND_VALUES = [
  'asks',
  'trusts',
  'inspired_by',
  'styles',
  'buys_for',
  'shops_with',
  'remixed',
] as const
export const TREND_DIMENSION_VALUES = [
  'aesthetic',
  'category',
  'color',
  'silhouette',
  'aesthetic_category',
] as const
export const LLM_PROVIDER_VALUES = ['gemini', 'openai', 'offline'] as const
/** Intent sessions also record `jev`, the closed-option decision service. Plain TEXT, no CHECK. */
export const INTENT_PROVIDER_VALUES = [...LLM_PROVIDER_VALUES, 'jev'] as const

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

/** `now()` in integer milliseconds; portable across SQLite builds (no `unixepoch('subsec')`). */
export const SQL_NOW_MS = sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' })
const createdAt = (name = 'created_at') => timestamp(name).notNull().default(SQL_NOW_MS)
const boolean = (name: string) => integer(name, { mode: 'boolean' })
const stringList = (name: string) =>
  text(name, { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`)
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>()

/** 64-d style vector stored as a JSON array with 6 decimals (`null` stays `null`). */
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'text'
  },
  toDriver(value: number[]): string {
    return `[${value.map((x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : 0)).join(',')}]`
  },
  fromDriver(value: string): number[] {
    if (typeof value !== 'string') return value as unknown as number[]
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((x) => (typeof x === 'number' ? x : Number(x))) : []
  },
})

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const brands = sqliteTable(
  'brands',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    tier: text('tier', { enum: BRAND_TIER_VALUES }).notNull(),
    homeAesthetics: stringList('home_aesthetics'),
    homeDepartments: stringList('home_departments'),
    priceMultiplier: real('price_multiplier').notNull().default(1),
    origin: text('origin'),
    description: text('description'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('brands_slug_idx').on(t.slug)],
)

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull(),
    brandId: integer('brand_id')
      .notNull()
      .references(() => brands.id),
    name: text('name').notNull(),
    description: text('description').notNull(),
    department: text('department', { enum: DEPARTMENT_VALUES }).notNull(),
    categoryGroup: text('category_group').notNull(),
    category: text('category').notNull(),
    subcategory: text('subcategory').notNull(),
    silhouetteId: text('silhouette_id').notNull(),
    colorName: text('color_name').notNull(),
    colorHex: text('color_hex').notNull(),
    colorFamily: text('color_family').notNull(),
    secondaryColorHex: text('secondary_color_hex'),
    pattern: text('pattern').notNull(),
    material: text('material').notNull(),
    fit: text('fit'),
    silhouette: text('silhouette'),
    length: text('length'),
    neckline: text('neckline'),
    sleeve: text('sleeve'),
    closure: text('closure'),
    occasions: stringList('occasions'),
    seasons: stringList('seasons'),
    aesthetics: stringList('aesthetics'),
    attributes: json<Record<string, string | number | boolean>>('attributes')
      .notNull()
      .default(sql`'{}'`),
    styleVector: vector('style_vector').notNull(),
    price: integer('price').notNull(),
    tier: text('tier', { enum: BRAND_TIER_VALUES }).notNull(),
    sizeSystem: text('size_system', { enum: SIZE_SYSTEM_VALUES }).notNull(),
    sizes: stringList('sizes'),
    stock: integer('stock').notNull().default(0),
    rating: real('rating').notNull().default(0),
    reviewCount: integer('review_count').notNull().default(0),
    popularity: real('popularity').notNull().default(0),
    trendScore: real('trend_score').notNull().default(0),
    heroImageUrl: text('hero_image_url'),
    imageSeed: integer('image_seed').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('products_slug_idx').on(t.slug),
    index('products_brand_idx').on(t.brandId),
    index('products_department_idx').on(t.department),
    index('products_category_group_idx').on(t.categoryGroup),
    index('products_subcategory_idx').on(t.subcategory),
    index('products_price_idx').on(t.price),
    index('products_dept_group_price_idx').on(t.department, t.categoryGroup, t.price),
    index('products_popularity_idx').on(t.popularity),
  ],
)

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    avatarSeed: integer('avatar_seed').notNull().default(0),
    isGuest: boolean('is_guest').notNull().default(false),
    isPersona: boolean('is_persona').notNull().default(false),
    bio: text('bio'),
    department: text('department', { enum: DEPARTMENT_VALUES }).notNull().default('unisex'),
    sizes: json<Record<string, string>>('sizes')
      .notNull()
      .default(sql`'{}'`),
    budgetHint: integer('budget_hint'),
    preferenceVector: vector('preference_vector'),
    giftPreferenceVector: vector('gift_preference_vector'),
    tasteCluster: integer('taste_cluster'),
    socialCluster: integer('social_cluster'),
    /** R2 object key of the owner's reference photo (`photos/<userId>.<ext>`). */
    photoPath: text('photo_path'),
    createdAt: createdAt(),
    lastSeenAt: createdAt('last_seen_at'),
  },
  (t) => [
    uniqueIndex('users_handle_idx').on(t.handle),
    index('users_taste_cluster_idx').on(t.tasteCluster),
    index('users_social_cluster_idx').on(t.socialCluster),
  ],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

// ---------------------------------------------------------------------------
// Commerce
// ---------------------------------------------------------------------------

export const purchases = sqliteTable(
  'purchases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull().default(1),
    price: integer('price').notNull(),
    size: text('size'),
    forKind: text('for_kind', { enum: PURCHASE_FOR_VALUES }).notNull().default('undisclosed'),
    forUserId: text('for_user_id').references(() => users.id),
    forLabel: text('for_label'),
    sourceLookId: text('source_look_id'),
    sourceAskId: text('source_ask_id'),
    sourceInteractionId: text('source_interaction_id'),
    intentSessionId: text('intent_session_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('purchases_user_idx').on(t.userId),
    index('purchases_product_idx').on(t.productId),
    index('purchases_source_look_idx').on(t.sourceLookId),
    index('purchases_created_idx').on(t.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// Looks — the social object
// ---------------------------------------------------------------------------

export const looks = sqliteTable(
  'looks',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind', { enum: LOOK_KIND_VALUES }).notNull().default('edition'),
    title: text('title').notNull(),
    stylePreset: text('style_preset').notNull(),
    prompt: text('prompt'),
    /** R2 object key of the rendered image (`looks/<id>-<generation>.png`); null = poster. */
    imagePath: text('image_path'),
    imageStatus: text('image_status', { enum: IMAGE_STATUS_VALUES }).notNull().default('pending'),
    imageProvider: text('image_provider', { enum: LLM_PROVIDER_VALUES }),
    imageGenerationId: text('image_generation_id'),
    imageStartedAt: timestamp('image_started_at'),
    imageError: text('image_error'),
    aesthetics: stringList('aesthetics'),
    palette: stringList('palette'),
    styleVector: vector('style_vector'),
    occasion: text('occasion'),
    parentLookId: text('parent_look_id'),
    rootLookId: text('root_look_id'),
    depth: integer('depth').notNull().default(0),
    visibility: text('visibility', { enum: VISIBILITY_VALUES }).notNull().default('private'),
    shareToken: text('share_token').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('looks_owner_idx').on(t.ownerId),
    index('looks_parent_idx').on(t.parentLookId),
    index('looks_root_idx').on(t.rootLookId),
    index('looks_created_idx').on(t.createdAt),
    uniqueIndex('looks_share_token_idx').on(t.shareToken),
  ],
)

export const lookProducts = sqliteTable(
  'look_products',
  {
    lookId: text('look_id')
      .notNull()
      .references(() => looks.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    role: text('role'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.lookId, t.productId] }),
    index('look_products_product_idx').on(t.productId),
  ],
)

export const lookParticipants = sqliteTable(
  'look_participants',
  {
    lookId: text('look_id')
      .notNull()
      .references(() => looks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    sourceLookId: text('source_look_id'),
  },
  (t) => [
    primaryKey({ columns: [t.lookId, t.userId] }),
    index('look_participants_user_idx').on(t.userId),
  ],
)

// ---------------------------------------------------------------------------
// Social primitives
// ---------------------------------------------------------------------------

export const asks = sqliteTable(
  'asks',
  {
    id: text('id').primaryKey(),
    askerId: text('asker_id')
      .notNull()
      .references(() => users.id),
    targetUserId: text('target_user_id').references(() => users.id),
    kind: text('kind', { enum: ASK_KIND_VALUES }).notNull(),
    question: text('question').notNull(),
    optionProductIds: text('option_product_ids', { mode: 'json' })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    lookId: text('look_id').references(() => looks.id),
    budget: integer('budget'),
    occasion: text('occasion'),
    shareToken: text('share_token').notNull(),
    status: text('status', { enum: ASK_STATUS_VALUES }).notNull().default('open'),
    createdAt: createdAt(),
  },
  (t) => [
    index('asks_asker_idx').on(t.askerId),
    index('asks_target_idx').on(t.targetUserId),
    uniqueIndex('asks_share_token_idx').on(t.shareToken),
  ],
)

export const askResponses = sqliteTable(
  'ask_responses',
  {
    id: text('id').primaryKey(),
    askId: text('ask_id')
      .notNull()
      .references(() => asks.id, { onDelete: 'cascade' }),
    responderUserId: text('responder_user_id').references(() => users.id),
    responderName: text('responder_name'),
    choiceProductId: integer('choice_product_id').references(() => products.id),
    styledLookId: text('styled_look_id').references(() => looks.id),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ask_responses_ask_idx').on(t.askId),
    index('ask_responses_responder_idx').on(t.responderUserId),
  ],
)

export const interactions = sqliteTable(
  'interactions',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    targetUserId: text('target_user_id').references(() => users.id),
    lookId: text('look_id').references(() => looks.id, { onDelete: 'cascade' }),
    productId: integer('product_id').references(() => products.id),
    askId: text('ask_id').references(() => asks.id, { onDelete: 'cascade' }),
    type: text('type', { enum: INTERACTION_TYPE_VALUES }).notNull(),
    payload: json<Record<string, unknown>>('payload')
      .notNull()
      .default(sql`'{}'`),
    sourceInteractionId: text('source_interaction_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('interactions_actor_idx').on(t.actorUserId),
    index('interactions_target_idx').on(t.targetUserId),
    index('interactions_look_idx').on(t.lookId),
    index('interactions_product_idx').on(t.productId),
    index('interactions_type_idx').on(t.type),
    index('interactions_created_idx').on(t.createdAt),
  ],
)

/** Derived from interactions by the graph engine. Directed: a → b. */
export const relationships = sqliteTable(
  'relationships',
  {
    aUserId: text('a_user_id')
      .notNull()
      .references(() => users.id),
    bUserId: text('b_user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind', { enum: RELATIONSHIP_KIND_VALUES }).notNull(),
    weight: real('weight').notNull().default(0),
    count: integer('count').notNull().default(0),
    lastAt: timestamp('last_at').notNull(),
    computedAt: createdAt('computed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.aUserId, t.bUserId, t.kind] }),
    index('relationships_b_idx').on(t.bUserId),
    index('relationships_kind_idx').on(t.kind),
  ],
)

// ---------------------------------------------------------------------------
// Engines: intent, feedback, preference
// ---------------------------------------------------------------------------

export const intentSessions = sqliteTable(
  'intent_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    utterance: text('utterance').notNull(),
    locale: text('locale'),
    intent: json<Record<string, unknown>>('intent').notNull(),
    intentVector: vector('intent_vector'),
    results: json<Record<string, unknown>>('results')
      .notNull()
      .default(sql`'{}'`),
    provider: text('provider', { enum: INTENT_PROVIDER_VALUES }).notNull().default('offline'),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('intent_sessions_user_idx').on(t.userId),
    index('intent_sessions_created_idx').on(t.createdAt),
  ],
)

export const feedbackEvents = sqliteTable(
  'feedback_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    productId: integer('product_id').references(() => products.id),
    lookId: text('look_id').references(() => looks.id, { onDelete: 'set null' }),
    intentSessionId: text('intent_session_id'),
    kind: text('kind', { enum: FEEDBACK_KIND_VALUES }).notNull(),
    reward: real('reward').notNull().default(0),
    position: integer('position'),
    forOthers: boolean('for_others').notNull().default(false),
    context: json<Record<string, unknown>>('context')
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
  },
  (t) => [
    index('feedback_events_user_idx').on(t.userId),
    index('feedback_events_product_idx').on(t.productId),
    index('feedback_events_created_idx').on(t.createdAt),
    index('feedback_events_session_idx').on(t.intentSessionId),
  ],
)

export const preferenceSnapshots = sqliteTable(
  'preference_snapshots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    version: integer('version').notNull(),
    vector: vector('vector').notNull(),
    topAesthetics: json<
      Array<{ aesthetic: string; weight: number; confidence: number; evidence: string[] }>
    >('top_aesthetics')
      .notNull()
      .default(sql`'[]'`),
    metrics: json<Record<string, number>>('metrics')
      .notNull()
      .default(sql`'{}'`),
    eventCount: integer('event_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('preference_snapshots_user_idx').on(t.userId, t.version)],
)

/**
 * Cache of the global LinUCB bandit state (single row `id = 'global'`). The state is a pure
 * function of `feedback_events`, so the engine can rebuild it by replay when the row is missing.
 */
export const banditState = sqliteTable('bandit_state', {
  id: text('id').primaryKey(),
  payload: json<Record<string, unknown>>('payload').notNull(),
  updatedAt: createdAt('updated_at'),
})

// ---------------------------------------------------------------------------
// Trend analytics
// ---------------------------------------------------------------------------

export const lineageStats = sqliteTable('lineage_stats', {
  rootLookId: text('root_look_id')
    .primaryKey()
    .references(() => looks.id, { onDelete: 'cascade' }),
  depth: integer('depth').notNull().default(0),
  nodes: integer('nodes').notNull().default(1),
  uniquePeople: integer('unique_people').notNull().default(1),
  clustersReached: integer('clusters_reached').notNull().default(1),
  shares: integer('shares').notNull().default(0),
  asks: integer('asks').notNull().default(0),
  remixes: integer('remixes').notNull().default(0),
  purchases: integer('purchases').notNull().default(0),
  gmv: integer('gmv').notNull().default(0),
  velocity: real('velocity').notNull().default(0),
  shareToRemixRate: real('share_to_remix_rate').notNull().default(0),
  remixToPurchaseRate: real('remix_to_purchase_rate').notNull().default(0),
  firstAt: timestamp('first_at').notNull(),
  lastAt: timestamp('last_at').notNull(),
  computedAt: createdAt('computed_at'),
})

export const trendSignals = sqliteTable(
  'trend_signals',
  {
    id: text('id').primaryKey(),
    /** ISO calendar day `YYYY-MM-DD` (UTC). */
    day: text('day').notNull(),
    dimension: text('dimension', { enum: TREND_DIMENSION_VALUES }).notNull(),
    key: text('key').notNull(),
    volume: integer('volume').notNull().default(0),
    velocity: real('velocity').notNull().default(0),
    crossCluster: real('cross_cluster').notNull().default(0),
    conversion: real('conversion').notNull().default(0),
    gmv: integer('gmv').notNull().default(0),
    momentum: real('momentum').notNull().default(0),
    emerging: boolean('emerging').notNull().default(false),
    evidence: json<Record<string, unknown>>('evidence')
      .notNull()
      .default(sql`'{}'`),
    computedAt: createdAt('computed_at'),
  },
  (t) => [
    uniqueIndex('trend_signals_day_dim_key_idx').on(t.day, t.dimension, t.key),
    index('trend_signals_dim_key_idx').on(t.dimension, t.key),
    index('trend_signals_momentum_idx').on(t.momentum),
  ],
)

export const manufacturingRecommendations = sqliteTable(
  'manufacturing_recommendations',
  {
    id: text('id').primaryKey(),
    rank: integer('rank').notNull(),
    aesthetic: text('aesthetic').notNull(),
    categoryGroup: text('category_group').notNull(),
    subcategory: text('subcategory'),
    colorFamily: text('color_family'),
    momentum: real('momentum').notNull().default(0),
    confidence: real('confidence').notNull().default(0),
    projectedDemand: integer('projected_demand').notNull().default(0),
    rationale: text('rationale').notNull(),
    evidence: json<Record<string, unknown>>('evidence')
      .notNull()
      .default(sql`'{}'`),
    computedAt: createdAt('computed_at'),
  },
  (t) => [index('manufacturing_recommendations_rank_idx').on(t.rank)],
)

// ---------------------------------------------------------------------------
// Simulation & evaluation (kept in the same database so the UI can show them)
// ---------------------------------------------------------------------------

export const simPersonas = sqliteTable('sim_personas', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  hiddenVector: vector('hidden_vector').notNull(),
  giftHiddenVector: vector('gift_hidden_vector'),
  socialCluster: integer('social_cluster').notNull(),
  params: json<Record<string, unknown>>('params')
    .notNull()
    .default(sql`'{}'`),
})

export const evaluationRuns = sqliteTable(
  'evaluation_runs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    config: json<Record<string, unknown>>('config')
      .notNull()
      .default(sql`'{}'`),
    summary: json<Record<string, unknown>>('summary')
      .notNull()
      .default(sql`'{}'`),
    series: json<Array<Record<string, number>>>('series')
      .notNull()
      .default(sql`'[]'`),
    createdAt: createdAt(),
  },
  (t) => [index('evaluation_runs_created_idx').on(t.createdAt)],
)

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type Brand = typeof brands.$inferSelect
export type NewBrand = typeof brands.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type Purchase = typeof purchases.$inferSelect
export type NewPurchase = typeof purchases.$inferInsert
export type Look = typeof looks.$inferSelect
export type NewLook = typeof looks.$inferInsert
export type LookProduct = typeof lookProducts.$inferSelect
export type LookParticipant = typeof lookParticipants.$inferSelect
export type Ask = typeof asks.$inferSelect
export type NewAsk = typeof asks.$inferInsert
export type AskResponse = typeof askResponses.$inferSelect
export type Interaction = typeof interactions.$inferSelect
export type NewInteraction = typeof interactions.$inferInsert
export type Relationship = typeof relationships.$inferSelect
export type IntentSession = typeof intentSessions.$inferSelect
export type NewIntentSession = typeof intentSessions.$inferInsert
export type FeedbackEvent = typeof feedbackEvents.$inferSelect
export type NewFeedbackEvent = typeof feedbackEvents.$inferInsert
export type PreferenceSnapshot = typeof preferenceSnapshots.$inferSelect
export type LineageStat = typeof lineageStats.$inferSelect
export type TrendSignal = typeof trendSignals.$inferSelect
export type ManufacturingRecommendation = typeof manufacturingRecommendations.$inferSelect
export type SimPersona = typeof simPersonas.$inferSelect
export type EvaluationRun = typeof evaluationRuns.$inferSelect

export type Department = (typeof DEPARTMENT_VALUES)[number]
export type SizeSystem = (typeof SIZE_SYSTEM_VALUES)[number]
export type BrandTier = (typeof BRAND_TIER_VALUES)[number]
export type LookKind = (typeof LOOK_KIND_VALUES)[number]
export type Visibility = (typeof VISIBILITY_VALUES)[number]
export type PurchaseFor = (typeof PURCHASE_FOR_VALUES)[number]
export type AskKind = (typeof ASK_KIND_VALUES)[number]
export type InteractionType = (typeof INTERACTION_TYPE_VALUES)[number]
export type FeedbackKind = (typeof FEEDBACK_KIND_VALUES)[number]
export type RelationshipKind = (typeof RELATIONSHIP_KIND_VALUES)[number]
export type TrendDimension = (typeof TREND_DIMENSION_VALUES)[number]
export type LlmProvider = (typeof LLM_PROVIDER_VALUES)[number]
export type IntentProvider = (typeof INTENT_PROVIDER_VALUES)[number]
