/**
 * Lineage statistics and influencers (ENGINE_SPEC §5.3). Pure: consumes lightweight look,
 * participant, interaction and purchase rows plus the user → taste-cluster map.
 *
 * Tree edges are `looks.parent_look_id`; a Together edition is additionally a child of every
 * `look_participants.source_look_id`, so it can belong to several trees (visited-set per root).
 */
import { DAY_MS, compareStrings } from '../shared'
import type { InteractionLite, LookLite, ParticipantLite, PurchaseLite } from '../shared'

export interface LineageInput {
  looks: readonly LookLite[]
  participants: readonly ParticipantLite[]
  interactions: readonly InteractionLite[]
  purchases: readonly PurchaseLite[]
  /** user id → taste cluster (null when unknown). */
  clusterOf: ReadonlyMap<string, number | null>
}

export interface LineageStatRow {
  rootLookId: string
  depth: number
  nodes: number
  uniquePeople: number
  clustersReached: number
  shares: number
  asks: number
  remixes: number
  purchases: number
  gmv: number
  velocity: number
  shareToRemixRate: number
  remixToPurchaseRate: number
  firstAt: Date
  lastAt: Date
}

export interface LineageForest {
  /** parent → children, in creation order. */
  children: ReadonlyMap<string, readonly string[]>
  /** child → parents. */
  parents: ReadonlyMap<string, readonly string[]>
  /** Looks with no parent, in creation order. */
  roots: readonly string[]
  lookById: ReadonlyMap<string, LookLite>
}

const byCreated =
  (lookById: ReadonlyMap<string, LookLite>) =>
  (a: string, b: string): number => {
    const la = lookById.get(a)
    const lb = lookById.get(b)
    const ta = la?.createdAt.getTime() ?? 0
    const tb = lb?.createdAt.getTime() ?? 0
    return ta - tb || compareStrings(a, b)
  }

export function buildForest(
  looks: readonly LookLite[],
  participants: readonly ParticipantLite[],
): LineageForest {
  const lookById = new Map(looks.map((l) => [l.id, l]))
  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  const link = (parent: string, child: string): void => {
    if (parent === child || !lookById.has(parent) || !lookById.has(child)) return
    const ps = parents.get(child)
    if (ps?.includes(parent)) return
    if (ps) ps.push(parent)
    else parents.set(child, [parent])
    const cs = children.get(parent)
    if (cs) cs.push(child)
    else children.set(parent, [child])
  }
  for (const look of looks) if (look.parentLookId) link(look.parentLookId, look.id)
  for (const p of participants) {
    if (!p.sourceLookId) continue
    const look = lookById.get(p.lookId)
    if (look?.kind === 'together') link(p.sourceLookId, p.lookId)
  }
  const cmp = byCreated(lookById)
  for (const list of children.values()) list.sort(cmp)
  const roots = looks
    .filter((l) => !parents.has(l.id))
    .map((l) => l.id)
    .toSorted(cmp)
  return { children, parents, roots, lookById }
}

export interface TreeWalk {
  /** Node ids in creation order (root first). */
  order: string[]
  /** Longest root → node path length (root = 0). */
  depthOf: Map<string, number>
}

/** BFS from `rootId` with a visited-set guard, capped at `maxNodes`; depths via creation order. */
export function collectTree(forest: LineageForest, rootId: string, maxNodes = Infinity): TreeWalk {
  const visited = new Set<string>([rootId])
  const queue = [rootId]
  for (let i = 0; i < queue.length && visited.size < maxNodes; i++) {
    for (const child of forest.children.get(queue[i]!) ?? []) {
      if (visited.has(child)) continue
      visited.add(child)
      queue.push(child)
      if (visited.size >= maxNodes) break
    }
  }
  const order = [...visited].toSorted(byCreated(forest.lookById))
  const depthOf = new Map<string, number>()
  for (const id of order) {
    if (id === rootId) {
      depthOf.set(id, 0)
      continue
    }
    let depth = 0
    for (const p of forest.parents.get(id) ?? []) {
      const dp = depthOf.get(p)
      if (dp !== undefined) depth = Math.max(depth, dp + 1)
    }
    depthOf.set(id, depth)
  }
  return { order, depthOf }
}

const PEOPLE_TYPES = new Set(['SAVE', 'REACT', 'ASK', 'ADVISE', 'SHARE'])

interface LookIndex {
  interactionsByLook: Map<string, InteractionLite[]>
  purchasesByLook: Map<string, PurchaseLite[]>
}

function indexByLook(input: LineageInput): LookIndex {
  const interactionsByLook = new Map<string, InteractionLite[]>()
  for (const ix of input.interactions) {
    if (!ix.lookId) continue
    const list = interactionsByLook.get(ix.lookId)
    if (list) list.push(ix)
    else interactionsByLook.set(ix.lookId, [ix])
  }
  const purchasesByLook = new Map<string, PurchaseLite[]>()
  for (const p of input.purchases) {
    if (!p.sourceLookId) continue
    const list = purchasesByLook.get(p.sourceLookId)
    if (list) list.push(p)
    else purchasesByLook.set(p.sourceLookId, [p])
  }
  return { interactionsByLook, purchasesByLook }
}

