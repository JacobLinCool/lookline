/**
 * Public types of @lookline/sim: personas with hidden taste, the social graph, the day plan
 * and the sink interface the simulation writes through (Postgres via the engine write paths,
 * or an in-memory sink for tests).
 */
import type { Department, Article } from '@lookline/db'
import type {
  AnswerAskInput,
  CreateAskInput,
  CreateLookInput,
  FeedbackInput,
  InteractionInput,
  PurchaseInput,
} from '@lookline/engine'

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export interface PersonaParams {
  /** Probability of being active on a given day, in (0, 1). */
  activity: number
  /** Base probability of remixing a Look a friend shared, in (0, 1). */
  remixPropensity: number
  /** Base probability of sending an Ask on an active day, in (0, 1). */
  askPropensity: number
  /** How many closest friends receive shares (1–6). */
  shareRadius: number
}

export interface Persona {
  id: string
  handle: string
  displayName: string
  department: Department
  sizes: Record<string, string>
  budgetHint: number
  avatarSeed: number
  bio: string
  /** 0-based index into `CLUSTER_ARCHETYPES`. */
  socialCluster: number
  /** True for the hand-written demo personas (selectable on /login). */
  isPersona: boolean
  /** Cluster archetype slug. */
  archetype: string
  /** Primary aesthetic slugs (strongest first). */
  primaryAesthetics: string[]
  /** Hidden self taste (64-d, style-space layout). */
  hiddenVector: number[]
  /** Hidden taste of the people this persona buys for (≈40 % of personas), else null. */
  giftHiddenVector: number[] | null
  giftDepartment: Department | null
  /** e.g. "for Mom", "for my partner". */
  giftLabel: string | null
  params: PersonaParams
}

export interface ClusterArchetype {
  slug: string
  label: string
  /** Primary aesthetic slugs (catalog `AESTHETICS`), strongest first. */
  aesthetics: readonly [string, string]
  /** Department shares (women, men, unisex). */
  departments: readonly [number, number, number]
  /** Budget band (TWD per purchase) the members' `budgetHint` is drawn from (log-uniform). */
  budget: readonly [number, number]
  /** Neighbourhood / city used in bios. */
  place: string
  /** Bio sentences (one is picked per persona). */
  bios: readonly string[]
}

// ---------------------------------------------------------------------------
// Social graph
// ---------------------------------------------------------------------------

export interface Friend {
  id: string
  /** Closeness in (0, 1]; shares go to the closest `shareRadius` friends first. */
  weight: number
  sameCluster: boolean
}

export interface SocialGraph {
  /** Friends per persona, sorted by closeness (desc). */
  friends: ReadonlyMap<string, readonly Friend[]>
  edges: ReadonlyArray<{ a: string; b: string; weight: number; sameCluster: boolean }>
  intraEdges: number
  interEdges: number
}

// ---------------------------------------------------------------------------
// Plan (pure day scheduler output)
// ---------------------------------------------------------------------------

export interface GiftTarget {
  label: string
  forUserId: string | null
  department: Department
}

interface EventBase {
  /** Position in the sorted plan; ids and rng streams are derived from it. */
  seq: number
  day: number
  /** Intra-day fraction in [0, 1). */
  t: number
  /** Absolute timestamp (derived from `config.now`, `day`, `t`). */
  at: Date
  /** User ids whose state the event touches (serialisation keys for parallel execution). */
  locks: string[]
}

export type PlannedEvent =
  | (EventBase & { kind: 'browse'; userId: string; occasion: string; forGift: boolean })
  | (EventBase & {
      kind: 'purchase'
      userId: string
      purchaseId: string
      gift: GiftTarget | null
      /** 'undisclosed' for "prefer not to say". */
      forKind: 'self' | 'other' | 'undisclosed'
      /** Look the purchase is attributed to (a look the user saw earlier), when any. */
      sourceLookId: string | null
      occasion: string | null
      /** Planted trend seed: bias product choice to this aesthetic. */
      aesthetic: string | null
    })
  | (EventBase & {
      kind: 'edition'
      userId: string
      lookId: string
      preset: string
      occasion: string | null
      /** Planted trend seed: bias product choice to this aesthetic. */
      seedAesthetic: string | null
    })
  | (EventBase & {
      kind: 'share'
      userId: string
      friendId: string
      /** The shared Look: the sharer's latest Look ('latest') or a specific id. */
      lookId: string | 'latest'
      react: boolean
      /** The friend remixes the Look (decided by the planner from taste similarity). */
      remix: boolean
      remixLookId: string
      remixPreset: string
      /** The friend buys one piece of the remix afterwards. */
      remixPurchaseId: string | null
    })
  | (EventBase & {
      kind: 'ask'
      userId: string
      friendId: string
      askId: string
      askKind: 'choose' | 'style_me'
      occasion: string
      budget: number
      /** Look the Ask is about (trend-seed Looks), when any. */
      lookId: string | null
    })
  | (EventBase & {
      kind: 'answer'
      askId: string
      userId: string
      askerId: string
      /** The asker buys the chosen option afterwards (choose Asks only). */
      purchaseId: string | null
      /** The responder's styled Look for style_me Asks. */
      styledLookId: string | null
      styledPreset: string
    })
  | (EventBase & {
      kind: 'together'
      userId: string
      lookId: string
      participantIds: string[]
      occasion: string
      preset: string
    })
  | (EventBase & {
      kind: 'remix'
      userId: string
      lookId: string
      parentLookId: string
      parentOwnerId: string
      preset: string
      purchaseId: string | null
      /** Trend seed slug this remix belongs to (for reporting). */
      trendSeed: string | null
    })
  | (EventBase & {
      kind: 'engage'
      userId: string
      lookId: string
      ownerId: string
      react: boolean
      save: boolean
      purchaseId: string | null
    })

