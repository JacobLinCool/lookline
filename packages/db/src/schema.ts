/**
 * Lookline database schema — the single source of truth for every table (SQLite / Cloudflare D1).
 * See docs/ARCHITECTURE.md (contract) and docs/DATA_MODEL.md (semantics).
 *
 * Conventions
 * - `articles` is keyed by H&M's own zero-padded `article_id`; `brands` keeps an integer key.
 * - App entities use text primary keys (deterministic ids from the simulation, nanoid at runtime).
 * - Enums are `text` columns constrained by the `*_VALUES` tuples below.
 * - Arrays and objects are JSON text (`mode: 'json'`); every 64-d vector is a JSON array following
 *   the style-space layout in docs/ARCHITECTURE.md (`article_vectors` keeps a normalised copy of
 *   `articles.style_vector` spread over 64 REAL columns for cosine ranking in SQL — see
 *   `vectors.ts`, `drizzle/0001_vectors_fts.sql` and `drizzle/0003_vision.sql`).
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
  /** A design detail: a ruffle, a cable knit, a slit. What a factory actually cuts. */
  'detail',
  /** What a print depicts, clustered by `motifKey`. The fastest-moving dimension there is. */
  'motif',
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
 * columns the dataset ships (see @lookline/hm), never inferred by a model. `occasions`, `seasons`,
 * `material` and the garment details are recovered from `section_name`, the selling months and
 * `detail_desc`.
 *
 * Columns the dataset cannot fill are not declared: it ships no inventory, no reviews, no sizes
 * and no aesthetic, and a column holding one constant on every row is noise that ranking and
 * retrieval would have to step around. They go back in when something can fill them.
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
    /** H&M's own label: `Solid`, `All over pattern`, `Stripe`. 30 values, theirs, untouched. */
    graphicalAppearance: text('graphical_appearance_name').notNull().default(''),
    colorName: text('colour_group_name').notNull().default(''),
    colorMaster: text('perceived_colour_master_name').notNull().default(''),
    colorValue: text('perceived_colour_value_name').notNull().default(''),
    // --- derived by @lookline/hm ---
    /**
     * The catalog's twelve families, derived from `perceived_colour_master_name` by
     * @lookline/hm. H&M's nineteen masters are its own vocabulary (`Black`, `Khaki green`);
     * every filter, facet and intent constraint speaks the catalog's (`black`, `green`), and
     * a column named for one holding the other matches nothing at all.
     */
    colorFamily: text('colour_family').notNull().default(''),
    categoryGroup: text('category_group', { enum: CATEGORY_GROUP_VALUES }).notNull(),
    /** The finer split: `outerwear` and `tops` both answer "upper body", this answers which layer. */
    outfitRole: text('outfit_role', { enum: OUTFIT_ROLE_VALUES }).notNull(),
    department: text('department', { enum: DEPARTMENT_VALUES }).notNull(),
    slug: text('slug').notNull(),
    /** The dataset ships colour names only, and a swatch needs a colour. */
    colorHex: text('colour_hex').notNull().default('#9E9E9E'),
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
    // Recovered from `detail_desc` ("in soft cotton jersey with a round neckline") and, for
    // `seasons`, from the months an article actually sells in. Empty rather than null: to every
    // ranking factor "no value" and "empty" are the same thing, and a nullable column would put a
    // null check in each one for nothing.
    material: text('material').notNull().default(''),
    fit: text('fit').notNull().default(''),
    length: text('length').notNull().default(''),
    neckline: text('neckline').notNull().default(''),
    sleeve: text('sleeve').notNull().default(''),
    closure: text('closure').notNull().default(''),
    // Written by the vision pass (`pnpm --filter @lookline/hm vision`), which is also the only
    // thing that can fill `aesthetics` — the photograph is where a style lives, never the copy.
    /** Up to three catalog aesthetic slugs, strongest first. The weights live in `styleVector`. */
    aesthetics: stringList('aesthetics'),
    silhouette: text('silhouette').notNull().default(''),
    /** What the print depicts (`slogan`, `character`, `floral`…); `''` when the garment has none. */
    printSubject: text('print_subject').notNull().default(''),
    /**
     * The catalog's fifteen pattern slugs, read off the photograph. Derived beside H&M's own
     * `graphical_appearance_name` rather than over it: theirs files 17 145 garments as "All over
     * pattern" and calls a lace dress and a sequin dress the same thing, but it is the only
     * independent check there is on this one.
     */
    pattern: text('pattern').notNull().default(''),
    /** One sentence on how it looks; indexed by FTS so a vibe query has prose to match. */
    styleCaption: text('style_caption').notNull().default(''),
    /** The same sentence in Traditional Chinese. Searched through `searchZh`, not directly. */
    styleCaptionZh: text('style_caption_zh').notNull().default(''),
    /**
     * Every Chinese field with a space between each character, which is the only way `unicode61`
     * can tokenise it: a run of Han characters has nothing for it to split on, so the whole run
     * becomes one token and `麻花` finds none of the 679 captions that say it.
     */
    searchZh: text('search_zh').notNull().default(''),
    /** What the print depicts, in two to four words — clustered for trends, not filtered on. */
    printMotif: text('print_motif').notNull().default(''),
    /** The words printed on the garment, verbatim; `''` when it carries none. */
    printText: text('print_text').notNull().default(''),
    // Construction the photograph shows. `''` on a garment the question does not apply to: a bag
    // has no rise, a woven shirt has no gauge.
    rise: text('rise').notNull().default(''),
    shoulder: text('shoulder').notNull().default(''),
    pocketStyle: text('pocket_style').notNull().default(''),
    knitGauge: text('knit_gauge').notNull().default(''),
    padding: text('padding').notNull().default(''),
    /** Who it suits and when. Read by a recommendation's copy, never filtered on. */
    stylingNote: text('styling_note').notNull().default(''),
    stylingNoteZh: text('styling_note_zh').notNull().default(''),
    /** What in the photograph drove the tags, and how sure the model was of all of it. */
    visionEvidence: text('vision_evidence').notNull().default(''),
    visionConfidence: real('vision_confidence').notNull().default(0),
    seasons: stringList('seasons'),
    occasions: stringList('occasions'),
    attributes: json<Record<string, string | number | boolean>>('attributes')
      .notNull()
      .default(sql`'{}'`),
    /** Built at import from the article's own colour, axes and category group. */
    styleVector: vector('style_vector').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('articles_slug_idx').on(t.slug),
    index('articles_brand_idx').on(t.brandId),
    index('articles_product_code_idx').on(t.productCode),
    index('articles_department_idx').on(t.department),
    index('articles_category_group_idx').on(t.categoryGroup),
    index('articles_colour_family_idx').on(t.colorFamily),
    index('articles_outfit_role_idx').on(t.outfitRole),
    index('articles_product_type_idx').on(t.subcategory),
    index('articles_price_idx').on(t.price),
    index('articles_dept_group_price_idx').on(t.department, t.categoryGroup, t.price),
    index('articles_popularity_idx').on(t.popularity),
    index('articles_print_motif_idx').on(t.printMotif),
    index('articles_pattern_idx').on(t.pattern),
    index('articles_rise_idx').on(t.rise),
    index('articles_knit_gauge_idx').on(t.knitGauge),
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
 * What a multimodal model read off an article's photograph, kept verbatim.
 *
 * The derived columns on `articles` are materialised from `payload`, never written directly by the
 * run, so a prompt fix re-materialises without paying for the images again — and so a
 * recommendation can quote its evidence: the model saw an oversized cable knit in oatmeal, which
 * is why the article is tagged quiet-luxury. A different model writes a different `version` beside
 * the old one instead of silently replacing it.
 *
 * Every value inside `payload` comes from a closed @lookline/catalog vocabulary; the request's
 * JSON schema makes anything else unrepresentable rather than merely discouraged.
 */
