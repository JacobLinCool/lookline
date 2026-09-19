import { describe, expect, it } from 'vitest'
import { addDays } from '../shared'
import type {
  IntentSessionLite,
  InteractionLite,
  LookLite,
  ProductLite,
  PurchaseLite,
} from '../shared'
import {
  buildTrendEvents,
  computeTrendSignals,
  crossClusterSpread,
  intentKeys,
  isEmerging,
  momentumOf,
  productKeys,
  statusOf,
  trendKey,
  type TrendEvent,
} from './signals'

const END = '2026-09-18'
const KEY = trendKey('aesthetic_category', 'minimalist|outerwear')
const BIG = trendKey('aesthetic_category', 'streetwear|tops')

function event(partial: Partial<TrendEvent> & Pick<TrendEvent, 'day' | 'weight'>): TrendEvent {
  return {
    type: 'VIEW',
    keys: [KEY],
    cluster: null,
    productIds: [],
    lookId: null,
    rootLookId: null,
    gmv: 0,
    ...partial,
  }
}

/** Previous week 2/day, current week 3,3,4,4,5,6,7; every day split evenly over clusters 0 and 1. */
function fixture(): TrendEvent[] {
  const events: TrendEvent[] = []
  const current = [3, 3, 4, 4, 5, 6, 7]
  for (let back = 13; back >= 0; back--) {
    const day = addDays(END, -back)
    const total = back >= 7 ? 2 : current[6 - back]!
    for (const cluster of [0, 1]) events.push(event({ day, weight: total / 2, cluster }))
  }
  // typed events inside the current week (weights already counted above → weight 0)
  const d = (back: number) => addDays(END, -back)
  events.push(event({ day: d(5), weight: 0, type: 'SAVE' }))
  events.push(event({ day: d(4), weight: 0, type: 'SAVE' }))
  events.push(event({ day: d(3), weight: 0, type: 'SAVE' }))
  events.push(event({ day: d(2), weight: 0, type: 'REMIX' }))
  events.push(event({ day: d(1), weight: 0, type: 'PURCHASE', gmv: 1500 }))
  events.push(event({ day: d(0), weight: 0, type: 'PURCHASE', gmv: 1500 }))
  return events
}

describe('computeTrendSignals', () => {
  const rows = computeTrendSignals(fixture(), { endDay: END, days: 1, clusterCount: 8 })
  const row = rows.find((r) => r.key === 'minimalist|outerwear')!

  it('hand-computed volume, velocity, cross-cluster, conversion, gmv and momentum', () => {
    expect(row.dimension).toBe('aesthetic_category')
    expect(row.day).toBe(END)
    expect(row.volume).toBe(7)
    expect(row.evidence.volume7d).toBe(32)
    expect(row.evidence.volumePrev7d).toBe(14)
    expect(row.velocity).toBeCloseTo((32 - 14) / (14 + 10), 4)
    expect(row.crossCluster).toBeCloseTo(0.25, 4) // even split over 2 of 8 clusters
    expect(row.evidence.spreadClusters).toBe(2)
    expect(row.conversion).toBeCloseTo(2 / (3 + 1 + 0 + 5), 4)
    expect(row.gmv).toBe(3000)
    expect(row.evidence.purchases7d).toBe(2)
    expect(row.evidence.remixes7d).toBe(1)
    expect(row.evidence.daily).toEqual([2, 2, 2, 2, 2, 2, 2, 3, 3, 4, 4, 5, 6, 7])
    expect(row.evidence.days).toHaveLength(14)
    expect(row.evidence.days[13]).toBe(END)
    const expected = momentumOf({
      velocity: 0.75,
      crossCluster: 0.25,
      conversion: 2 / 9,
      lineageReach: 0,
      volNorm: 1,
    })
    expect(row.momentum).toBeCloseTo(expected, 2)
    expect(row.momentum).toBeGreaterThan(0)
    expect(row.momentum).toBeLessThanOrEqual(100)
  })

  it('is not emerging when it is the only key (volume is not below the dimension median)', () => {
    expect(row.emerging).toBe(false)
    expect(row.evidence.status).toBe('rising')
  })

  it('becomes emerging next to a much larger key in the same dimension', () => {
    const events = fixture()
    for (let back = 13; back >= 0; back--) {
      events.push(event({ day: addDays(END, -back), weight: 100, keys: [BIG], cluster: 2 }))
    }
    const out = computeTrendSignals(events, { endDay: END, days: 1, clusterCount: 8 })
    const small = out.find((r) => r.key === 'minimalist|outerwear')!
    expect(small.emerging).toBe(true)
    expect(small.evidence.status).toBe('emerging')
    const big = out.find((r) => r.key === 'streetwear|tops')!
    expect(big.emerging).toBe(false)
    expect(big.evidence.status).toBe('stable')
    expect(big.crossCluster).toBeCloseTo(1 / 8, 6)
  })

  it('emits one row per day of the requested window and skips silent keys', () => {
    const out = computeTrendSignals(fixture(), { endDay: END, days: 3, clusterCount: 8 })
    expect(out.map((r) => r.day)).toEqual([addDays(END, -2), addDays(END, -1), END])
    const quiet = computeTrendSignals([event({ day: addDays(END, -40), weight: 5 })], {
      endDay: END,
      days: 3,
      clusterCount: 8,
    })
    expect(quiet).toEqual([])
  })

  it('accounts for lineage reach through root Looks carrying the key', () => {
    const lineages = [
      {
        rootLookId: 'root1',
        depth: 2,
        nodes: 4,
        uniquePeople: 25,
        clustersReached: 2,
        shares: 0,
        asks: 0,
        remixes: 0,
        purchases: 0,
        gmv: 0,
        velocity: 0,
        shareToRemixRate: 0,
        remixToPurchaseRate: 0,
        firstAt: new Date(`${addDays(END, -3)}T04:00:00Z`),
        lastAt: new Date(`${END}T04:00:00Z`),
      },
    ]
    const out = computeTrendSignals(fixture(), {
      endDay: END,
      days: 1,
      clusterCount: 8,
      lineages,
      rootKeys: new Map([['root1', [KEY]]]),
    })
    const r = out.find((x) => x.key === 'minimalist|outerwear')!
    expect(r.evidence.lineageReach).toBeCloseTo(1 - Math.exp(-25 / 50), 3)
    expect(r.evidence.topRootLooks).toEqual(['root1'])
    expect(r.momentum).toBeGreaterThan(row.momentum)
  })
})

