import { computeLineage } from '@lookline/engine'
import {
  generatePersonas,
  buildSocialGraph,
  edgeDensities,
  planSimulation,
  simulateSocial,
  createMemorySink,
} from '../src/index'

const t0 = performance.now()
const personas = generatePersonas(20260918, 1200)
console.log('personas', personas.length, Math.round(performance.now() - t0), 'ms')
console.log('handles unique', new Set(personas.map((p) => p.handle)).size)
console.log('gift share', personas.filter((p) => p.giftHiddenVector).length / personas.length)
console.log(
  'dept',
  Object.entries(
    personas.reduce(
      (m, p) => ({ ...m, [p.department]: (m[p.department] ?? 0) + 1 }),
      {} as Record<string, number>,
    ),
  ),
)
console.log('activity mean', personas.reduce((s, p) => s + p.params.activity, 0) / personas.length)
console.log(
  personas
    .slice(0, 12)
    .map(
      (p) =>
        `${p.id} ${p.handle} ${p.displayName} c${p.socialCluster} ${p.primaryAesthetics.join('/')}`,
    )
    .join('\n'),
)
const t1 = performance.now()
const graph = buildSocialGraph(personas, 20260918)
console.log(
  'graph',
  graph.edges.length,
  edgeDensities(personas, graph),
  Math.round(performance.now() - t1),
  'ms',
)
const degs = personas.map((p) => graph.friends.get(p.id)!.length)
console.log(
  'degree min/mean/max',
  Math.min(...degs),
  degs.reduce((a, b) => a + b, 0) / degs.length,
  Math.max(...degs),
)
const now = new Date('2026-09-18T12:00:00Z')
const t2 = performance.now()
const plan = planSimulation(personas, graph, { seed: 20260918, now, days: 60 })
console.log('plan', plan.events.length, plan.counts, Math.round(performance.now() - t2), 'ms')
console.log(
  'trend seeds',
  plan.trendSeeds.map((s) => `${s.seed.slug} carrier=${s.carrierId} looks=${s.lookIds.length}`),
)
const t3 = performance.now()
// A synthetic pool: the dry run measures the simulation's shape, not the catalogue's.
const groups = ['tops', 'bottoms', 'outerwear', 'footwear', 'bags'] as const
const roles = ['top', 'bottom', 'outer', 'shoes', 'bag'] as const
const articles = Array.from({ length: 4000 }, (_, i) => {
  const g = i % groups.length
  return {
    id: String(i + 1).padStart(10, '0'),
    department: i % 3 === 0 ? ('men' as const) : ('women' as const),
    categoryGroup: groups[g]!,
    outfitRole: roles[g]!,
    subcategory: `type-${g}`,
    price: 300 + ((i * 137) % 4000),
    colorFamily: ['black', 'white', 'blue', 'neutral', 'red'][i % 5]!,
    colorHex: '#1C1C1C',
    popularity: ((i * 31) % 100) / 100,
    name: `Fixture ${i + 1}`,
    pattern: 'Solid',
    styleVector: Array.from({ length: 64 }, (_unused, d) => ((i * 7 + d * 13) % 100) / 100),
  }
})
console.log('catalog', articles.length, Math.round(performance.now() - t3), 'ms')
const sink = createMemorySink(articles as any)
const t4 = performance.now()
const summary = await simulateSocial(sink, {
  seed: 20260918,
  now,
  days: 60,
  personas,
  log: (m) => console.log('  ', m),
})
console.log('sim', Math.round(performance.now() - t4), 'ms', JSON.stringify(summary))
const rows = sink.rows
const clusterOf = new Map(personas.map((p) => [p.id, p.socialCluster]))
const stats = computeLineage({
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
    type: i.type,
    sourceInteractionId: i.sourceInteractionId ?? null,
    createdAt: i.createdAt,
  })),
  purchases: rows.purchases.map((p) => ({
    id: p.id,
    userId: p.userId,
    articleId: p.articleId,
    quantity: 1,
    price: p.price,
    forKind: p.forKind ?? 'self',
    forUserId: p.forUserId ?? null,
    sourceLookId: p.sourceLookId ?? null,
    sourceInteractionId: null,
    intentSessionId: null,
    createdAt: p.createdAt,
  })),
  clusterOf,
})
const deep = stats.filter((s) => s.depth >= 4).toSorted((a, b) => b.depth - a.depth)
console.log(
  'lineages',
  stats.length,
  'depth>=4',
  deep.length,
  deep
    .slice(0, 6)
    .map(
      (s) => `${s.rootLookId} d=${s.depth} n=${s.nodes} c=${s.clustersReached} p=${s.purchases}`,
    ),
)
console.log(
  'interactions by type',
  Object.entries(
    rows.interactions.reduce(
      (m, i) => ({ ...m, [i.type]: (m[i.type] ?? 0) + 1 }),
      {} as Record<string, number>,
    ),
  ),
)
console.log(
  'feedback by kind',
  Object.entries(
    rows.feedback.reduce(
      (m, i) => ({ ...m, [i.kind]: (m[i.kind] ?? 0) + 1 }),
      {} as Record<string, number>,
    ),
  ),
)
console.log(
  'gift share of purchases',
  rows.purchases.filter((p) => p.forKind === 'other').length / rows.purchases.length,
)
for (const p of personas.slice(0, 10))
  console.log(
    p.handle,
    'purchases',
    rows.purchases.filter((x) => x.userId === p.id).length,
    'looks',
    rows.looks.filter((l) => l.ownerId === p.id).length,
  )
