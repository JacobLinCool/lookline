/**
 * Smoke test of the analytics module against the local database: inserts a tiny synthetic history
 * (ids prefixed `fx_`), runs `runAnalytics`, `getTrendDashboard`, `getLineage`, `getUserNetwork`,
 * prints compact results and removes the fixture rows again (then re-runs analytics so the
 * derived tables reflect the remaining data).
 *
 *   pnpm --filter @lookline/engine exec tsx scripts/analytics-fixture.ts
 */
import { zeroVector } from '@lookline/catalog'
import {
  asks,
  askResponses,
  feedbackEvents,
  intentSessions,
  interactions,
  like,
  lookArticles,
  looks,
  or,
  articles,
  purchases,
  relationships,
  sql,
  users,
} from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'
import type { LineageNode } from '../src/types'
import { getLineage, getTrendDashboard, getUserNetwork, runAnalytics } from '../src/analytics'

loadEnv()
const handle = createLocalDb()
const { db } = handle
const now = new Date()
const DAY = 86_400_000
const ago = (days: number, hours = 0): Date =>
  new Date(now.getTime() - days * DAY - hours * 3_600_000)

const vec = (dims: Record<number, number>): number[] => {
  const v = zeroVector()
  for (const [i, w] of Object.entries(dims)) v[Number(i)] = w
  v[44] = 0.5
  return v
}

async function cleanup(): Promise<void> {
  await db
    .delete(relationships)
    .where(or(like(relationships.aUserId, 'fx\\_%'), like(relationships.bUserId, 'fx\\_%')))
  await db.delete(feedbackEvents).where(like(feedbackEvents.id, 'fx\\_%'))
  await db.delete(intentSessions).where(like(intentSessions.id, 'fx\\_%'))
  await db.delete(purchases).where(like(purchases.id, 'fx\\_%'))
  await db.delete(interactions).where(like(interactions.id, 'fx\\_%'))
  await db.delete(askResponses).where(like(askResponses.id, 'fx\\_%'))
  await db.delete(asks).where(like(asks.id, 'fx\\_%'))
  await db.delete(looks).where(like(looks.id, 'fx\\_%')) // cascades look_products, participants, lineage_stats
  await db.delete(users).where(like(users.id, 'fx\\_%'))
}

const ix = (
  id: string,
  actor: string,
  type: (typeof interactions.$inferInsert)['type'],
  extra: Partial<typeof interactions.$inferInsert>,
  at: Date,
) => ({
  id,
  actorUserId: actor,
  type,
  createdAt: at,
  ...extra,
})