export const articleVision = sqliteTable(
  'article_vision',
  {
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    /**
     * Which reading this is. `core` asks every article the seventeen general questions; a narrow
     * pass such as `print` asks a few more of the subset they apply to, where a field added to
     * `core` would have cost output tokens on all 105 220 and asked a handbag about its rise.
     */
    pass: text('pass').notNull().default('core'),
    model: text('model').notNull(),
    /** Prompt and vocabulary revision (`VISION_VERSION`), so a re-run is comparable. */
    version: text('version').notNull(),
    payload: json<Record<string, unknown>>('payload')
      .notNull()
      .default(sql`'{}'`),
    /** The model's own overall confidence, hoisted out of `payload` so it can be filtered on. */
    confidence: real('confidence').notNull().default(0),
    captionEn: text('caption_en').notNull().default(''),
    captionZh: text('caption_zh').notNull().default(''),
    /** The R2 key actually shown; null when the article has no photograph and text alone was used. */
    imageKey: text('image_key'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.pass] }),
    index('article_vision_pass_idx').on(t.pass, t.version),
    index('article_vision_confidence_idx').on(t.confidence),
  ],
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
    /** Derived from the Look's own pieces; all zeroes until it has any. */
    styleVector: vector('style_vector')
      .notNull()
      .$defaultFn(() => Array.from({ length: STYLE_DIMENSIONS }, () => 0)),
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
// Temporary previews — private, non-ownable images that expire before purchase
// ---------------------------------------------------------------------------

