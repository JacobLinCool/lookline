import { computeLineage } from '@lookline/engine'
import { describe, expect, it } from 'vitest'
import { DEMO_PERSONAS, generatePersonas } from './personas'
import { simulateSocial } from './simulate'
import { createMemorySink, type MemoryRows } from './sink/memory'
import type { SimProduct } from './types'

const now = new Date('2026-09-18T12:00:00Z')

/** A small synthetic pool: the simulation only needs ids, groups, prices and vectors. */
function syntheticPool(seed: number, size: number): SimProduct[] {
  const groups = ['tops', 'bottoms', 'outerwear', 'footwear', 'bags'] as const
  const roles = ['top', 'bottom', 'outer', 'shoes', 'bag'] as const
  const families = ['black', 'white', 'blue', 'neutral', 'red']
  return Array.from({ length: size }, (_, i) => {
    const g = i % groups.length
    const vector = Array.from({ length: 64 }, (_unused, d) => ((i * 7 + d * 13 + seed) % 100) / 100)
    return {
      id: String(i + 1).padStart(10, '0'),
      department: i % 3 === 0 ? ('men' as const) : ('women' as const),
      categoryGroup: groups[g]!,
      outfitRole: roles[g]!,
      subcategory: `type-${g}`,
      price: 300 + ((i * 137) % 4000),
      colorFamily: families[i % families.length]!,
      colorHex: '#1C1C1C',
      popularity: ((i * 31) % 100) / 100,
      name: `Fixture ${i + 1}`,
      pattern: 'Solid',
      styleVector: vector,
    }
  })
}

function lineageOf(rows: MemoryRows, clusterOf: Map<string, number | null>) {
  return computeLineage({
    looks: rows.looks.map((l) => ({
      id: l.id,
      ownerId: l.ownerId,
      kind: l.kind,
      parentLookId: l.parentLookId,
      aesthetics: [],
      createdAt: l.createdAt,
    })),
    participants: rows.looks.flatMap((l) =>
      l.participants.map((p) => ({ lookId: l.id, userId: p.userId, sourceLookId: p.sourceLookId })),
    ),
    interactions: rows.interactions.map((i) => ({
      id: i.id,
      actorUserId: i.actorUserId,
      targetUserId: i.targetUserId ?? null,
      lookId: i.lookId ?? null,
      articleId: i.articleId ?? null,
      askId: i.askId ?? null,
      type: i.type,
      sourceInteractionId: i.sourceInteractionId ?? null,
      createdAt: i.createdAt,
    })),
    purchases: rows.purchases.map((p) => ({
      id: p.id,
      userId: p.userId,
      articleId: p.articleId,
      quantity: p.quantity ?? 1,
      price: p.price,
      forKind: p.forKind ?? 'self',
      forUserId: p.forUserId ?? null,
      sourceLookId: p.sourceLookId ?? null,
      sourceAskId: p.sourceAskId ?? null,
      sourceInteractionId: null,
      intentSessionId: null,
      createdAt: p.createdAt,
    })),
    clusterOf,
  })
}