async function insertFixture(articleIds: string[]): Promise<void> {
  const [p1, p2, p3] = articleIds
  await db.insert(users).values([
    {
      id: 'fx_u1',
      handle: 'fx_u1',
      displayName: 'Fixture One',
      avatarSeed: 1,
      isPersona: true,
      preferenceVector: vec({ 0: 0.9, 1: 0.5, 32: 1 }),
      socialCluster: 7,
    },
    {
      id: 'fx_u2',
      handle: 'fx_u2',
      displayName: 'Fixture Two',
      avatarSeed: 2,
      isPersona: true,
      preferenceVector: vec({ 2: 0.9, 3: 0.4, 33: 1 }),
    },
    {
      id: 'fx_u3',
      handle: 'fx_u3',
      displayName: 'Fixture Three',
      avatarSeed: 3,
      isPersona: true,
      preferenceVector: vec({ 0: 0.8, 7: 0.6, 35: 1 }),
    },
  ])
  await db.insert(looks).values([
    {
      id: 'fx_l1',
      ownerId: 'fx_u1',
      kind: 'edition',
      title: 'Fixture root',
      stylePreset: 'studio',
      aesthetics: ['minimalist'],
      palette: ['#000'],
      styleVector: vec({}),
      shareToken: 'fx_t1',
      visibility: 'public',
      createdAt: ago(10),
    },
    {
      id: 'fx_l2',
      ownerId: 'fx_u2',
      kind: 'remix',
      title: 'Fixture remix 1',
      stylePreset: 'studio',
      aesthetics: ['minimalist', 'streetwear'],
      palette: ['#111'],
      styleVector: vec({}),
      shareToken: 'fx_t2',
      visibility: 'public',
      parentLookId: 'fx_l1',
      rootLookId: 'fx_l1',
      depth: 1,
      createdAt: ago(7),
    },
    {
      id: 'fx_l3',
      ownerId: 'fx_u3',
      kind: 'remix',
      title: 'Fixture remix 2',
      stylePreset: 'studio',
      aesthetics: ['minimalist'],
      palette: ['#222'],
      styleVector: vec({}),
      shareToken: 'fx_t3',
      visibility: 'public',
      parentLookId: 'fx_l2',
      rootLookId: 'fx_l1',
      depth: 2,
      createdAt: ago(4),
    },
    {
      id: 'fx_l4',
      ownerId: 'fx_u1',
      kind: 'remix',
      title: 'Fixture remix 3',
      stylePreset: 'studio',
      aesthetics: ['quiet-luxury'],
      palette: ['#333'],
      styleVector: vec({}),
      shareToken: 'fx_t4',
      visibility: 'public',
      parentLookId: 'fx_l3',
      rootLookId: 'fx_l1',
      depth: 3,
      createdAt: ago(1),
    },
  ])
  if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
    await db.insert(lookArticles).values([
      { lookId: 'fx_l1', articleId: p1, role: 'top', position: 0 },
      { lookId: 'fx_l1', articleId: p2, role: 'bottom', position: 1 },
      { lookId: 'fx_l2', articleId: p1, role: 'top', position: 0 },
      { lookId: 'fx_l2', articleId: p3, role: 'shoes', position: 1 },
      { lookId: 'fx_l3', articleId: p3, role: 'shoes', position: 0 },
      { lookId: 'fx_l4', articleId: p2, role: 'bottom', position: 0 },
    ])
  }
  await db.insert(asks).values([
    {
      id: 'fx_a1',
      askerId: 'fx_u2',
      targetUserId: 'fx_u1',
      kind: 'choose',
      question: 'Which one?',
      optionArticleIds: p1 !== undefined && p2 !== undefined ? [p1, p2] : [],
      lookId: 'fx_l1',
      shareToken: 'fx_ta1',
      status: 'answered',
      createdAt: ago(6),
    },
  ])
  await db.insert(askResponses).values([
    {
      id: 'fx_r1',
      askId: 'fx_a1',
      responderUserId: 'fx_u1',
      choiceArticleId: p1 ?? null,
      comment: 'The first.',
      createdAt: ago(6, -1),
    },
  ])
  await db
    .insert(interactions)
    .values([
      ix('fx_i01', 'fx_u1', 'LOOK_CREATE', { lookId: 'fx_l1' }, ago(10)),
      ix('fx_i02', 'fx_u2', 'REMIX', { lookId: 'fx_l2', targetUserId: 'fx_u1' }, ago(7)),
      ix('fx_i03', 'fx_u2', 'LOOK_CREATE', { lookId: 'fx_l2' }, ago(7)),
      ix('fx_i04', 'fx_u3', 'REMIX', { lookId: 'fx_l3', targetUserId: 'fx_u2' }, ago(4)),
      ix('fx_i05', 'fx_u3', 'LOOK_CREATE', { lookId: 'fx_l3' }, ago(4)),
      ix('fx_i06', 'fx_u1', 'REMIX', { lookId: 'fx_l4', targetUserId: 'fx_u3' }, ago(1)),
      ix('fx_i07', 'fx_u1', 'LOOK_CREATE', { lookId: 'fx_l4' }, ago(1)),
      ix('fx_i08', 'fx_u1', 'SHARE', { lookId: 'fx_l1' }, ago(9)),
      ix('fx_i09', 'fx_u2', 'REACT', { lookId: 'fx_l1' }, ago(8)),
      ix('fx_i10', 'fx_u3', 'REACT', { lookId: 'fx_l2' }, ago(5)),
      ix(
        'fx_i11',
        'fx_u2',
        'ASK',
        { askId: 'fx_a1', lookId: 'fx_l1', targetUserId: 'fx_u1' },
        ago(6),
      ),
      ix(
        'fx_i12',
        'fx_u1',
        'ADVISE',
        { askId: 'fx_a1', targetUserId: 'fx_u2', articleId: p1 ?? null },
        ago(6, -1),
      ),
      ix(
        'fx_i13',
        'fx_u3',
        'SAVE',
        { articleId: p3 ?? null, lookId: p3 === undefined ? 'fx_l2' : null },
        ago(3),
      ),
      ix(
        'fx_i14',
        'fx_u2',
        'VIEW',
        { articleId: p2 ?? null, lookId: p2 === undefined ? 'fx_l1' : null },
        ago(2),
      ),
      ix('fx_i15', 'fx_u3', 'SHARE', { lookId: 'fx_l3' }, ago(2)),
    ])
  if (p1 !== undefined && p3 !== undefined) {
    await db.insert(purchases).values([
      {
        id: 'fx_p1',
        userId: 'fx_u2',
        articleId: p1,
        price: 1800,
        quantity: 1,
        forKind: 'self',
        sourceLookId: 'fx_l1',
        sourceAskId: 'fx_a1',
        intentSessionId: 'fx_s1',
        createdAt: ago(5),
      },
      {
        id: 'fx_p2',
        userId: 'fx_u3',
        articleId: p3,
        price: 2400,
        quantity: 2,
        forKind: 'other',
        forUserId: 'fx_u1',
        sourceLookId: 'fx_l2',
        createdAt: ago(2),
      },
    ])
    const rows = await db
      .select({
        categoryGroup: articles.categoryGroup,
        colorFamily: articles.colorFamily,
      })
      .from(articles)
      .where(sql`${articles.id} = ${p1}`)
    const p = rows[0]
    await db.insert(intentSessions).values([
      {
        id: 'fx_s1',
        userId: 'fx_u2',
        utterance: 'a clean minimalist piece for the office',
        locale: 'en',
        intent: {
          mode: 'single',
          aesthetics: ['minimalist'],
          categoryGroups: p ? [p.categoryGroup] : ['tops'],
          colorFamilies: p ? [p.colorFamily] : [],
        },
        createdAt: ago(5, 1),
      },
      {
        id: 'fx_s2',
        userId: 'fx_u3',
        utterance: '極簡風 黑色 上班穿',
        locale: 'zh-TW',
        intent: {
          mode: 'outfit',
          aesthetics: ['minimalist'],
          categoryGroups: [],
          colorFamilies: ['black'],
        },
        createdAt: ago(1),
      },
    ])
  }
  await db.insert(feedbackEvents).values(
    ['fx_u1', 'fx_u2', 'fx_u3'].flatMap((userId, i) =>
      [0, 1, 2].map((j) => ({
        id: `fx_f${i}${j}`,
        userId,
        articleId: p1 ?? null,
        kind: 'save' as const,
        reward: 0.3,
        createdAt: ago(3 - j),
      })),
    ),
  )
}

