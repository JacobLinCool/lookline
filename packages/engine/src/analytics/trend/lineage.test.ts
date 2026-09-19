import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../shared'
import type { InteractionLite, LookLite, ParticipantLite, PurchaseLite } from '../shared'
import {
  buildForest,
  collectTree,
  computeInfluencers,
  computeLineage,
  influenceScore,
} from './lineage'

const T0 = new Date('2026-09-01T00:00:00Z')
const day = (d: number): Date => new Date(T0.getTime() + d * DAY_MS)

let seq = 0
const look = (
  id: string,
  ownerId: string,
  d: number,
  kind: LookLite['kind'] = 'edition',
  parentLookId: string | null = null,
): LookLite => ({ id, ownerId, kind, parentLookId, aesthetics: [], createdAt: day(d) })
const ix = (
  type: InteractionLite['type'],
  actorUserId: string,
  lookId: string,
  d = 1,
): InteractionLite => ({
  id: `ix_${++seq}`,
  actorUserId,
  targetUserId: null,
  lookId,
  articleId: null,
  askId: null,
  type,
  sourceInteractionId: null,
  createdAt: day(d),
})
const purchase = (
  userId: string,
  sourceLookId: string,
  price: number,
  quantity = 1,
): PurchaseLite => ({
  id: `pu_${++seq}`,
  userId,
  articleId: '0000000001',
  quantity,
  price,
  forKind: 'self',
  forUserId: null,
  sourceLookId,
  sourceAskId: null,
  sourceInteractionId: null,
  intentSessionId: null,
  createdAt: day(5),
})

/**
 * lk1 (u1, day 0)
 * ├── lk2 remix (u2, day 1)
 * │   └── lk4 remix (u4, day 3)
 * │       └── lk5 together (u5, day 4)  ← also a child of lk3 via participants
 * └── lk3 remix (u3, day 2)
 *     └── lk5
 */
const looks: LookLite[] = [
  look('lk1', 'u1', 0),
  look('lk2', 'u2', 1, 'remix', 'lk1'),
  look('lk3', 'u3', 2, 'remix', 'lk1'),
  look('lk4', 'u4', 3, 'remix', 'lk2'),
  look('lk5', 'u5', 4, 'together'),
  look('solo', 'u9', 2),
]
const participants: ParticipantLite[] = [
  { lookId: 'lk5', userId: 'u4', sourceLookId: 'lk4' },
  { lookId: 'lk5', userId: 'u3', sourceLookId: 'lk3' },
]
const interactions: InteractionLite[] = [
  ix('SHARE', 'u6', 'lk1'),
  ix('SHARE', 'u7', 'lk2'),
  ix('REACT', 'u2', 'lk1'),
  ix('ASK', 'u8', 'lk3'),
  ix('VIEW', 'u10', 'lk1'), // views do not count as people
]
const purchases: PurchaseLite[] = [
  purchase('u9', 'lk2', 1000, 2),
  purchase('u1', 'lk4', 9999), // root owner buying from their own tree is excluded
  purchase('u4', 'lk5', 500),
]
const clusterOf = new Map<string, number | null>([
  ['u1', 0],
  ['u2', 1],
  ['u3', 0],
  ['u4', 1],
  ['u5', null],
  ['u9', 2],
])
const input = { looks, participants, interactions, purchases, clusterOf }

describe('computeLineage', () => {
  const rows = computeLineage(input)
  const root = rows.find((r) => r.rootLookId === 'lk1')!

  it('finds the roots (parent-less looks) in creation order', () => {
    expect(rows.map((r) => r.rootLookId)).toEqual(['lk1', 'solo'])
  })

  it('computes the hand-built 3-level tree statistics', () => {
    expect(root.depth).toBe(3)
    expect(root.nodes).toBe(5)
    expect(root.uniquePeople).toBe(8) // u1..u5 owners + u6, u7 share, u8 ask
    expect(root.clustersReached).toBe(2)
    expect(root.shares).toBe(2)
    expect(root.asks).toBe(1)
    expect(root.remixes).toBe(3)
    expect(root.purchases).toBe(2)
    expect(root.gmv).toBe(2500)
    expect(root.velocity).toBeCloseTo(1, 9) // (5 − 1) / 4 days
    expect(root.shareToRemixRate).toBeCloseTo(1.5, 9)
    expect(root.remixToPurchaseRate).toBeCloseTo(2 / 3, 9)
    expect(root.firstAt).toEqual(day(0))
    expect(root.lastAt).toEqual(day(4))
  })

  it('a single look has neutral stats', () => {
    const solo = rows.find((r) => r.rootLookId === 'solo')!
    expect(solo).toMatchObject({
      depth: 0,
      nodes: 1,
      uniquePeople: 1,
      clustersReached: 1,
      velocity: 0,
    })
  })

  it('guards against cycles', () => {
    const cyclic: LookLite[] = [
      look('a', 'u1', 0, 'remix', 'b'),
      look('b', 'u2', 1, 'remix', 'a'),
      look('r', 'u3', 0),
    ]
    const forest = buildForest(cyclic, [])
    expect(forest.roots).toEqual(['r'])
    const walk = collectTree(forest, 'a')
    expect(walk.order.toSorted()).toEqual(['a', 'b'])
  })

  it('caps the walk at maxNodes', () => {
    const forest = buildForest(looks, participants)
    expect(collectTree(forest, 'lk1', 2).order).toHaveLength(2)
  })
})

describe('computeInfluencers', () => {
  const rows = computeInfluencers(input)

  it('credits remix children and downstream purchases to the owner of the source Look', () => {
    const u1 = rows.find((r) => r.userId === 'u1')!
    expect(u1.remixesCaused).toBe(2)
    expect(u1.downstreamPurchases).toBe(2)
    expect(u1.downstreamGmv).toBe(2500)
    expect(u1.clustersReached).toBe(2)
    expect(u1.influence).toBeCloseTo(influenceScore(2, 2, 2), 9)

    const u2 = rows.find((r) => r.userId === 'u2')!
    expect(u2.remixesCaused).toBe(1)
    expect(u2.downstreamPurchases).toBe(3) // lk2, lk4 (bought by u1) and lk5
    const u3 = rows.find((r) => r.userId === 'u3')!
    expect(u3.remixesCaused).toBe(0)
    expect(u3.downstreamPurchases).toBe(1)
  })

  it('orders by influence and omits people who caused nothing', () => {
    expect(rows[0]!.userId).toBe('u1')
    expect(rows.map((r) => r.influence)).toEqual(
      rows.map((r) => r.influence).toSorted((a, b) => b - a),
    )
    expect(rows.find((r) => r.userId === 'u9')).toBeUndefined()
    // u5 owns the Together edition lk5, which u4 bought from
    expect(rows.find((r) => r.userId === 'u5')).toMatchObject({
      remixesCaused: 0,
      downstreamPurchases: 1,
    })
  })
})
