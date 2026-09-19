import { createRng, findAesthetic, zeroVector } from '@lookline/catalog'
import { describe, expect, it } from 'vitest'
import type { UserLite } from '../shared'
import { chooseK, clusterLabel, clusterUsers, kmeans, labelPropagation } from './cluster'

function blob(dim: number, n: number, seed: number): number[][] {
  const rng = createRng(seed)
  return Array.from({ length: n }, () => {
    const v = zeroVector()
    v[dim] = 0.8 + rng.float(0, 0.2)
    v[(dim + 1) % 32] = rng.float(0, 0.15)
    v[32 + (dim % 12)] = 1
    v[44] = rng.float(0.3, 0.7)
    return v
  })
}

describe('kmeans', () => {
  const points = [...blob(0, 10, 1), ...blob(5, 10, 2), ...blob(10, 10, 3)]

  it('separates three blobs with exact membership', () => {
    const { assignments, centroids } = kmeans(points, 3, 42)
    expect(centroids).toHaveLength(3)
    const groups = [assignments.slice(0, 10), assignments.slice(10, 20), assignments.slice(20, 30)]
    for (const g of groups) expect(new Set(g).size).toBe(1)
    expect(new Set(groups.map((g) => g[0]!)).size).toBe(3)
  })

  it('is deterministic for a fixed seed', () => {
    const a = kmeans(points, 3, 7)
    const b = kmeans(points, 3, 7)
    expect(a.assignments).toEqual(b.assignments)
    expect(a.centroids).toEqual(b.centroids)
  })

  it('re-seeds empty clusters instead of producing NaN centroids', () => {
    const a = blob(0, 1, 1)[0]!
    const b = blob(5, 1, 2)[0]!
    const dup = [a, a, a, a, b, b, b, b]
    const { centroids, assignments } = kmeans(dup, 3, 3)
    expect(centroids).toHaveLength(3)
    for (const c of centroids) for (const x of c) expect(Number.isFinite(x)).toBe(true)
    expect(assignments).toHaveLength(8)
  })

  it('handles k larger than n and empty input', () => {
    expect(kmeans([], 3, 1).centroids).toEqual([])
    expect(kmeans(points.slice(0, 2), 5, 1).centroids).toHaveLength(2)
  })
})

describe('chooseK', () => {
  it('follows the §5.2 table', () => {
    expect(chooseK(10)).toBe(3)
    expect(chooseK(99)).toBe(3)
    expect(chooseK(100)).toBe(5)
    expect(chooseK(399)).toBe(5)
    expect(chooseK(400)).toBe(8)
    expect(chooseK(1499)).toBe(8)
    expect(chooseK(1500)).toBe(10)
  })
})

describe('clusterUsers', () => {
  it('fits on users with ≥ 3 events and assigns the rest to the nearest centroid', () => {
    const vectors = [...blob(0, 20, 1), ...blob(5, 20, 2), ...blob(10, 20, 3)]
    const users: UserLite[] = vectors.map((v, i) => ({
      id: `u${String(i).padStart(3, '0')}`,
      handle: `u${i}`,
      displayName: `U${i}`,
      avatarSeed: i,
      tasteCluster: null,
      socialCluster: null,
      preferenceVector: v,
      eventCount: i % 4 === 0 ? 1 : 5,
    }))
    users.push({ ...users[0]!, id: 'u_novector', preferenceVector: null })
    const result = clusterUsers(users, 11)
    expect(result.k).toBe(3)
    expect(result.assignments.size).toBe(60)
    expect(result.assignments.has('u_novector')).toBe(false)
    // the cold user u000 (blob 0) lands with the other blob-0 users
    expect(result.assignments.get('u000')).toBe(result.assignments.get('u001'))
    expect(result.assignments.get('u020')).not.toBe(result.assignments.get('u001'))
  })

  it('labels a centroid by its top-2 aesthetics', () => {
    const c = zeroVector()
    c[0] = 0.9 // minimalist
    c[1] = 0.6 // quiet-luxury
    c[2] = 0.1 // streetwear
    const { label, topAesthetics } = clusterLabel(c)
    expect(label).toBe(
      `${findAesthetic('minimalist')!.name} / ${findAesthetic('quiet-luxury')!.name}`,
    )
    expect(topAesthetics).toEqual(['minimalist', 'quiet-luxury', 'streetwear'])
  })
})

describe('labelPropagation', () => {
  it('propagates fixed labels along a chain and converges within 10 iterations', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      fixed: id === 'a' ? 1 : id === 'e' ? 2 : null,
      seed: null,
    }))
    const edges = [
      { a: 'a', b: 'b', weight: 1 },
      { a: 'b', b: 'c', weight: 1 },
      { a: 'c', b: 'd', weight: 1 },
      { a: 'd', b: 'e', weight: 2 },
    ]
    const labels = labelPropagation(nodes, edges)
    expect(labels.get('a')).toBe(1)
    expect(labels.get('b')).toBe(1)
    expect(labels.get('d')).toBe(2) // the heavier edge to e wins over c
    expect(labels.get('e')).toBe(2)
    // c is a tie between b (1) and d (2) → lowest label wins
    expect(labels.get('c')).toBe(1)
    expect(labelPropagation(nodes, edges, 3)).toEqual(labels)
  })

  it('keeps the seed label for isolated nodes', () => {
    const labels = labelPropagation([{ id: 'x', fixed: null, seed: 4 }], [])
    expect(labels.get('x')).toBe(4)
  })
})
