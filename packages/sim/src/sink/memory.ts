/**
 * In-memory sink: keeps every row the simulation would write, so tests can run the full
 * simulation without Postgres and inspect lineage/interactions. `suggestRemix` is a small
 * taste-based swap over the pool (one product per source slot, same group).
 */
import type { FeedbackInput, InteractionInput, PurchaseInput } from '@lookline/engine'
import { compatibleDepartments } from '../pool'
import { tasteSimilarity } from '../taste'
import type { Deterministic, Persona, SearchInput, SimProduct, SimSink } from '../types'

export interface MemoryLook {
  id: string
  ownerId: string
  kind: 'edition' | 'remix' | 'together'
  parentLookId: string | null
  rootLookId: string
  depth: number
  articleIds: string[]
  participants: Array<{ userId: string; sourceLookId: string | null }>
  title: string
  imagePath: string | null
  occasion: string | null
  createdAt: Date
}

export interface MemoryRows {
  personas: Persona[]
  searches: SearchInput[]
  interactions: Array<Deterministic<InteractionInput>>
  feedback: Array<Deterministic<FeedbackInput>>
  purchases: Array<Deterministic<PurchaseInput> & { price: number }>
  looks: MemoryLook[]
  posters: number
}

export interface MemorySink extends SimSink {
  rows: MemoryRows
}