describe('momentum and emerging rules', () => {
  it('momentum is monotone in velocity and bounded to [0, 100]', () => {
    const base = { crossCluster: 0.3, conversion: 0.1, lineageReach: 0.2, volNorm: 0.5 }
    let prev = -1
    for (const velocity of [-2, -1, -0.5, 0, 0.5, 1, 2, 3, 10]) {
      const m = momentumOf({ ...base, velocity })
      expect(m).toBeGreaterThanOrEqual(prev)
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThanOrEqual(100)
      prev = m
    }
    expect(
      momentumOf({ velocity: 3, crossCluster: 1, conversion: 1, lineageReach: 1, volNorm: 1 }),
    ).toBe(100)
  })

  it('emerging requires all five conditions', () => {
    const ok = {
      volume7d: 30,
      dimensionMedian: 50,
      velocity: 0.6,
      spreadClusters: 2,
      last4: [3, 4, 5, 6],
    }
    expect(isEmerging(ok)).toBe(true)
    expect(isEmerging({ ...ok, volume7d: 60 })).toBe(false)
    expect(isEmerging({ ...ok, velocity: 0.4 })).toBe(false)
    expect(isEmerging({ ...ok, spreadClusters: 1 })).toBe(false)
    expect(isEmerging({ ...ok, volume7d: 19 })).toBe(false)
    expect(isEmerging({ ...ok, last4: [6, 5, 4, 3] })).toBe(false)
    expect(isEmerging({ ...ok, last4: [3, 4, 4, 3] })).toBe(false)
  })

  it('status ladder', () => {
    expect(statusOf(4, 1, false)).toBe('dormant')
    expect(statusOf(30, 1, true)).toBe('emerging')
    expect(statusOf(30, 0.25, false)).toBe('rising')
    expect(statusOf(30, -0.3, false)).toBe('fading')
    expect(statusOf(30, 0, false)).toBe('stable')
  })

  it('crossClusterSpread ignores clusters under 2 weighted units', () => {
    const { spread, c } = crossClusterSpread(
      new Map([
        [0, 10],
        [1, 10],
        [2, 1],
      ]),
      4,
    )
    expect(c).toBe(2)
    expect(spread).toBeCloseTo(0.5, 9)
    expect(crossClusterSpread(new Map([[0, 10]]), 4).spread).toBe(0.25)
  })
})

