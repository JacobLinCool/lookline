/**
 * Lookline database schema — the single source of truth for every table (SQLite / Cloudflare D1).
 * See docs/ARCHITECTURE.md (contract) and docs/DATA_MODEL.md (semantics).
 *
 * Conventions
 * - `articles` is keyed by H&M's own zero-padded `article_id`; `brands` keeps an integer key.
 * - App entities use text primary keys (deterministic ids from the simulation, nanoid at runtime).
 * - Enums are `text` columns constrained by the `*_VALUES` tuples below.
 * - Arrays and objects are JSON text (`mode: 'json'`); every 64-d vector is a JSON array following
 *   the style-space layout in docs/ARCHITECTURE.md (`product_vectors` keeps a normalised copy of
 *   `articles.style_vector` spread over 64 REAL columns for cosine ranking in SQL — see
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
/**
 * Which slot of an outfit an article occupies — a position, not a use. Resolved by @lookline/hm
 * from `product_group_name` and `product_type_name`, because H&M files both layers of the upper
 * body under one group and shelves jewelry and bags under `Accessories`.
 *
 * Sportswear and tailoring are deliberately absent: a running top still occupies the `top` slot
 * and a blazer still occupies `outer`. Those are read off `index_group_name = 'Sport'` and
 * `product_type_name` instead, so an outfit can be built from them like any other garment.
 */
/**
 * The vocabulary the intent parser speaks: every value has a Chinese label in @lookline/catalog's
 * lexicon, which is how "西裝" or "運動服" reaches the catalogue. Derived from the outfit role
 * plus `index_group_name` (Sport) and `product_type_name` (Blazer), because H&M files sportswear
 * and tailoring under groups that name the body part rather than the occasion.
 */
export const CATEGORY_GROUP_VALUES = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'footwear',
  'bags',
  'accessories',
  'jewelry',
  'activewear',
  'swimwear',
  'loungewear',
  'tailoring',
] as const

export const OUTFIT_ROLE_VALUES = [
  'top',
  'bottom',
  'outer',
  'full-body',
  'shoes',
  'bag',
  'accessory',
  'jewelry',
  'underwear',
  'nightwear',
  'swimwear',
  'socks',
  'set',
  'non-apparel',
] as const
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

/**
 * One purchasable article, mirroring H&M's `articles.csv` (105 542 rows). Raw columns keep the
 * dataset's own names so an import is a straight copy. `article_id` is text because every id is
 * zero-padded to ten characters (`0108775015`) and the R2 image key is derived from it —
 * `images/<first three characters>/<article_id>.jpg`. `product_code` is its first seven characters
 * and groups the colourways of one garment, which is what recommendations deduplicate on.
 *
 * SQL column names are the dataset's own, so a row maps one-to-one onto `articles.csv`. The TS
 * property names stay with the vocabulary the rest of the codebase already speaks — `intent` has
 * its own `colorFamily` and `categoryGroup`, and renaming the article side to match H&M would
 * collide with them for no gain. `category_group` holds the outfit role, which is the finer
 * signal: H&M's own `product_group_name` cannot tell a jacket from the t-shirt underneath.
 *
 * Derived columns follow the raw ones: `outfit_role` and `department` are table lookups over
 * columns the dataset ships (see @lookline/hm), never inferred by a model. `occasions`,
 * `aesthetics` and `style_vector` have no source column at all and stay empty until a semantic
 * pass fills them.
 *
 * The sales columns are aggregated offline from `transactions_train.csv`; those 31.8M rows stay in
 * the local database and never reach D1.
 */