/** Statistics of one tree (used for `lineage_stats` and as the fallback of `getLineage`). */
export function statsForTree(
  forest: LineageForest,
  walk: TreeWalk,
  rootId: string,
  index: LookIndex,
  clusterOf: ReadonlyMap<string, number | null>,
): LineageStatRow {
  const root = forest.lookById.get(rootId)!
  const people = new Set<string>()
  const clusters = new Set<number>()
  let shares = 0
  let asks = 0
  let remixes = 0
  let purchases = 0
  let gmv = 0
  let depth = 0
  let lastAt = root.createdAt
  for (const id of walk.order) {
    const look = forest.lookById.get(id)!
    people.add(look.ownerId)
    const c = clusterOf.get(look.ownerId)
    if (c !== null && c !== undefined) clusters.add(c)
    if (look.kind === 'remix' && id !== rootId) remixes++
    if (look.createdAt > lastAt) lastAt = look.createdAt
    depth = Math.max(depth, walk.depthOf.get(id) ?? 0)
    for (const ix of index.interactionsByLook.get(id) ?? []) {
      if (PEOPLE_TYPES.has(ix.type)) people.add(ix.actorUserId)
      if (ix.type === 'SHARE') shares++
      else if (ix.type === 'ASK') asks++
    }
    for (const p of index.purchasesByLook.get(id) ?? []) {
      if (p.userId === root.ownerId) continue
      purchases++
      gmv += p.price * p.quantity
    }
  }
  const nodes = walk.order.length
  const spanDays = Math.max(1, (lastAt.getTime() - root.createdAt.getTime()) / DAY_MS)
  return {
    rootLookId: rootId,
    depth,
    nodes,
    uniquePeople: people.size,
    clustersReached: Math.max(1, clusters.size),
    shares,
    asks,
    remixes,
    purchases,
    gmv,
    velocity: (nodes - 1) / spanDays,
    shareToRemixRate: remixes / Math.max(shares, 1),
    remixToPurchaseRate: purchases / Math.max(remixes, 1),
    firstAt: root.createdAt,
    lastAt,
  }
}

/** One `lineage_stats` row per root Look. */
export function computeLineage(input: LineageInput): LineageStatRow[] {
  const forest = buildForest(input.looks, input.participants)
  const index = indexByLook(input)
  return forest.roots.map((rootId) =>
    statsForTree(forest, collectTree(forest, rootId), rootId, index, input.clusterOf),
  )
}

export interface InfluencerRow {
  userId: string
  influence: number
  remixesCaused: number
  downstreamPurchases: number
  downstreamGmv: number
  clustersReached: number
}

export function influenceScore(
  remixesCaused: number,
  downstreamPurchases: number,
  clustersReached: number,
): number {
  return (
    1 -
    Math.exp(
      -(
        0.5 * Math.log1p(remixesCaused) +
        0.3 * Math.log1p(downstreamPurchases) +
        0.2 * clustersReached
      ) / 2,
    )
  )
}

/**
 * Influencers (§5.3): per user, remix children of their Looks (by other people), purchases and GMV
 * attributed to the subtrees of their Looks (by other people), clusters reached by those
 * subtrees. Only users with any remix or purchase caused are listed.
 */
export function computeInfluencers(input: LineageInput, limit = 10): InfluencerRow[] {
  const forest = buildForest(input.looks, input.participants)
  const index = indexByLook(input)
  const looksByOwner = new Map<string, LookLite[]>()
  for (const look of input.looks) {
    const list = looksByOwner.get(look.ownerId)
    if (list) list.push(look)
    else looksByOwner.set(look.ownerId, [look])
  }
  const rows: InfluencerRow[] = []
  for (const [userId, looks] of looksByOwner) {
    let remixesCaused = 0
    const subtree = new Set<string>()
    for (const look of looks) {
      for (const child of forest.children.get(look.id) ?? []) {
        const c = forest.lookById.get(child)
        if (c && c.kind === 'remix' && c.ownerId !== userId) remixesCaused++
      }
      for (const id of collectTree(forest, look.id).order) subtree.add(id)
    }
    let downstreamPurchases = 0
    let downstreamGmv = 0
    const clusters = new Set<number>()
    for (const id of subtree) {
      const look = forest.lookById.get(id)!
      const c = input.clusterOf.get(look.ownerId)
      if (c !== null && c !== undefined) clusters.add(c)
      for (const p of index.purchasesByLook.get(id) ?? []) {
        if (p.userId === userId) continue
        downstreamPurchases++
        downstreamGmv += p.price * p.quantity
      }
    }
    if (remixesCaused === 0 && downstreamPurchases === 0) continue
    const clustersReached = Math.max(1, clusters.size)
    rows.push({
      userId,
      influence: influenceScore(remixesCaused, downstreamPurchases, clustersReached),
      remixesCaused,
      downstreamPurchases,
      downstreamGmv,
      clustersReached,
    })
  }
  rows.sort(
    (a, b) =>
      b.influence - a.influence ||
      b.downstreamGmv - a.downstreamGmv ||
      compareStrings(a.userId, b.userId),
  )
  return rows.slice(0, limit)
}
