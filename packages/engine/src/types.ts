/**
 * Public types of @lookline/engine. Cross-package contract (docs/CONTRACTS.md):
 * keep names and shapes stable; add optional fields, do not rename or remove.
 */
import type {
  Ask,
  AskResponse,
  Department,
  EvaluationRun,
  FeedbackKind,
  IntentProvider,
  LineageStat,
  LlmProvider,
  Look,
  ManufacturingRecommendation,
  Product,
  Purchase,
  PurchaseFor,
  Relationship,
  RelationshipKind,
  TrendDimension,
  User,
  Visibility,
} from '@lookline/db'
import type { Axis, CategoryGroup, ColorFamily, Season } from '@lookline/catalog'

// ---------------------------------------------------------------------------
// LLM provider abstraction
// ---------------------------------------------------------------------------

export interface LlmJsonRequest<T> {
  signal?: AbortSignal
  timeoutMs?: number
  /** zod schema; the provider enforces JSON output and the result is validated with it. */
  schema: import('zod').ZodType<T>
  system: string
  prompt: string
  /** Name used for logging/metrics. */
  purpose?: string
}

/** An image handed to the model, optionally named so the prompt can refer to it by role. */
export interface ReferenceImage {
  mimeType: string
  data: Buffer
  /** e.g. `Garment 1` or `Person reference 2`; providers receive it alongside the bytes. */
  label?: string
}

export interface LlmImageRequest {
  signal?: AbortSignal
  timeoutMs?: number
  prompt: string
  referenceImages?: ReferenceImage[]
  aspectRatio?: '3:4' | '1:1' | '4:5' | '9:16'
  purpose?: string
}

export interface LlmImageResult {
  mimeType: string
  data: Buffer
  provider: LlmProvider
  model: string
}

export interface LlmClient {
  provider: LlmProvider
  textModel: string | null
  imageModel: string | null
  /** Returns null (never throws) when no provider is configured or the call fails. */
  generateJson<T>(req: LlmJsonRequest<T>): Promise<T | null>
  /** Returns null (never throws) when no provider is configured or the call fails. */
  generateImage(req: LlmImageRequest): Promise<LlmImageResult | null>
}

// ---------------------------------------------------------------------------
// Engine 01 — intent
// ---------------------------------------------------------------------------

export type IntentMode = 'single' | 'outfit' | 'browse'
export type RecipientKind = 'self' | 'other' | 'undisclosed'

export interface IntentAssumption {
  slot: string
  value: string
  confidence: number
  reason: string
}

export interface IntentClarification {
  slot: string
  question: string
  options: string[]
}

export interface Intent {
  utterance: string
  locale: 'zh-TW' | 'en' | 'mixed'
  mode: IntentMode
  department?: Department
  categoryGroups: CategoryGroup[]
  subcategories: string[]
  colors: string[]
  colorFamilies: ColorFamily[]
  aesthetics: string[]
  materials: string[]
  patterns: string[]
  fits: string[]
  occasion?: string
  season?: Season
  budget?: { min?: number; max?: number; currency: 'TWD'; original?: string }
  recipient: { kind: RecipientKind; relation?: string; department?: Department; label?: string }
  sizes?: Record<string, string>
  mustHave: string[]
  mustAvoid: string[]
  vibe?: string
  referenceLookId?: string
  referenceHandle?: string
  assumptions: IntentAssumption[]
  clarifications: IntentClarification[]
  confidence: number
}

export interface IntentContext {
  userId?: string
  user?: Pick<User, 'department' | 'budgetHint' | 'displayName'> & {
    preferenceVector?: number[] | null
  }
  locale?: 'zh-TW' | 'en'
  /** Previous turn, for follow-ups such as "cheaper" or "in black instead". */
  previousIntent?: Intent | null
  /** Force the offline parser even when an API key exists (tests, determinism). */
  offline?: boolean
}

export interface IntentResult {
  intent: Intent
  vector: number[]
  /** Who produced it: `jev` for the decision stage, a generative provider once it escalated. */
  provider: IntentProvider
  /** Model id used by the provider (null for offline). */
  model?: string | null
  latencyMs: number
}

// ---------------------------------------------------------------------------
// Engine 02 — explainable recommendation
// ---------------------------------------------------------------------------

export type FactorName =
  | 'style_similarity'
  | 'attribute_match'
  | 'budget_fit'
  | 'user_preference'
  | 'social_signal'
  | 'trend_momentum'
  | 'brand_affinity'
  | 'popularity_prior'
  | 'diversity'
  | 'compatibility'

export interface ExplanationFactor {
  factor: FactorName
  weight: number
  /** Normalised factor value in [0, 1] (or [-1, 1] for penalties). */
  value: number
  /** weight × value */
  contribution: number
  /** Human-readable evidence, e.g. "matches 'quiet luxury' (0.82) and 'minimalist' (0.61)". */
  evidence: string
}