export const articles = sqliteTable(
  'articles',
  {
    // --- articles.csv, verbatim ---
    /** H&M's own `article_id`, zero-padded to ten characters (`0108775015`). */
    id: text('article_id').primaryKey(),
    /** The dataset is one retailer, so every row points at the single H&M brand. */
    brandId: integer('brand_id')
      .notNull()
      .references(() => brands.id),
    productCode: text('product_code').notNull(),
    name: text('prod_name').notNull(),
    /** Free-text product copy; missing on 416 rows. */
    description: text('detail_desc').notNull().default(''),
    subcategory: text('product_type_name').notNull(),
    productGroup: text('product_group_name').notNull(),
    /** Fabric and construction (`Jersey Basic`, `Knitwear`, `Trousers Denim`). */
    category: text('garment_group_name').notNull().default(''),
    /** Merchandising shelf (`Womens Everyday Basics`), useful for style clustering. */
    section: text('section_name').notNull().default(''),
    /** The dataset's only size signal: child rows read `Children Sizes 92-140`. */
    indexName: text('index_name').notNull(),
    /** The dataset's only gender signal; `customers.csv` has none. */
    indexGroupName: text('index_group_name').notNull(),
    pattern: text('graphical_appearance_name').notNull().default(''),
    colorName: text('colour_group_name').notNull().default(''),
    colorFamily: text('perceived_colour_master_name').notNull().default(''),
    colorValue: text('perceived_colour_value_name').notNull().default(''),
    // --- derived by @lookline/hm ---
    categoryGroup: text('category_group', { enum: CATEGORY_GROUP_VALUES }).notNull(),
    /** The finer split: `outerwear` and `tops` both answer "upper body", this answers which layer. */
    outfitRole: text('outfit_role', { enum: OUTFIT_ROLE_VALUES }).notNull(),
    department: text('department', { enum: DEPARTMENT_VALUES }).notNull(),
    slug: text('slug').notNull(),
    /** The dataset ships colour names only, and a swatch needs a colour. */
    colorHex: text('colour_hex').notNull().default('#9E9E9E'),
    sizeSystem: text('size_system', { enum: SIZE_SYSTEM_VALUES }).notNull(),
    sizes: stringList('sizes'),
    /** R2 object key. Null for the articles that ship without a photo. */
    imagePath: text('image_path'),
    // --- aggregated from transactions_train.csv ---
    /** TWD, calibrated per product type from the dataset's normalised price. */
    price: integer('price').notNull().default(0),
    tier: text('tier', { enum: BRAND_TIER_VALUES }).notNull().default('mid'),
    salesCount: integer('sales_count').notNull().default(0),
    firstSoldAt: integer('first_sold_at', { mode: 'timestamp_ms' }),
    lastSoldAt: integer('last_sold_at', { mode: 'timestamp_ms' }),
    /** Share of sales through `sales_channel_id = 2`. */
    onlineRatio: real('online_ratio').notNull().default(0),
    popularity: real('popularity').notNull().default(0),
    trendScore: real('trend_score').notNull().default(0),
    // --- no source column in the dataset ---
    // H&M ships none of these. The garment ones are recoverable from `detail_desc` ("in soft
    // cotton jersey with a round neckline"), `seasons` from the months an article actually sells
    // in, and `occasions` / `aesthetics` / `style_vector` need a semantic pass. They are declared
    // so the ranking and the product page keep working while each is still empty — and they are
    // not null but empty, because to every ranking factor "no value" and "empty" are the same
    // thing, and a nullable column would put a null check in each one for nothing.
    material: text('material').notNull().default(''),
    fit: text('fit').notNull().default(''),
    silhouette: text('silhouette').notNull().default(''),
    silhouetteId: text('silhouette_id').notNull().default(''),
    length: text('length').notNull().default(''),
    neckline: text('neckline').notNull().default(''),
    sleeve: text('sleeve').notNull().default(''),
    closure: text('closure').notNull().default(''),
    secondaryColorHex: text('secondary_color_hex'),
    seasons: stringList('seasons'),
    occasions: stringList('occasions'),
    aesthetics: stringList('aesthetics'),
    attributes: json<Record<string, string | number | boolean>>('attributes')
      .notNull()
      .default(sql`'{}'`),
    /** All zeroes until a semantic pass encodes the 64 dimensions. */
    styleVector: vector('style_vector').notNull(),
    /**
     * The dataset has no inventory. Everything is in stock so the "can I actually buy this"
     * filter keeps its shape; swap in a real feed if one ever arrives.
     */
    stock: integer('stock').notNull().default(1),
    /** No review data in the dataset either. */
    rating: real('rating').notNull().default(0),
    reviewCount: integer('review_count').notNull().default(0),
    imageSeed: integer('image_seed').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('articles_slug_idx').on(t.slug),
    index('articles_brand_idx').on(t.brandId),
    index('articles_product_code_idx').on(t.productCode),
    index('articles_department_idx').on(t.department),
    index('articles_category_group_idx').on(t.categoryGroup),
    index('articles_outfit_role_idx').on(t.outfitRole),
    index('articles_product_type_idx').on(t.subcategory),
    index('articles_price_idx').on(t.price),
    index('articles_dept_group_price_idx').on(t.department, t.categoryGroup, t.price),
    index('articles_popularity_idx').on(t.popularity),
  ],
)