const walk = (n: LineageNode, depth = 0): string[] => [
  `${'  '.repeat(depth)}${n.look.id} (${n.look.kind}, @${n.owner.handle}, ${n.articles.length} articles, ${n.reactions} reactions, ${n.purchases} purchases, gmv ${n.gmv})`,
  ...n.children.flatMap((c) => walk(c, depth + 1)),
]

const t = (label: string, ms: number) => console.log(`  ${label.padEnd(20)} ${ms.toFixed(0)} ms`)

try {
  await cleanup()
  const productRows = await db
    .select({ id: articles.id })
    .from(articles)
    .where(sql`cast(${articles.id} as integer) <= 10`)
    .orderBy(articles.id)
  const articleIds = productRows.map((r) => r.id)
  if (articleIds.length < 3)
    console.log(
      `articles 1..10 missing (${articleIds.length} found): skipping look_products, purchases and intent sessions`,
    )
  await insertFixture(articleIds)
  console.log('fixture inserted')

  let t0 = performance.now()
  const summary = await runAnalytics(db, { now })
  t('runAnalytics', performance.now() - t0)
  console.log(JSON.stringify(summary))

  t0 = performance.now()
  const dash = await getTrendDashboard(db, { days: 60, now })
  t('getTrendDashboard', performance.now() - t0)
  console.log(
    JSON.stringify(
      {
        headline: dash.headline,
        aesthetics: dash.aesthetics.slice(0, 5).map((s) => ({
          key: s.key,
          label: s.label,
          momentum: s.momentum,
          volume: s.volume,
          velocity: s.velocity,
          emerging: s.emerging,
          points: s.series.length,
        })),
        categories: dash.categories.length,
        colors: dash.colors.length,
        silhouettes: dash.silhouettes.length,
        aestheticCategory: dash.aestheticCategory.slice(0, 3).map((s) => [s.key, s.momentum]),
        emerging: dash.emerging.map((s) => s.key),
        topLineages: dash.topLineages.map((l) => ({
          root: l.look.id,
          owner: l.owner.handle,
          nodes: l.stats.nodes,
          depth: l.stats.depth,
          gmv: l.stats.gmv,
          articles: l.articles.length,
        })),
        influencers: dash.influencers.map(({ user, ...rest }) => ({ user: user.handle, ...rest })),
        clusters: dash.clusters,
        manufacturing: dash.manufacturing.map((m) => ({
          rank: m.rank,
          cell: `${m.aesthetic}×${m.categoryGroup}×${m.colorFamily}`,
          signal: m.evidence.signal,
          momentum: m.momentum,
          confidence: m.confidence,
          projectedDemand: m.projectedDemand,
          rationale: m.rationale,
        })),
        evaluation: dash.evaluation?.id ?? null,
      },
      null,
      1,
    ),
  )

  t0 = performance.now()
  const lineage = await getLineage(db, 'fx_l3')
  t('getLineage', performance.now() - t0)
  console.log(walk(lineage.root).join('\n'))
  console.log('path', lineage.path?.map((l) => l.id).join(' → '))
  console.log('stats', JSON.stringify(lineage.stats))

  t0 = performance.now()
  const network = await getUserNetwork(db, 'fx_u2')
  t('getUserNetwork', performance.now() - t0)
  console.log(
    JSON.stringify(
      {
        user: network.user.handle,
        byKind: network.byKind,
        edges: network.edges.map(
          (e) =>
            `${e.direction} ${e.relationship.kind} ${e.other.handle} w=${e.relationship.weight.toFixed(3)} n=${e.relationship.count}`,
        ),
      },
      null,
      1,
    ),
  )
} finally {
  await cleanup()
  console.log('fixture removed; recomputing analytics for the remaining data')
  await runAnalytics(db, { now })
  await handle.close()
}