export const previews = sqliteTable(
  'previews',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceLookId: text('source_look_id').references(() => looks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    stylePreset: text('style_preset').notNull(),
    occasion: text('occasion'),
    referencePath: text('reference_path').notNull(),
    imagePath: text('image_path'),
    imageStatus: text('image_status', { enum: IMAGE_STATUS_VALUES }).notNull().default('pending'),
    imageProvider: text('image_provider', { enum: LLM_PROVIDER_VALUES }),
    imageGenerationId: text('image_generation_id'),
    imageStartedAt: timestamp('image_started_at'),
    imageError: text('image_error'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('previews_owner_idx').on(t.ownerId),
    index('previews_source_look_idx').on(t.sourceLookId),
    index('previews_expires_idx').on(t.expiresAt),
  ],
)

export const previewArticles = sqliteTable(
  'preview_articles',
  {
    previewId: text('preview_id')
      .notNull()
      .references(() => previews.id, { onDelete: 'cascade' }),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.previewId, t.articleId] }),
    index('preview_articles_article_idx').on(t.articleId),
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
// Personas, wardrobe entitlements, card credits and collectible cards
//
// Holding is never stored on a card. A card names the persona it belongs to and the persona names
// its current owner, so handing a persona to another account is one UPDATE of one row — which is
// the only way to move a whole set of cards atomically on a runtime with no transactions. Nothing
// here can end up half-transferred, because there is no second row to miss.
//
// What a card records about its own making — author, articles worn, ownership ratio, tier, number
// — is a snapshot taken at issue time and never rewritten when the persona changes hands.
// ---------------------------------------------------------------------------

/** A card's subject: a real person photographed, or an avatar. Not a login. */
export const PERSONA_KIND_VALUES = ['person', 'avatar'] as const
export const PERSONA_TRANSFER_STATE_VALUES = [
  'pending',
  'accepted',
  'cancelled',
  'expired',
] as const
/** Why a wardrobe article is available to a session: bought by this account, or lent by a friend. */
export const ENTITLEMENT_SOURCE_VALUES = ['purchase', 'loan'] as const
export const LOAN_STATE_VALUES = ['active', 'revoked'] as const
/**
 * Credit movements. `grant` follows a confirmed purchase line, `reserve` holds one for a session,
 * `settle` spends the held credit on a finished card, and `release` returns it when a session
 * produced nothing usable. Balance is the sum of every delta; nothing caches it.
 */
export const CREDIT_REASON_VALUES = ['grant', 'reserve', 'settle', 'release'] as const
export const CARD_SESSION_STATE_VALUES = ['open', 'settled', 'cancelled', 'expired'] as const
export const COLLECTION_INVITE_STATE_VALUES = ['pending', 'accepted', 'declined'] as const
export const GENERATION_STATE_VALUES = ['pending', 'succeeded', 'failed'] as const

export const personas = sqliteTable(
  'personas',
  {
    id: text('id').primaryKey(),
    /** Whoever may act for this persona right now. Transfers move this and nothing else. */
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    displayName: text('display_name').notNull(),
    kind: text('kind', { enum: PERSONA_KIND_VALUES }).notNull().default('person'),
    /** R2 key of the persona's own reference material. Private: sharing a card never exposes it. */
    referencePath: text('reference_path'),
    avatarSeed: integer('avatar_seed').notNull().default(0),
    /** Bumped on every ownership change so a transfer can be validated against what it read. */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index('personas_owner_idx').on(t.ownerUserId)],
)

