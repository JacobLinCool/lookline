/**
 * Taste clusters (ENGINE_SPEC §5.2): k-means++ over block-scaled, L2-normalised preference
 * vectors with cosine distance; social clusters by label propagation over the relationship graph.
 * Pure and deterministic for a given seed (`createRng` from @lookline/catalog).
 */
import {
  AESTHETICS,
  createRng,
  normalizeVector,
  weightStyleVector,
  STYLE_DIMENSIONS,
} from '@lookline/catalog'
import { aestheticName } from '../constants'
import { compareStrings, type UserLite } from '../shared'

/** Block weights of the preference cosine (§0.8 `PREFERENCE_BLOCK_WEIGHTS`). */
export const PREFERENCE_BLOCK_WEIGHTS = {
  aesthetics: 1,
  colors: 0.7,
  axes: 0.5,
  groups: 0,
} as const

export const KMEANS_DEFAULTS = { iters: 30, tol: 1e-4 } as const
export const CLUSTER_SEED = 20260918
export const MIN_EVENTS_TO_FIT = 3

export function chooseK(n: number): number {
  if (n < 100) return 3
  if (n < 400) return 5
  if (n < 1500) return 8
  return 10
}

/** Block-scale then L2-normalise; the space in which cosine distance = 1 − dot. */
export function prepareVector(v: readonly number[]): number[] {
  return normalizeVector(weightStyleVector(v, PREFERENCE_BLOCK_WEIGHTS))
}

const dot = (a: readonly number[], b: readonly number[]): number => {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0)
  return s
}

/** Cosine distance between unit vectors (0 when identical). */
export const cosineDistance = (a: readonly number[], b: readonly number[]): number =>
  Math.max(0, 1 - dot(a, b))

