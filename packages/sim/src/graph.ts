/**
 * Friendship graph: dense inside a social cluster (`INTRA_EDGE_P`), sparse across clusters
 * (`INTER_EDGE_P`, two orders of magnitude lower), every persona has at least `MIN_FRIENDS`,
 * and the demo personas form a small cross-cluster circle so their shares and remixes meet on
 * the demo pages. Pure in (personas, seed).
 */
import { createRng, hashSeed } from '@lookline/catalog'
import { DEMO_PERSONAS } from './personas'
import type { Friend, Persona, SocialGraph } from './types'

export const INTRA_EDGE_P = 0.12
export const INTER_EDGE_P = 0.0015
export const MIN_FRIENDS = 2

/** Demo circle: pairs of demo handles that are friends regardless of cluster. */
export const DEMO_CIRCLE: ReadonlyArray<readonly [string, string]> = [
  ['jacob', 'alice'],
  ['jacob', 'ken'],
  ['jacob', 'mei'],
  ['jacob', 'noah'],
  ['alice', 'mei'],
  ['alice', 'yuki'],
  ['alice', 'aria'],
  ['mei', 'hana'],
  ['ken', 'leo'],
  ['ken', 'yuki'],
  ['yuki', 'hana'],
  ['hana', 'aria'],
  ['noah', 'leo'],
  ['noah', 'ravi'],
  ['leo', 'ravi'],
  ['aria', 'ravi'],
  ['hana', 'ken'],
  ['mei', 'ravi'],
]

const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function buildSocialGraph(personas: readonly Persona[], seed: number): SocialGraph {
  const rng = createRng(hashSeed(seed, 'social-graph'))
  const edges = new Map<string, { a: string; b: string; weight: number; sameCluster: boolean }>()
  const addEdge = (a: Persona, b: Persona, weight: number): void => {
    if (a.id === b.id) return
    const key = edgeKey(a.id, b.id)
    if (edges.has(key)) return
    edges.set(key, {
      a: a.id,
      b: b.id,
      weight,
      sameCluster: a.socialCluster === b.socialCluster,
    })
  }

  // 1. random edges (one draw per unordered pair, in index order)
  for (let i = 0; i < personas.length; i++) {
    const a = personas[i]!
    for (let j = i + 1; j < personas.length; j++) {
      const b = personas[j]!
      const p = a.socialCluster === b.socialCluster ? INTRA_EDGE_P : INTER_EDGE_P
      if (rng.next() < p) addEdge(a, b, rng.float(0.3, 1))
    }
  }

  // 2. demo circle
  const byHandle = new Map(personas.map((p) => [p.handle, p]))
  for (const [x, y] of DEMO_CIRCLE) {
    const a = byHandle.get(x)
    const b = byHandle.get(y)
    if (a && b) addEdge(a, b, rng.float(0.7, 1))
  }
  if (DEMO_PERSONAS.length > 0) {
    // demo personas also know a few cluster mates well (so cluster shares originate from them)
    for (const spec of DEMO_PERSONAS) {
      const demo = byHandle.get(spec.handle)
      if (!demo) continue
      const mates = personas.filter(
        (p) => p.socialCluster === demo.socialCluster && p.id !== demo.id,
      )
      for (const mate of rng.shuffle(mates).slice(0, 4)) addEdge(demo, mate, rng.float(0.6, 1))
    }
  }

  // 3. minimum degree: connect isolated personas to random cluster mates
  const degree = new Map<string, number>()
  for (const e of edges.values()) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }
  const byCluster = new Map<number, Persona[]>()
  for (const p of personas) {
    const list = byCluster.get(p.socialCluster)
    if (list) list.push(p)
    else byCluster.set(p.socialCluster, [p])
  }
  for (const p of personas) {
    let d = degree.get(p.id) ?? 0
    const mates = (byCluster.get(p.socialCluster) ?? []).filter((m) => m.id !== p.id)
    let guard = 0
    while (d < MIN_FRIENDS && mates.length > 0 && guard++ < 20) {
      const mate = rng.pick(mates)
      const before = edges.size
      addEdge(p, mate, rng.float(0.3, 0.8))
      if (edges.size > before) {
        d += 1
        degree.set(p.id, d)
        degree.set(mate.id, (degree.get(mate.id) ?? 0) + 1)
      }
    }
  }

  // 4. adjacency sorted by closeness
  const friends = new Map<string, Friend[]>()
  for (const p of personas) friends.set(p.id, [])
  let intraEdges = 0
  let interEdges = 0
  for (const e of edges.values()) {
    if (e.sameCluster) intraEdges++
    else interEdges++
    friends.get(e.a)?.push({ id: e.b, weight: e.weight, sameCluster: e.sameCluster })
    friends.get(e.b)?.push({ id: e.a, weight: e.weight, sameCluster: e.sameCluster })
  }
  for (const list of friends.values()) {
    list.sort((x, y) => y.weight - x.weight || (x.id < y.id ? -1 : 1))
  }
  return {
    friends,
    edges: [...edges.values()].toSorted((x, y) =>
      x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1,
    ),
    intraEdges,
    interEdges,
  }
}

/** Realised edge probabilities inside and across clusters. */
export function edgeDensities(
  personas: readonly Persona[],
  graph: SocialGraph,
): { intra: number; inter: number } {
  const sizes = new Map<number, number>()
  for (const p of personas) sizes.set(p.socialCluster, (sizes.get(p.socialCluster) ?? 0) + 1)
  let intraPairs = 0
  for (const n of sizes.values()) intraPairs += (n * (n - 1)) / 2
  const allPairs = (personas.length * (personas.length - 1)) / 2
  const interPairs = allPairs - intraPairs
  return {
    intra: intraPairs > 0 ? graph.intraEdges / intraPairs : 0,
    inter: interPairs > 0 ? graph.interEdges / interPairs : 0,
  }
}