export interface Explanation {
  summary: string
  factors: ExplanationFactor[]
  /** Optional LLM-polished sentence; the deterministic summary is always present. */
  prose?: string
}

export interface RankedItem {
  product: Product
  brandName: string
  score: number
  explanation: Explanation
  /** Slot inside an outfit (e.g. "top", "bottom", "shoes", "outer", "bag", "accessory"). */
  role?: string
}

export interface Outfit {
  id: string
  items: RankedItem[]
  total: number
  budget?: number
  compatibility: number
  explanation: Explanation
  styleVector: number[]
}

export interface RecommendRequest {
  intent: Intent
  userId?: string
  limit?: number
  outfits?: boolean
  outfitCount?: number
  exclude?: number[]
  intentSessionId?: string
  /** Override blend weights (used by the bandit and by evaluation). */
  weights?: Partial<Record<FactorName, number>>
}

export interface RecommendResponse {
  items: RankedItem[]
  outfits: Outfit[]
  candidates: number
  weights: Record<FactorName, number>
  intentVector: number[]
  timings: Record<string, number>
  /**
   * The blend arm the bandit picked and the context it was picked for (§4.4). Absent for guests
   * and when `weights` were overridden. Both fields must reach the impression's `context` or the
   * slate's reward cannot be attributed back to the arm.
   */
  arm?: { name: string; contextVector: number[] }
}

export interface ProductSearch {
  q?: string
  department?: Department
  categoryGroups?: CategoryGroup[]
  excludedCategoryGroups?: CategoryGroup[]
  category?: string
  subcategory?: string
  aesthetics?: string[]
  excludedAesthetics?: string[]
  colorFamilies?: ColorFamily[]
  excludedColorFamilies?: ColorFamily[]
  brandId?: number
  priceMin?: number
  priceMax?: number
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'popular' | 'new' | 'trending'
  page?: number
  pageSize?: number
}

export interface ProductSearchResult {
  items: Array<Product & { brandName: string }>
  total: number
  page: number
  pageSize: number
  facets?: {
    categoryGroups: Array<{ key: string; count: number }>
    colorFamilies: Array<{ key: string; count: number }>
    aesthetics: Array<{ key: string; count: number }>
  }
}

// ---------------------------------------------------------------------------
// Engine 03 — preference feedback loop
// ---------------------------------------------------------------------------

export interface FeedbackInput {
  userId: string
  kind: FeedbackKind
  productId?: number | null
  lookId?: string | null
  intentSessionId?: string | null
  position?: number | null
  /** True when the action was for someone else (gift, styling a friend). */
  forOthers?: boolean
  context?: Record<string, unknown>
  /** Deterministic overrides for the simulation. */
  id?: string
  createdAt?: Date
}

export interface PreferenceAesthetic {
  slug: string
  name: string
  weight: number
  confidence: number
  evidence: string[]
}

export interface PreferenceProfile {
  userId: string
  vector: number[] | null
  giftVector: number[] | null
  eventCount: number
  topAesthetics: PreferenceAesthetic[]
  topColorFamilies: Array<{ family: ColorFamily; weight: number }>
  axes: Record<Axis, number>
  giftTopAesthetics: PreferenceAesthetic[]
  snapshots: Array<{ version: number; createdAt: Date; metrics: Record<string, number> }>
  /** Current bandit state summary, for the profile card. */
  bandit?: {
    arms: Array<{ name: string; pulls: number; meanReward: number }>
    current?: string
    reason?: string
  }
}

export interface EvalConfig {
  seed: number
  users: number
  rounds: number
  catalogSize: number
  k: number
  /** Feedback noise probability in [0, 1]. */
  noise?: number
  name?: string
}

export interface EvalRound {
  round: number
  hitRate: number
  ndcg: number
  cumulativeReward: number
  cosineToTruth: number
  baselineHitRate: number
  baselineNdcg: number
  baselineCumulativeReward: number
  [key: string]: number
}

export interface EvalResult {
  config: EvalConfig
  series: EvalRound[]
  summary: {
    finalHitRate: number
    finalNdcg: number
    finalCosine: number
    baselineHitRate: number
    baselineNdcg: number
    liftHitRate: number
    liftNdcg: number
    roundsToBeatBaseline: number
    [key: string]: number
  }
}

// ---------------------------------------------------------------------------
// Social primitives (write paths shared by web and simulation)
// ---------------------------------------------------------------------------

export interface DeterministicOptions {
  id?: string
  createdAt?: Date
  shareToken?: string
}

export interface PurchaseInput extends DeterministicOptions {
  userId: string
  productId: number
  quantity?: number
  size?: string | null
  forKind?: PurchaseFor
  forUserId?: string | null
  forLabel?: string | null
  sourceLookId?: string | null
  sourceAskId?: string | null
  intentSessionId?: string | null
}