describe('simulateSocial (in-memory sink, dry run)', () => {
  const pool = syntheticPool(5, 2500)
  const personas = generatePersonas(5, 300)
  const clusterOf = new Map<string, number | null>(personas.map((p) => [p.id, p.socialCluster]))

  async function run() {
    const sink = createMemorySink(pool)
    const summary = await simulateSocial(sink, { seed: 5, now, days: 60, personas })
    return { sink, summary }
  }

  it('runs every event kind against the sink and plants deep cross-cluster remix chains', async () => {
    const { sink, summary } = await run()
    const rows = sink.rows
    expect(rows.personas).toHaveLength(300)
    expect(summary.purchases).toBe(rows.purchases.length)
    expect(rows.looks.length).toBe(
      summary.looks.edition + summary.looks.remix + summary.looks.together,
    )
    expect(summary.looks.remix).toBeGreaterThan(20)
    expect(summary.looks.together).toBeGreaterThan(0)
    expect(rows.posters).toBe(rows.looks.length)
    expect(rows.asks.length).toBeGreaterThan(20)
    expect(rows.answers.length).toBeGreaterThan(10)
    const types = new Set(rows.interactions.map((i) => i.type))
    for (const t of [
      'SEARCH',
      'VIEW',
      'SAVE',
      'DISMISS',
      'SHARE',
      'REACT',
      'ASK',
      'ADVISE',
      'STYLE',
      'REMIX',
      'INSPIRE',
      'TOGETHER',
      'LOOK_CREATE',
      'PURCHASE',
      'BUY_FOR',
    ])
      expect(types.has(t as never), t).toBe(true)
    const kinds = new Set(rows.feedback.map((f) => f.kind))
    for (const k of ['impression', 'click', 'save', 'dismiss', 'purchase', 'remix', 'look_create'])
      expect(kinds.has(k as never), k).toBe(true)

    const stats = lineageOf(rows, clusterOf)
    const deep = stats.filter((s) => s.depth >= 4 && s.clustersReached >= 3)
    expect(deep.length).toBeGreaterThanOrEqual(summary.trendSeeds.length)
    for (const seed of summary.trendSeeds) {
      const stat = stats.find((s) => s.rootLookId === seed.rootLookId)
      expect(stat?.depth ?? 0).toBeGreaterThanOrEqual(4)
      expect(stat?.clustersReached ?? 0).toBeGreaterThanOrEqual(3)
      expect(stat?.purchases ?? 0).toBeGreaterThan(0)
      const root = rows.looks.find((l) => l.id === seed.rootLookId)!
      expect(root.createdAt.getTime()).toBeGreaterThan(now.getTime() - 21 * 86_400_000)
    }
    // ids are deterministic and prefixed
    expect(rows.purchases.every((p) => /^pu_\d{6}$/.test(p.id))).toBe(true)
    expect(rows.looks.every((l) => /^lk_\d{6}$/.test(l.id))).toBe(true)
    expect(rows.asks.every((a) => /^ask_\d{6}$/.test(a.id))).toBe(true)
    expect(rows.interactions.some((i) => i.id.startsWith('ix_'))).toBe(true)
    expect(rows.feedback.some((f) => f.id.startsWith('fb_'))).toBe(true)
    // timestamps stay inside the window
    for (const p of rows.purchases) {
      expect(p.createdAt.getTime()).toBeLessThanOrEqual(now.getTime())
      expect(p.createdAt.getTime()).toBeGreaterThan(now.getTime() - 61 * 86_400_000)
    }
  }, 30_000)

  it('gives every demo persona purchases, Looks and gifts consistent with the plan', async () => {
    const { sink } = await run()
    const rows = sink.rows
    for (const spec of DEMO_PERSONAS) {
      const p = personas.find((x) => x.handle === spec.handle)!
      expect(
        rows.purchases.filter((x) => x.userId === p.id).length,
        spec.handle,
      ).toBeGreaterThanOrEqual(3)
      expect(
        rows.looks.filter((l) => l.ownerId === p.id).length,
        spec.handle,
      ).toBeGreaterThanOrEqual(2)
    }
    const gifts = rows.purchases.filter((p) => p.forKind === 'other')
    expect(gifts.length / rows.purchases.length).toBeGreaterThan(0.12)
    expect(gifts.length / rows.purchases.length).toBeLessThan(0.32)
    expect(gifts.every((g) => g.forLabel)).toBe(true)
    expect(gifts.some((g) => g.forUserId)).toBe(true)
    expect(rows.purchases.some((p) => p.sourceLookId)).toBe(true)
  }, 30_000)

  it('is deterministic: two runs write identical rows', async () => {
    const a = await run()
    const b = await run()
    const { durationMs: _a, ...summaryA } = a.summary
    const { durationMs: _b, ...summaryB } = b.summary
    expect(summaryA).toEqual(summaryB)
    expect(a.sink.rows.purchases.map((p) => `${p.id}:${p.articleId}`)).toEqual(
      b.sink.rows.purchases.map((p) => `${p.id}:${p.articleId}`),
    )
    expect(a.sink.rows.looks.map((l) => `${l.id}:${l.articleIds.join(',')}`)).toEqual(
      b.sink.rows.looks.map((l) => `${l.id}:${l.articleIds.join(',')}`),
    )
  }, 30_000)
})