describe('buildTrendEvents', () => {
  const product: ProductLite = {
    id: 1,
    aesthetics: ['minimalist', 'quiet-luxury'],
    categoryGroup: 'outerwear',
    subcategory: 'trench-coat',
    colorFamily: 'neutral',
    silhouette: 'a-line',
    silhouetteId: 'outerwear-trench',
    stock: 10,
    price: 3000,
  }
  const products = new Map([[1, product]])
  const looks: LookLite[] = [
    {
      id: 'l1',
      ownerId: 'u1',
      kind: 'edition',
      parentLookId: null,
      aesthetics: ['scandi'],
      createdAt: new Date(`${END}T02:00:00Z`),
    },
  ]
  const interactions: InteractionLite[] = [
    {
      id: 'i1',
      actorUserId: 'u2',
      targetUserId: null,
      lookId: 'l1',
      productId: null,
      askId: null,
      type: 'REMIX',
      sourceInteractionId: null,
      createdAt: new Date(`${END}T03:00:00Z`),
    },
    {
      id: 'i2',
      actorUserId: 'u2',
      targetUserId: null,
      lookId: null,
      productId: 1,
      askId: null,
      type: 'DISMISS',
      sourceInteractionId: null,
      createdAt: new Date(`${END}T03:00:00Z`),
    },
    {
      id: 'i3',
      actorUserId: 'u2',
      targetUserId: null,
      lookId: null,
      productId: 1,
      askId: null,
      type: 'PURCHASE', // derived from the purchases table instead
      sourceInteractionId: null,
      createdAt: new Date(`${END}T03:00:00Z`),
    },
  ]
  const purchases: PurchaseLite[] = [
    {
      id: 'p1',
      userId: 'u3',
      productId: 1,
      quantity: 2,
      price: 3000,
      forKind: 'other',
      forUserId: 'u4',
      sourceLookId: 'l1',
      sourceAskId: null,
      sourceInteractionId: null,
      intentSessionId: null,
      createdAt: new Date(`${END}T05:00:00Z`),
    },
  ]
  const intents: IntentSessionLite[] = [
    {
      id: 's1',
      userId: 'u1',
      utterance: 'a minimalist coat',
      mode: 'single',
      aesthetics: ['minimalist'],
      categoryGroups: ['outerwear'],
      colorFamilies: ['black'],
      createdAt: new Date(`${END}T06:00:00Z`),
    },
  ]
  const events = buildTrendEvents({
    interactions,
    purchases,
    looks,
    lookProducts: [{ lookId: 'l1', productId: 1 }],
    intents,
    products,
    clusterOf: new Map([
      ['u1', 0],
      ['u2', 1],
    ]),
    rootOf: new Map([['l1', 'l1']]),
  })

  it('maps products, looks and intents to keys and weights', () => {
    expect(productKeys(product)).toEqual(
      expect.arrayContaining([
        trendKey('aesthetic', 'minimalist'),
        trendKey('aesthetic', 'quiet-luxury'),
        trendKey('category', 'outerwear'),
        trendKey('color', 'neutral'),
        trendKey('silhouette', 'a-line'),
        trendKey('aesthetic_category', 'minimalist|outerwear'),
      ]),
    )
    expect(intentKeys(intents[0]!)).toEqual([
      trendKey('aesthetic', 'minimalist'),
      trendKey('aesthetic_category', 'minimalist|outerwear'),
      trendKey('category', 'outerwear'),
      trendKey('color', 'black'),
    ])
    const remix = events.find((e) => e.type === 'REMIX')!
    expect(remix.weight).toBe(6)
    expect(remix.keys).toContain(trendKey('aesthetic', 'scandi'))
    expect(remix.keys).toContain(trendKey('category', 'outerwear'))
    expect(remix.rootLookId).toBe('l1')
    expect(remix.cluster).toBe(1)
    expect(events.find((e) => e.type === 'DISMISS')!.weight).toBe(-1)
    expect(events.filter((e) => e.type === 'PURCHASE')).toHaveLength(1)
    expect(events.find((e) => e.type === 'PURCHASE')!.gmv).toBe(6000)
    expect(events.find((e) => e.type === 'BUY_FOR')!.gmv).toBe(0)
    expect(events.find((e) => e.type === 'SEARCH')!.weight).toBe(2)
    expect(events.map((e) => e.day)).toEqual(events.map(() => END))
  })
})