export interface CreateLookInput extends DeterministicOptions {
  ownerId: string
  productIds: number[]
  stylePreset: string
  title?: string
  prompt?: string | null
  occasion?: string | null
  visibility?: Visibility
  parentLookId?: string | null
  kind?: 'edition' | 'remix' | 'together'
  participantIds?: string[]
  /** Richer participant list for Together editions (fills look_participants.source_look_id). */
  participants?: Array<{ userId: string; sourceLookId?: string | null }>
  /** Already-generated image (relative path under DATA_DIR/looks) and status. */
  imagePath?: string | null
  imageStatus?: 'pending' | 'ready' | 'failed'
  imageProvider?: LlmProvider | null
}

export interface RemixSuggestion {
  sourceLook: Look
  items: RankedItem[]
  explanation: Explanation
  keptAesthetics: string[]
  palette: string[]
}

export interface CreateAskInput extends DeterministicOptions {
  askerId: string
  kind: 'choose' | 'style_me'
  question: string
  optionProductIds?: number[]
  lookId?: string | null
  targetUserId?: string | null
  budget?: number | null
  occasion?: string | null
}

export interface AnswerAskInput extends DeterministicOptions {
  askId: string
  responderUserId?: string | null
  responderName?: string | null
  choiceProductId?: number | null
  styledLookId?: string | null
  comment?: string | null
}

export interface InteractionInput extends DeterministicOptions {
  actorUserId: string
  type: import('@lookline/db').InteractionType
  targetUserId?: string | null
  lookId?: string | null
  productId?: number | null
  askId?: string | null
  payload?: Record<string, unknown>
  sourceInteractionId?: string | null
}

export interface LookStyle {
  aesthetics: string[]
  palette: string[]
  styleVector: number[]
}

export interface LookPosterInput {
  title: string
  ownerName: string
  stylePreset: string
  products: Array<
    Pick<
      Product,
      | 'name'
      | 'colorHex'
      | 'silhouetteId'
      | 'pattern'
      | 'aesthetics'
      | 'imageSeed'
      | 'categoryGroup'
      | 'secondaryColorHex'
    >
  >
  palette: string[]
  aesthetics: string[]
  seed: number
  editionNumber?: number
}

export interface StylePreset {
  slug: string
  name: string
  labelZh: string
  description: string
  /** Prompt fragment for the image model. */
  prompt: string
  /** Poster fallback theme. */
  theme: { background: string; foreground: string; accent: string; mood: string }
}

// ---------------------------------------------------------------------------
// Graph, lineage, trends
// ---------------------------------------------------------------------------

export interface UserSummary {
  id: string
  handle: string
  displayName: string
  avatarSeed: number
  tasteCluster: number | null
  socialCluster: number | null
}

export interface LineageNode {
  look: Look
  owner: UserSummary
  products: Array<Product & { brandName: string }>
  children: LineageNode[]
  purchases: number
  gmv: number
  reactions: number
}

export interface LineageTree {
  root: LineageNode
  stats: LineageStat
  path?: Look[]
}

export interface TrendSeries {
  dimension: TrendDimension
  key: string
  label: string
  momentum: number
  volume: number
  velocity: number
  crossCluster: number
  conversion: number
  gmv: number
  emerging: boolean
  series: Array<{ day: string; volume: number }>
}

export interface Influencer {
  user: UserSummary
  influence: number
  remixesCaused: number
  downstreamPurchases: number
  downstreamGmv: number
  clustersReached: number
}

export interface TrendDashboard {
  generatedAt: Date
  window: { from: Date; to: Date; days: number }
  headline: {
    looks: number
    remixes: number
    asks: number
    togethers: number
    shares: number
    purchases: number
    purchasesFromLooks: number
    gmvFromLooks: number
    activePeople: number
    crossClusterShare: number
    avgLineageDepth: number
  }
  aesthetics: TrendSeries[]
  categories: TrendSeries[]
  colors: TrendSeries[]
  silhouettes: TrendSeries[]
  aestheticCategory: TrendSeries[]
  emerging: TrendSeries[]
  topLineages: Array<{ stats: LineageStat; look: Look; owner: UserSummary; products: Product[] }>
  influencers: Influencer[]
  clusters: Array<{ id: number; size: number; topAesthetics: string[]; label: string }>
  manufacturing: ManufacturingRecommendation[]
  evaluation: EvaluationRun | null
}

export interface UserNetwork {
  user: UserSummary
  edges: Array<{ relationship: Relationship; other: UserSummary; direction: 'out' | 'in' }>
  byKind: Record<RelationshipKind, number>
}

export interface AnalyticsSummary {
  relationships: number
  clusters: number
  lineages: number
  trendSignals: number
  manufacturing: number
  durationMs: number
}

export type {
  Ask,
  AskResponse,
  Look,
  Purchase,
  Product,
  User,
  LineageStat,
  ManufacturingRecommendation,
  EvaluationRun,
}