export type PlannedEventKind = PlannedEvent['kind']

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** A planned event before ordering (no `seq`, `day`, `t`, `at`, `locks`). */
export type PlannedEventBody = DistributiveOmit<PlannedEvent, 'seq' | 'day' | 't' | 'at' | 'locks'>

export interface TrendSeed {
  slug: string
  aesthetic: string
  /** Cluster the trend starts in. */
  originCluster: number
  /** Clusters of the successive remix hops (chain depth = hops.length). */
  hops: readonly number[]
  /** Demo persona handle carrying the root edition (else the best-fitting member of the origin). */
  carrierHandle: string | null
  /** Day (0-based) of the root edition. */
  day: number
}

export interface SimPlan {
  events: PlannedEvent[]
  counts: Record<PlannedEventKind, number>
  trendSeeds: Array<{ seed: TrendSeed; rootLookId: string; carrierId: string; lookIds: string[] }>
}

// ---------------------------------------------------------------------------
// Sink
// ---------------------------------------------------------------------------

/** The product columns the simulation needs (taste matching, sizes, posters). */
export type SimProduct = Pick<
  Article,
  | 'id'
  | 'department'
  | 'categoryGroup'
  | 'subcategory'
  | 'price'
  | 'colorFamily'
  | 'colorHex'
  | 'secondaryColorHex'
  | 'aesthetics'
  | 'sizeSystem'
  | 'sizes'
  | 'popularity'
  | 'name'
  | 'silhouetteId'
  | 'pattern'
  | 'imageSeed'
> & { styleVector: number[] }

export type Deterministic<T> = T & { id: string; createdAt: Date }

export interface SearchInput {
  id: string
  userId: string
  utterance: string
  occasion: string
  createdAt: Date
}

export interface SimSink {
  /** Insert users + sim_personas rows. */
  insertPersonas(personas: readonly Persona[], createdAt: Date): Promise<void>
  /** Candidate articles the simulation chooses from (a sample of the catalog). */
  loadPool(): Promise<SimProduct[]>
  /** Products by id that may be missing from the pool (e.g. from `suggestRemix`). */
  loadProducts(ids: readonly number[]): Promise<SimProduct[]>
  recordSearch(input: SearchInput): Promise<void>
  recordInteraction(input: Deterministic<InteractionInput>): Promise<void>
  recordFeedback(input: Deterministic<FeedbackInput>): Promise<void>
  recordPurchase(input: Deterministic<PurchaseInput>): Promise<{ price: number }>
  createLook(
    input: Deterministic<CreateLookInput>,
    poster: string | null,
  ): Promise<{ depth: number; rootLookId: string }>
  /** Article ids of a "Make It Mine" suggestion (may be empty). */
  suggestRemix(sourceLookId: string, userId: string): Promise<number[]>
  createAsk(input: Deterministic<CreateAskInput>): Promise<void>
  answerAsk(input: Deterministic<AnswerAskInput>): Promise<void>
  /** Optional: called once after the run. */
  finish?(): Promise<void>
}

// ---------------------------------------------------------------------------
// Configuration and result
// ---------------------------------------------------------------------------

export interface SimConfig {
  seed: number
  /** End of the simulated window; events are spread over the `days` days ending here. */
  now: Date
  /** Default 60. */
  days?: number
  /** Personas to simulate (default `generatePersonas(seed, n)`). */
  personas?: readonly Persona[]
  /** Number of personas when `personas` is not given (default 1200). */
  n?: number
  /** Unused since posters render on demand; kept so older callers keep compiling. */
  dataDir?: string | null
  /** Parallel events (default 1 = strict sequential order; SQLite serialises writes anyway). */
  concurrency?: number
  /** Planted trend seeds (default `TREND_SEEDS`). */
  trendSeeds?: readonly TrendSeed[]
  log?: (message: string) => void
}

export interface SimSummary {
  personas: number
  events: Record<PlannedEventKind, number>
  executed: Record<PlannedEventKind, number>
  skipped: Record<PlannedEventKind, number>
  purchases: number
  looks: Record<'edition' | 'remix' | 'together', number>
  asks: number
  answers: number
  interactions: number
  feedback: number
  trendSeeds: Array<{ slug: string; rootLookId: string; carrierId: string; looks: number }>
  durationMs: number
}