export const personaTransfers = sqliteTable(
  'persona_transfers',
  {
    id: text('id').primaryKey(),
    personaId: text('persona_id')
      .notNull()
      .references(() => personas.id),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id),
    state: text('state', { enum: PERSONA_TRANSFER_STATE_VALUES }).notNull().default('pending'),
    /** The persona version this offer was written against; acceptance checks it still holds. */
    personaVersion: integer('persona_version').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    settledAt: timestamp('settled_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('persona_transfers_persona_idx').on(t.personaId),
    index('persona_transfers_to_idx').on(t.toUserId),
    /** At most one live offer per persona; settled rows drop out of the index. */
    uniqueIndex('persona_transfers_pending_idx')
      .on(t.personaId)
      .where(sql`state = 'pending'`),
  ],
)

/**
 * One row per purchase line: what the account may dress a persona in. Quantity is kept because a
 * line can buy several of the same article, and lending one out must not consume it.
 */
export const wardrobeEntitlements = sqliteTable(
  'wardrobe_entitlements',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id),
    /** The variant actually bought, when the catalogue records one. */
    size: text('size'),
    quantity: integer('quantity').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index('wardrobe_entitlements_owner_idx').on(t.ownerUserId),
    index('wardrobe_entitlements_article_idx').on(t.articleId),
    /** A purchase line grants its wardrobe entitlement exactly once, however often it is retried. */
    uniqueIndex('wardrobe_entitlements_purchase_idx').on(t.purchaseId),
  ],
)

/** A friend may dress their personas in this article. Lending copies no entitlement and no credit. */
export const wardrobeLoans = sqliteTable(
  'wardrobe_loans',
  {
    id: text('id').primaryKey(),
    entitlementId: text('entitlement_id')
      .notNull()
      .references(() => wardrobeEntitlements.id, { onDelete: 'cascade' }),
    lenderUserId: text('lender_user_id')
      .notNull()
      .references(() => users.id),
    borrowerUserId: text('borrower_user_id')
      .notNull()
      .references(() => users.id),
    state: text('state', { enum: LOAN_STATE_VALUES }).notNull().default('active'),
    revokedAt: timestamp('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('wardrobe_loans_borrower_idx').on(t.borrowerUserId),
    uniqueIndex('wardrobe_loans_active_idx')
      .on(t.entitlementId, t.borrowerUserId)
      .where(sql`state = 'active'`),
  ],
)

/**
 * Every credit movement, never a running total. `operationKey` is what makes the whole thing safe
 * to retry: a replayed checkout, a re-opened confirmation page or a retried reservation writes the
 * same key and the unique index rejects the duplicate, so the caller can read back the first
 * result instead of double-counting.
 */
export const creditLedger = sqliteTable(
  'credit_ledger',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    /** `+3` on a qualifying purchase line, `-1` to reserve, `+1` to release. Settling spends the
     * reservation and writes `0`, which keeps the audit line without moving the balance again. */
    delta: integer('delta').notNull(),
    reason: text('reason', { enum: CREDIT_REASON_VALUES }).notNull(),
    purchaseId: text('purchase_id').references(() => purchases.id),
    sessionId: text('session_id'),
    /** Which version of the grant rules decided this row. */
    ruleVersion: text('rule_version').notNull(),
    operationKey: text('operation_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('credit_ledger_owner_idx').on(t.ownerUserId),
    index('credit_ledger_session_idx').on(t.sessionId),
    uniqueIndex('credit_ledger_operation_idx').on(t.operationKey),
  ],
)

/**
 * One reserved credit being spent. The persona and the articles are snapshotted when the session
 * opens: swapping either afterwards would let a card claim a provenance it never had.
 */
export const cardSessions = sqliteTable(
  'card_sessions',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    personaId: text('persona_id')
      .notNull()
      .references(() => personas.id),
    /** Set only for an edition session: which collection this credit is being spent on. */
    collectionId: text('collection_id').references(() => collections.id),
    state: text('state', { enum: CARD_SESSION_STATE_VALUES }).notNull().default('open'),
    /** The ledger row holding this session's credit. */
    reserveOperationKey: text('reserve_operation_key').notNull(),
    maxCandidates: integer('max_candidates').notNull().default(4),
    /**
     * Articles chosen at open time, each with where the right to use it came from. An edition
     * session also records which persona wears each piece, so the artwork keeps the mapping
     * rather than becoming an anonymous union of everyone's clothes.
     */
    articleSnapshot: json<
      Array<{
        articleId: string
        source: (typeof ENTITLEMENT_SOURCE_VALUES)[number]
        personaId?: string
      }>
    >('article_snapshot')
      .notNull()
      .default(sql`'[]'`),
    expiresAt: timestamp('expires_at').notNull(),
    settledAt: timestamp('settled_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('card_sessions_owner_idx').on(t.ownerUserId),
    index('card_sessions_persona_idx').on(t.personaId),
    uniqueIndex('card_sessions_reserve_idx').on(t.reserveOperationKey),
  ],
)

/** One call to the image provider. Failures are kept: the retry budget counts them. */
export const generationAttempts = sqliteTable(
  'generation_attempts',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => cardSessions.id, { onDelete: 'cascade' }),
    state: text('state', { enum: GENERATION_STATE_VALUES }).notNull().default('pending'),
    provider: text('provider'),
    error: text('error'),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at'),
  },
  (t) => [index('generation_attempts_session_idx').on(t.sessionId)],
)