/**
 * What gets bought together, at product-type level, from 31.8M transactions. A basket is the
 * distinct product types one customer bought on one day — the dataset's own note says duplicate
 * rows are several units of one item, not a pairing.
 *
 * `lift` above 1 means the pair occurs more often than two unrelated types would: raw counts only
 * rank by popularity, while lift is what separates a pairing from a coincidence (Braces + Tie
 * lifts 305×, Tailored Waistcoat + Tie 100×). Article-level pairs would be hundreds of millions
 * of rows; product types are 3230 after a floor of 50 co-purchases.
 */
export const typeAffinity = sqliteTable(
  'type_affinity',
  {
    typeA: text('type_a').notNull(),
    typeB: text('type_b').notNull(),
    together: integer('together').notNull(),
    lift: real('lift').notNull(),
  },
  (t) => [primaryKey({ columns: [t.typeA, t.typeB] }), index('type_affinity_lift_idx').on(t.lift)],
)

/**
 * H&M's own 1 371 980 customers, with the per-customer aggregates of their purchases. The 31.8M
 * transaction rows stay offline; these are what a preference baseline is measured against.
 *
 * Separate from `users`, which is this app's accounts — these people never signed in here.
 */
export const hmCustomers = sqliteTable(
  'hm_customers',
  {
    id: text('customer_id').primaryKey(),
    /** Missing on 15 861 rows. */
    age: integer('age'),
    clubMemberStatus: text('club_member_status'),
    fashionNewsFrequency: text('fashion_news_frequency'),
    /** Hashed, so it locates nobody — but people sharing one live near each other. */
    postalCode: text('postal_code'),
    subscribesNews: integer('subscribes_news', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(false),
    purchases: integer('purchases').notNull().default(0),
    /** TWD, at the same scale as `articles.price`. */
    spend: integer('spend').notNull().default(0),
    firstBuyAt: integer('first_buy_at', { mode: 'timestamp_ms' }),
    lastBuyAt: integer('last_buy_at', { mode: 'timestamp_ms' }),
    onlineRatio: real('online_ratio').notNull().default(0),
    /** The dataset ships no gender. This is the index group they bought from most. */
    topIndexGroup: text('top_index_group'),
    topProductGroup: text('top_product_group'),
  },
  (t) => [
    index('hm_customers_purchases_idx').on(t.purchases),
    index('hm_customers_age_idx').on(t.age),
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
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id),
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
    index('purchases_article_idx').on(t.articleId),
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
    /** All zeroes until a semantic pass encodes the 64 dimensions. */
    styleVector: vector('style_vector').notNull(),
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

export const lookArticles = sqliteTable(
  'look_articles',
  {
    lookId: text('look_id')
      .notNull()
      .references(() => looks.id, { onDelete: 'cascade' }),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id),
    role: text('role'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.lookId, t.articleId] }),
    index('look_articles_article_idx').on(t.articleId),
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
    optionArticleIds: text('option_article_ids', { mode: 'json' })
      .$type<string[]>()
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
    choiceArticleId: text('choice_article_id').references(() => articles.id),
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
    articleId: text('article_id').references(() => articles.id),
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
    index('interactions_article_idx').on(t.articleId),
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
    provider: text('provider', { enum: LLM_PROVIDER_VALUES }).notNull().default('offline'),
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
    articleId: text('article_id').references(() => articles.id),
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
    index('feedback_events_article_idx').on(t.articleId),
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
export type Article = typeof articles.$inferSelect
export type TypeAffinity = typeof typeAffinity.$inferSelect
export type NewTypeAffinity = typeof typeAffinity.$inferInsert
export type HmCustomer = typeof hmCustomers.$inferSelect
export type NewHmCustomer = typeof hmCustomers.$inferInsert
export type NewArticle = typeof articles.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type Purchase = typeof purchases.$inferSelect
export type NewPurchase = typeof purchases.$inferInsert
export type Look = typeof looks.$inferSelect
export type NewLook = typeof looks.$inferInsert
export type LookArticle = typeof lookArticles.$inferSelect
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
export type OutfitRole = (typeof OUTFIT_ROLE_VALUES)[number]
export type CategoryGroup = (typeof CATEGORY_GROUP_VALUES)[number]
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
