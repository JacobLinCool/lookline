import { describe, expect, it } from 'vitest'
import { buildSocialGraph } from './graph'
import { generatePersonas } from './personas'
import { DAY_MS, TREND_SEEDS, planSimulation, remixProbability } from './schedule'

const now = new Date('2026-09-18T12:00:00Z')

describe('planSimulation', () => {
  const personas = generatePersonas(3, 480)
  const graph = buildSocialGraph(personas, 3)
  const plan = planSimulation(personas, graph, { seed: 3, now, days: 60 })

  it('produces the same event list for the same seed and a different one otherwise', () => {
    const again = planSimulation(personas, graph, { seed: 3, now, days: 60 })
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(plan.events))
    expect(again.counts).toEqual(plan.counts)
    const other = planSimulation(personas, graph, { seed: 4, now, days: 60 })
    expect(JSON.stringify(other.events)).not.toBe(JSON.stringify(plan.events))
  })

  it('orders events in time inside the window with unique deterministic ids', () => {
    const start = now.getTime() - 60 * DAY_MS
    let previous = -Infinity
    const ids = new Set<string>()
    for (const [i, e] of plan.events.entries()) {
      expect(e.seq).toBe(i)
      expect(e.at.getTime()).toBeGreaterThanOrEqual(start)
      expect(e.at.getTime()).toBeLessThanOrEqual(now.getTime())
      expect(e.at.getTime()).toBeGreaterThanOrEqual(previous)
      previous = e.at.getTime()
      expect(e.locks.length).toBeGreaterThan(0)
      const id =
        e.kind === 'purchase'
          ? e.purchaseId
          : e.kind === 'edition' || e.kind === 'remix' || e.kind === 'together'
            ? e.lookId
            : null
      if (id) {
        expect(ids.has(id)).toBe(false)
        ids.add(id)
      }
    }
    expect([...ids].filter((id) => id.startsWith('pu_')).length).toBeGreaterThan(500)
    expect([...ids].some((id) => id === 'lk_000001')).toBe(true)
  })

  it('covers every event kind', () => {
    for (const kind of [
      'browse',
      'purchase',
      'edition',
      'share',
      'together',
      'remix',
      'engage',
    ] as const)
      expect(plan.counts[kind]).toBeGreaterThan(0)
  })

  it('plants four trend seeds with remix chains of depth ≥ 4 across ≥ 3 clusters in the last 3 weeks', () => {
    expect(plan.trendSeeds).toHaveLength(TREND_SEEDS.length)
    const owner = new Map<string, string>()
    const parent = new Map<string, string>()
    const clusterOf = new Map(personas.map((p) => [p.id, p.socialCluster]))
    for (const e of plan.events) {
      if (e.kind === 'edition' || e.kind === 'together') owner.set(e.lookId, e.userId)
      if (e.kind === 'remix') {
        owner.set(e.lookId, e.userId)
        parent.set(e.lookId, e.parentLookId)
        expect(e.day).toBeGreaterThanOrEqual(45)
      }
      if (e.kind === 'share' && e.remix) {
        owner.set(e.remixLookId, e.friendId)
        parent.set(e.remixLookId, e.lookId)
      }
    }
    const depthOf = (id: string): number => {
      let d = 0
      let cur = id
      while (parent.has(cur)) {
        cur = parent.get(cur)!
        d++
      }
      return d
    }
    for (const seed of plan.trendSeeds) {
      const depths = seed.lookIds.map(depthOf)
      expect(Math.max(...depths)).toBeGreaterThanOrEqual(4)
      const clusters = new Set(seed.lookIds.map((id) => clusterOf.get(owner.get(id)!)))
      expect(clusters.size).toBeGreaterThanOrEqual(3)
      const rootEvent = plan.events.find(
        (e) => e.kind === 'edition' && e.lookId === seed.rootLookId,
      )
      expect(rootEvent?.kind === 'edition' && rootEvent.seedAesthetic).toBe(seed.seed.aesthetic)
    }
  })

  it('makes remixes more likely with taste similarity', () => {
    expect(remixProbability(0.3, 0.9)).toBeGreaterThan(remixProbability(0.3, 0.5))
    expect(remixProbability(0.3, 0.5)).toBeGreaterThan(remixProbability(0.3, 0.1))
    expect(remixProbability(0, 1)).toBe(0)
    expect(remixProbability(1, 1)).toBeLessThanOrEqual(1)
    const shares = plan.events.filter((e) => e.kind === 'share')
    expect(shares.filter((e) => e.remix).length / shares.length).toBeGreaterThan(0.05)
  })
})
