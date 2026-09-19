import { describe, expect, it } from 'vitest'
import {
  DEMO_CIRCLE,
  INTER_EDGE_P,
  INTRA_EDGE_P,
  MIN_FRIENDS,
  buildSocialGraph,
  edgeDensities,
} from './graph'
import { generatePersonas } from './personas'

describe('buildSocialGraph', () => {
  const personas = generatePersonas(11, 1200)
  const graph = buildSocialGraph(personas, 11)

  it('is deterministic', () => {
    expect(buildSocialGraph(personas, 11).edges).toEqual(graph.edges)
  })

  it('has an intra-cluster edge probability far above the inter-cluster one', () => {
    const { intra, inter } = edgeDensities(personas, graph)
    expect(intra).toBeGreaterThan(INTRA_EDGE_P * 0.8)
    expect(inter).toBeLessThan(INTER_EDGE_P * 2.5)
    expect(intra / inter).toBeGreaterThan(20)
    expect(graph.interEdges).toBeGreaterThan(200) // enough bridges for trends to cross clusters
  })

  it('gives everybody at least MIN_FRIENDS friends, sorted by closeness', () => {
    for (const p of personas) {
      const friends = graph.friends.get(p.id)!
      expect(friends.length).toBeGreaterThanOrEqual(MIN_FRIENDS)
      for (let i = 1; i < friends.length; i++)
        expect(friends[i - 1]!.weight).toBeGreaterThanOrEqual(friends[i]!.weight)
      expect(friends.some((f) => f.id === p.id)).toBe(false)
    }
  })

  it('connects the demo circle', () => {
    const byHandle = new Map(personas.map((p) => [p.handle, p.id]))
    for (const [a, b] of DEMO_CIRCLE) {
      const friends = graph.friends.get(byHandle.get(a)!)!
      expect(friends.some((f) => f.id === byHandle.get(b))).toBe(true)
    }
  })
})