export function createMemorySink(pool: readonly SimProduct[]): MemorySink {
  const byId = new Map(pool.map((p) => [p.id, p]))
  const rows: MemoryRows = {
    personas: [],
    searches: [],
    interactions: [],
    feedback: [],
    purchases: [],
    looks: [],
    posters: 0,
  }
  const looksById = new Map<string, MemoryLook>()
  const personasById = new Map<string, Persona>()

  const sink: MemorySink = {
    rows,
    async insertPersonas(personas) {
      for (const p of personas) {
        rows.personas.push(p)
        personasById.set(p.id, p)
      }
    },
    async loadPool() {
      return [...pool]
    },
    async loadProducts(ids) {
      return ids.flatMap((id) => {
        const p = byId.get(id)
        return p ? [p] : []
      })
    },
    async recordSearch(input) {
      rows.searches.push(input)
      rows.interactions.push({
        id: `${input.id}_ix`,
        actorUserId: input.userId,
        type: 'SEARCH',
        payload: { q: input.utterance, occasion: input.occasion },
        createdAt: input.createdAt,
      })
    },
    async recordInteraction(input) {
      rows.interactions.push(input)
    },
    async recordFeedback(input) {
      rows.feedback.push(input)
    },
    async recordPurchase(input) {
      const product = byId.get(input.articleId)
      if (!product) throw new Error(`memory sink: unknown product ${input.articleId}`)
      rows.purchases.push({ ...input, price: product.price })
      rows.interactions.push({
        id: `${input.id}_ix`,
        actorUserId: input.userId,
        type: 'PURCHASE',
        articleId: input.articleId,
        lookId: input.sourceLookId ?? null,
        createdAt: input.createdAt,
      })
      if (input.forKind === 'other') {
        rows.interactions.push({
          id: `${input.id}_bf`,
          actorUserId: input.userId,
          targetUserId: input.forUserId ?? null,
          type: 'BUY_FOR',
          articleId: input.articleId,
          createdAt: input.createdAt,
        })
      }
      rows.feedback.push({
        id: `${input.id}_fb`,
        userId: input.userId,
        kind: 'purchase',
        articleId: input.articleId,
        lookId: input.sourceLookId ?? null,
        forOthers: input.forKind === 'other',
        context: { forKind: input.forKind ?? 'undisclosed' },
        createdAt: input.createdAt,
      })
      return { price: product.price }
    },
    async createLook(input, poster) {
      for (const id of input.articleIds) {
        if (!byId.has(id)) throw new Error(`memory sink: unknown product ${id}`)
      }
      const parent = input.parentLookId ? looksById.get(input.parentLookId) : undefined
      if (input.parentLookId && !parent) {
        throw new Error(`memory sink: parent look ${input.parentLookId} not found`)
      }
      const kind = input.kind ?? 'edition'
      const participants = new Map<string, string | null>()
      if (kind === 'together') participants.set(input.ownerId, null)
      for (const p of input.participants ?? []) participants.set(p.userId, p.sourceLookId ?? null)
      for (const id of input.participantIds ?? [])
        if (!participants.has(id)) participants.set(id, null)
      const look: MemoryLook = {
        id: input.id,
        ownerId: input.ownerId,
        kind,
        parentLookId: parent?.id ?? null,
        rootLookId: parent ? parent.rootLookId : input.id,
        depth: parent ? parent.depth + 1 : 0,
        articleIds: [...new Set(input.articleIds)],
        participants: [...participants.entries()].map(([userId, sourceLookId]) => ({
          userId,
          sourceLookId,
        })),
        title: input.title ?? '',
        imagePath: input.imagePath ?? null,
        occasion: input.occasion ?? null,
        createdAt: input.createdAt,
      }
      rows.looks.push(look)
      looksById.set(look.id, look)
      if (poster) rows.posters += 1
      rows.interactions.push({
        id: `${input.id}_lc`,
        actorUserId: input.ownerId,
        type: 'LOOK_CREATE',
        lookId: look.id,
        createdAt: input.createdAt,
      })
      if (kind === 'remix' && parent) {
        rows.interactions.push({
          id: `${input.id}_rx`,
          actorUserId: input.ownerId,
          targetUserId: parent.ownerId,
          type: 'REMIX',
          lookId: look.id,
          createdAt: input.createdAt,
        })
        rows.interactions.push({
          id: `${input.id}_in`,
          actorUserId: input.ownerId,
          targetUserId: parent.ownerId,
          type: 'INSPIRE',
          lookId: parent.id,
          createdAt: input.createdAt,
        })
      }
      if (kind === 'together') {
        const ids = [...participants.keys()]
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++)
            rows.interactions.push({
              id: `${input.id}_tg${i}${j}`,
              actorUserId: ids[i]!,
              targetUserId: ids[j]!,
              type: 'TOGETHER',
              lookId: look.id,
              createdAt: input.createdAt,
            })
      }
      for (const pid of look.articleIds) {
        rows.feedback.push({
          id: `${input.id}_fb${pid}`,
          userId: input.ownerId,
          kind: 'look_create',
          articleId: pid,
          lookId: look.id,
          createdAt: input.createdAt,
        })
      }
      return { depth: look.depth, rootLookId: look.rootLookId }
    },
    async suggestRemix(sourceLookId, userId) {
      const look = looksById.get(sourceLookId)
      const user = personasById.get(userId)
      if (!look || !user) return []
      const sources = look.articleIds.map((id) => byId.get(id)).filter((p): p is SimProduct => !!p)
      const vectors = sources.map((p) => p.styleVector)
      const blend = Array.from({ length: 64 }, (_, i) => {
        const mean = vectors.reduce((s, v) => s + (v[i] ?? 0), 0) / Math.max(1, vectors.length)
        return i < 32 ? 0.7 * mean + 0.3 * (user.hiddenVector[i] ?? 0) : mean
      })
      const departments = new Set(compatibleDepartments(user.department))
      const exclude = new Set(look.articleIds)
      const out: string[] = []
      for (const src of sources) {
        let best: SimProduct | null = null
        let bestScore = -1
        for (const cand of pool) {
          if (cand.categoryGroup !== src.categoryGroup) continue
          if (!departments.has(cand.department)) continue
          if (exclude.has(cand.id) || out.includes(cand.id)) continue
          const score = tasteSimilarity(cand.styleVector, blend)
          if (score > bestScore || (score === bestScore && best && cand.id < best.id)) {
            best = cand
            bestScore = score
          }
        }
        if (best) out.push(best.id)
      }
      return out
    },
  }
  return sink
}