export function nearestCentroid(
  v: readonly number[],
  centroids: readonly (readonly number[])[],
): number {
  let best = 0
  let bestD = Number.POSITIVE_INFINITY
  for (let c = 0; c < centroids.length; c++) {
    const d = cosineDistance(v, centroids[c]!)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

export interface KMeansResult {
  assignments: number[]
  centroids: number[][]
  iterations: number
  inertia: number
}

/**
 * k-means++ init, Lloyd iterations with cosine distance over `prepareVector(v)`, empty clusters
 * re-seeded with the point farthest from its centroid. `vectors` are raw 64-d style vectors.
 */
export function kmeans(
  vectors: readonly (readonly number[])[],
  k: number,
  seed: number,
  opts: { iters?: number; tol?: number } = {},
): KMeansResult {
  const iters = opts.iters ?? KMEANS_DEFAULTS.iters
  const tol = opts.tol ?? KMEANS_DEFAULTS.tol
  const points = vectors.map(prepareVector)
  const n = points.length
  const kk = Math.max(0, Math.min(k, n))
  if (kk === 0) return { assignments: [], centroids: [], iterations: 0, inertia: 0 }

  const rng = createRng(seed)
  // k-means++ initialisation
  const centroids: number[][] = [points[rng.int(0, n - 1)]!.slice()]
  const minDist = points.map((p) => cosineDistance(p, centroids[0]!))
  while (centroids.length < kk) {
    let total = 0
    for (const d of minDist) total += d * d
    let chosen = -1
    if (total > 0) {
      let r = rng.next() * total
      for (let i = 0; i < n; i++) {
        r -= minDist[i]! * minDist[i]!
        if (r <= 0) {
          chosen = i
          break
        }
      }
    }
    if (chosen < 0) {
      // all points coincide with a centroid: pick the first unused index deterministically
      chosen = minDist.findIndex((d) => d > 0)
      if (chosen < 0) chosen = centroids.length % n
    }
    const c = points[chosen]!.slice()
    centroids.push(c)
    for (let i = 0; i < n; i++) minDist[i] = Math.min(minDist[i]!, cosineDistance(points[i]!, c))
  }

  const assignments = Array.from({ length: n }, () => 0)
  const dists = Array.from({ length: n }, () => 0)
  let iterations = 0
  for (let it = 0; it < iters; it++) {
    iterations = it + 1
    for (let i = 0; i < n; i++) {
      const c = nearestCentroid(points[i]!, centroids)
      assignments[i] = c
      dists[i] = cosineDistance(points[i]!, centroids[c]!)
    }
    // recompute
    const sums = centroids.map(() => Array.from({ length: STYLE_DIMENSIONS }, () => 0))
    const counts = Array.from({ length: centroids.length }, () => 0)
    for (let i = 0; i < n; i++) {
      const s = sums[assignments[i]!]!
      const p = points[i]!
      for (let d = 0; d < STYLE_DIMENSIONS; d++) s[d] = (s[d] ?? 0) + (p[d] ?? 0)
      counts[assignments[i]!] = (counts[assignments[i]!] ?? 0) + 1
    }
    let shift = 0
    const taken = new Set<number>()
    for (let c = 0; c < centroids.length; c++) {
      let next: number[]
      if ((counts[c] ?? 0) === 0) {
        // re-seed with the farthest point not already used for a re-seed this round
        let far = -1
        let farD = -1
        for (let i = 0; i < n; i++) {
          if (taken.has(i)) continue
          if (dists[i]! > farD) {
            farD = dists[i]!
            far = i
          }
        }
        if (far < 0) far = 0
        taken.add(far)
        next = points[far]!.slice()
        assignments[far] = c
        dists[far] = 0
      } else {
        next = normalizeVector(sums[c]!.map((x) => x / counts[c]!))
      }
      shift = Math.max(shift, cosineDistance(next, centroids[c]!))
      centroids[c] = next
    }
    if (shift < tol) break
  }
  let inertia = 0
  for (let i = 0; i < n; i++) {
    const c = nearestCentroid(points[i]!, centroids)
    assignments[i] = c
    inertia += cosineDistance(points[i]!, centroids[c]!)
  }
  return { assignments, centroids, iterations, inertia }
}

export interface ClusterAssignment {
  assignments: Map<string, number>
  centroids: number[][]
  k: number
}

/**
 * Fit k-means on users with `eventCount ≥ 3` (falls back to every user with a vector when too
 * few have enough events) and assign everyone else to the nearest centroid. Users without a
 * preference vector are not assigned.
 */
export function clusterUsers(
  users: readonly UserLite[],
  seed: number = CLUSTER_SEED,
): ClusterAssignment {
  const withVector = users
    .filter((u) => u.preferenceVector && u.preferenceVector.length > 0)
    .toSorted((a, b) => compareStrings(a.id, b.id))
  if (withVector.length === 0) return { assignments: new Map(), centroids: [], k: 0 }
  let fit = withVector.filter((u) => u.eventCount >= MIN_EVENTS_TO_FIT)
  const k = Math.min(chooseK(withVector.length), withVector.length)
  if (fit.length < 2 * k) fit = withVector
  const result = kmeans(
    fit.map((u) => u.preferenceVector!),
    k,
    seed,
  )
  const assignments = new Map<string, number>()
  fit.forEach((u, i) => assignments.set(u.id, result.assignments[i] ?? 0))
  for (const u of withVector) {
    if (assignments.has(u.id)) continue
    assignments.set(u.id, nearestCentroid(prepareVector(u.preferenceVector!), result.centroids))
  }
  return { assignments, centroids: result.centroids, k: result.centroids.length }
}

/** Top aesthetics of a centroid (dims 0–31) and the "a / b" label of §5.2. */
export function clusterLabel(
  centroid: readonly number[],
  top = 4,
): { label: string; topAesthetics: string[] } {
  const ranked = AESTHETICS.map((a) => ({ slug: a.slug, w: centroid[a.index] ?? 0 }))
    .filter((a) => a.w > 0)
    .toSorted((x, y) => y.w - x.w || compareStrings(x.slug, y.slug))
    .slice(0, top)
    .map((a) => a.slug)
  const label = ranked.slice(0, 2).map(aestheticName).join(' / ') || 'Unlabelled'
  return { label, topAesthetics: ranked }
}

export interface LabelNode {
  id: string
  /** A label that must not change (the simulation's `users.socialCluster`). */
  fixed: number | null
  /** Initial label for free nodes (the taste cluster). */
  seed: number | null
}

export interface LabelEdge {
  a: string
  b: string
  weight: number
}

/**
 * Synchronous weighted label propagation over an undirected graph for `iters` rounds; ties go to
 * the lowest label; nodes with no labelled neighbour keep their label.
 */
export function labelPropagation(
  nodes: readonly LabelNode[],
  edges: readonly LabelEdge[],
  iters = 10,
): Map<string, number | null> {
  const labels = new Map<string, number | null>()
  const fixed = new Set<string>()
  for (const n of nodes) {
    labels.set(n.id, n.fixed ?? n.seed)
    if (n.fixed !== null) fixed.add(n.id)
  }
  const adj = new Map<string, Array<{ other: string; w: number }>>()
  const link = (a: string, b: string, w: number): void => {
    const list = adj.get(a)
    if (list) list.push({ other: b, w })
    else adj.set(a, [{ other: b, w }])
  }
  for (const e of edges) {
    if (!labels.has(e.a) || !labels.has(e.b) || e.a === e.b) continue
    link(e.a, e.b, e.weight)
    link(e.b, e.a, e.weight)
  }
  const order = nodes.map((n) => n.id).toSorted(compareStrings)
  for (let it = 0; it < iters; it++) {
    let changed = false
    const next = new Map(labels)
    for (const id of order) {
      if (fixed.has(id)) continue
      const tally = new Map<number, number>()
      for (const { other, w } of adj.get(id) ?? []) {
        const l = labels.get(other)
        if (l === null || l === undefined) continue
        tally.set(l, (tally.get(l) ?? 0) + w)
      }
      if (tally.size === 0) continue
      let best: number | null = null
      let bestW = -1
      for (const [l, w] of tally) {
        if (w > bestW || (w === bestW && best !== null && l < best)) {
          best = l
          bestW = w
        }
      }
      if (best !== labels.get(id)) {
        next.set(id, best)
        changed = true
      }
    }
    for (const [k, v] of next) labels.set(k, v)
    if (!changed) break
  }
  return labels
}