/** A picture that could become a card. Up to `maxCandidates` per session; exactly one is chosen. */
export const cardCandidates = sqliteTable(
  'card_candidates',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => cardSessions.id, { onDelete: 'cascade' }),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => generationAttempts.id, { onDelete: 'cascade' }),
    imagePath: text('image_path').notNull(),
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('card_candidates_session_idx').on(t.sessionId),
    uniqueIndex('card_candidates_position_idx').on(t.sessionId, t.position),
  ],
)

/**
 * An issued personal card. `personaId` is the only link to a holder; everything else is the
 * record of its making and stays fixed for the life of the card.
 */
export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => cardSessions.id),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => cardCandidates.id),
    personaId: text('persona_id')
      .notNull()
      .references(() => personas.id),
    /** Who made it. Unchanged by transfers. */
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id),
    imagePath: text('image_path').notNull(),
    /** Printed on the card and quoted when verifying one. */
    verificationCode: text('verification_code').notNull(),
    tier: text('tier').notNull(),
    /** Share of the worn articles the author owned outright, at issue time. */
    ownedRatio: real('owned_ratio').notNull().default(0),
    articleSnapshot: json<
      Array<{ articleId: string; source: (typeof ENTITLEMENT_SOURCE_VALUES)[number] }>
    >('article_snapshot')
      .notNull()
      .default(sql`'[]'`),
    issuedAt: createdAt('issued_at'),
  },
  (t) => [
    index('cards_persona_idx').on(t.personaId),
    index('cards_author_idx').on(t.authorUserId),
    uniqueIndex('cards_verification_idx').on(t.verificationCode),
    /** A session settles into one card. */
    uniqueIndex('cards_session_idx').on(t.sessionId),
  ],
)

/** A grouping of personal cards that can be issued together as a multi-person artwork. */
export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('collections_owner_idx').on(t.ownerUserId)],
)

/** Which personas take part, and which of their personal cards they bring. */
export const collectionMembers = sqliteTable(
  'collection_members',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    personaId: text('persona_id')
      .notNull()
      .references(() => personas.id),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.personaId] }),
    index('collection_members_persona_idx').on(t.personaId),
  ],
)

/** One artwork, made from one credit, issued in as many copies as there are participating personas. */
export const collectionEditions = sqliteTable(
  'collection_editions',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => cardSessions.id),
    imagePath: text('image_path').notNull(),
    /** N: the number of personas in the collection when it was issued. */
    editionSize: integer('edition_size').notNull(),
    issuedAt: createdAt('issued_at'),
  },
  (t) => [
    index('collection_editions_collection_idx').on(t.collectionId),
    uniqueIndex('collection_editions_session_idx').on(t.sessionId),
  ],
)

/**
 * An ask to a persona's manager to take part (#37). The manager answers, and on accepting picks
 * which of that persona's cards to bring — the inviter never chooses it for them.
 */
export const collectionInvites = sqliteTable(
  'collection_invites',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    personaId: text('persona_id')
      .notNull()
      .references(() => personas.id),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id),
    state: text('state', { enum: COLLECTION_INVITE_STATE_VALUES }).notNull().default('pending'),
    createdAt: createdAt(),
    respondedAt: timestamp('responded_at'),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.personaId] }),
    index('collection_invites_persona_idx').on(t.personaId, t.state),
  ],
)

