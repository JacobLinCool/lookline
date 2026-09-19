/**
 * Database sink: every social write goes through the engine write paths (`recordPurchase`,
 * `createLook`, `suggestRemix`, `createAsk`, `answerAsk`, `recordInteraction`,
 * `recordFeedback`) and searches become `intent_sessions` rows via the offline intent parser.
 * Look posters are not stored: the web image route renders `renderLookPosterSvg` on demand for
 * every Look without an `imagePath` (only generated images live in R2).
 */
import {
  and,
  gt,
  inArray,
  insertAll,
  intentSessions,
  products,
  simPersonas,
  sql,
  users,
  type Database,
} from '@lookline/db'
import {
  answerAsk,
  createAsk,
  createLook,
  intentToVector,
  parseIntentOffline,
  recordFeedback,
  recordInteraction,
  recordPurchase,
  suggestRemix,
} from '@lookline/engine'
import type { Persona, SimProduct, SimSink } from '../types'

export interface DbSinkOptions {
  /** Kept for compatibility; posters are rendered on demand and never written to disk. */
  dataDir?: string | null
  /** Keep every `modulo`-th in-stock product in the pool (default 4 ≈ 25k of 100k). */
  poolModulo?: number
  /** Bound parameters per insert statement (default: the D1 limit; local SQLite allows 30 000). */
  maxParams?: number
}

const POOL_COLUMNS = {
  id: products.id,
  department: products.department,
  categoryGroup: products.categoryGroup,
  subcategory: products.subcategory,
  price: products.price,
  colorFamily: products.colorFamily,
  colorHex: products.colorHex,
  secondaryColorHex: products.secondaryColorHex,
  aesthetics: products.aesthetics,
  sizeSystem: products.sizeSystem,
  sizes: products.sizes,
  popularity: products.popularity,
  name: products.name,
  silhouetteId: products.silhouetteId,
  pattern: products.pattern,
  imageSeed: products.imageSeed,
  styleVector: products.styleVector,
} as const

export function createDbSink(db: Database, options: DbSinkOptions = {}): SimSink {
  const modulo = Math.max(1, options.poolModulo ?? 4)
  const maxParams = options.maxParams

  return {
    async insertPersonas(personas: readonly Persona[], createdAt: Date) {
      await insertAll(
        db,
        users,
        personas.map((p) => ({
          id: p.id,
          handle: p.handle,
          displayName: p.displayName,
          avatarSeed: p.avatarSeed,
          isGuest: false,
          isPersona: p.isPersona,
          bio: p.bio,
          department: p.department,
          sizes: p.sizes,
          budgetHint: p.budgetHint,
          socialCluster: p.socialCluster,
          createdAt,
          lastSeenAt: createdAt,
        })),
        { maxParams },
      )
      await insertAll(
        db,
        simPersonas,
        personas.map((p) => ({
          userId: p.id,
          hiddenVector: p.hiddenVector,
          giftHiddenVector: p.giftHiddenVector,
          socialCluster: p.socialCluster,
          params: {
            ...p.params,
            archetype: p.archetype,
            primaryAesthetics: p.primaryAesthetics,
            giftDepartment: p.giftDepartment,
            giftLabel: p.giftLabel,
          },
        })),
        { maxParams },
      )
    },

    async loadPool(): Promise<SimProduct[]> {
      const rows = await db
        .select(POOL_COLUMNS)
        .from(products)
        .where(and(gt(products.stock, 0), sql`${products.id} % ${modulo} = 0`))
        .orderBy(products.id)
      return rows
    },

    async loadProducts(ids): Promise<SimProduct[]> {
      if (ids.length === 0) return []
      return db
        .select(POOL_COLUMNS)
        .from(products)
        .where(inArray(products.id, [...ids]))
    },

    async recordSearch(input) {
      let intent: Record<string, unknown> = { utterance: input.utterance }
      let vector: number[] | null = null
      let locale: string | null = null
      try {
        const parsed = parseIntentOffline(input.utterance, {})
        intent = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>
        vector = intentToVector(parsed)
        locale = parsed.locale
      } catch {
        // offline parser failure: keep the raw utterance
      }
      await db.insert(intentSessions).values({
        id: input.id,
        userId: input.userId,
        utterance: input.utterance,
        locale,
        intent,
        intentVector: vector,
        results: {},
        provider: 'offline',
        latencyMs: 0,
        createdAt: input.createdAt,
      })
      await recordInteraction(db, {
        id: `${input.id}_ix`,
        actorUserId: input.userId,
        type: 'SEARCH',
        payload: { q: input.utterance, intentSessionId: input.id, occasion: input.occasion },
        createdAt: input.createdAt,
      })
    },

    async recordInteraction(input) {
      await recordInteraction(db, input)
    },

    async recordFeedback(input) {
      await recordFeedback(db, input)
    },

    async recordPurchase(input) {
      const row = await recordPurchase(db, input)
      return { price: row.price }
    },

    async createLook(input, _poster) {
      const look = await createLook(db, {
        ...input,
        imagePath: null,
        imageStatus: 'ready',
        imageProvider: 'offline',
      })
      return { depth: look.depth, rootLookId: look.rootLookId ?? look.id }
    },

    async suggestRemix(sourceLookId, userId) {
      try {
        const suggestion = await suggestRemix(db, sourceLookId, userId, {})
        return suggestion.items.map((it) => it.product.id)
      } catch {
        return []
      }
    },

    async createAsk(input) {
      await createAsk(db, input)
    },

    async answerAsk(input) {
      await answerAsk(db, input)
    },
  }
}