/**
 * One persona's numbered share of an edition. Copies follow their beneficiary persona, so
 * transferring one persona out of a three-person collection moves exactly that persona's copy.
 */
export const cardCopies = sqliteTable(
  'card_copies',
  {
    id: text('id').primaryKey(),
    editionId: text('edition_id')
      .notNull()
      .references(() => collectionEditions.id, { onDelete: 'cascade' }),
    beneficiaryPersonaId: text('beneficiary_persona_id')
      .notNull()
      .references(() => personas.id),
    /** 1..editionSize. */
    editionNumber: integer('edition_number').notNull(),
    verificationCode: text('verification_code').notNull(),
    issuedAt: createdAt('issued_at'),
  },
  (t) => [
    index('card_copies_persona_idx').on(t.beneficiaryPersonaId),
    uniqueIndex('card_copies_verification_idx').on(t.verificationCode),
    uniqueIndex('card_copies_number_idx').on(t.editionId, t.editionNumber),
    /** A persona holds exactly one copy of an edition. */
    uniqueIndex('card_copies_beneficiary_idx').on(t.editionId, t.beneficiaryPersonaId),
  ],
)

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type Brand = typeof brands.$inferSelect
export type NewBrand = typeof brands.$inferInsert
export type Article = typeof articles.$inferSelect
export type ArticleVision = typeof articleVision.$inferSelect
export type NewArticleVision = typeof articleVision.$inferInsert
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
export type Preview = typeof previews.$inferSelect
export type NewPreview = typeof previews.$inferInsert
export type PreviewArticle = typeof previewArticles.$inferSelect
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

export type Persona = typeof personas.$inferSelect
export type NewPersona = typeof personas.$inferInsert
export type PersonaTransfer = typeof personaTransfers.$inferSelect
export type NewPersonaTransfer = typeof personaTransfers.$inferInsert
export type WardrobeEntitlement = typeof wardrobeEntitlements.$inferSelect
export type NewWardrobeEntitlement = typeof wardrobeEntitlements.$inferInsert
export type WardrobeLoan = typeof wardrobeLoans.$inferSelect
export type NewWardrobeLoan = typeof wardrobeLoans.$inferInsert
export type CreditLedgerRow = typeof creditLedger.$inferSelect
export type NewCreditLedgerRow = typeof creditLedger.$inferInsert
export type CardSession = typeof cardSessions.$inferSelect
export type NewCardSession = typeof cardSessions.$inferInsert
export type GenerationAttempt = typeof generationAttempts.$inferSelect
export type NewGenerationAttempt = typeof generationAttempts.$inferInsert
export type CardCandidate = typeof cardCandidates.$inferSelect
export type NewCardCandidate = typeof cardCandidates.$inferInsert
export type Card = typeof cards.$inferSelect
export type NewCard = typeof cards.$inferInsert
export type Collection = typeof collections.$inferSelect
export type NewCollection = typeof collections.$inferInsert
export type CollectionInvite = typeof collectionInvites.$inferSelect
export type NewCollectionInvite = typeof collectionInvites.$inferInsert
export type CollectionInviteState = (typeof COLLECTION_INVITE_STATE_VALUES)[number]
export type CollectionMember = typeof collectionMembers.$inferSelect
export type NewCollectionMember = typeof collectionMembers.$inferInsert
export type CollectionEdition = typeof collectionEditions.$inferSelect
export type NewCollectionEdition = typeof collectionEditions.$inferInsert
export type CardCopy = typeof cardCopies.$inferSelect
export type NewCardCopy = typeof cardCopies.$inferInsert

export type PersonaKind = (typeof PERSONA_KIND_VALUES)[number]
export type PersonaTransferState = (typeof PERSONA_TRANSFER_STATE_VALUES)[number]
export type EntitlementSource = (typeof ENTITLEMENT_SOURCE_VALUES)[number]
export type LoanState = (typeof LOAN_STATE_VALUES)[number]
export type CreditReason = (typeof CREDIT_REASON_VALUES)[number]
export type CardSessionState = (typeof CARD_SESSION_STATE_VALUES)[number]
export type GenerationState = (typeof GENERATION_STATE_VALUES)[number]

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
export type IntentProvider = (typeof INTENT_PROVIDER_VALUES)[number]
