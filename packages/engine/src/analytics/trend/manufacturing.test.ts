import { describe, expect, it } from 'vitest'
import { addDays } from '../shared'
import type { IntentSessionLite, ProductLite } from '../shared'
import {
  manufacturingConfidence,
  manufacturingScore,
  manufacturingSignal,
  projectedDemandOf,
  recommendManufacturing,
  supplyGapOf,
  supplyKey,
  type ManufacturingInput,
} from './manufacturing'
import { trendKey, type TrendEvent, type TrendSignalRow } from './signals'

const END = '2026-09-18'
const ID1 = '0000000001'

const product = (id: number, partial: Partial<ProductLite> = {}): ProductLite => ({
  id: String(id).padStart(10, '0'),
  categoryGroup: 'outerwear',
  subcategory: 'trench-coat',
  colorFamily: 'black',
  price: 3000,
  aesthetics: [],
  attributes: {},
  printMotif: '',
  ...partial,
})

function signal(
  dimension: TrendSignalRow['dimension'],
  key: string,
  partial: Partial<TrendSignalRow>,
): TrendSignalRow {
  return {
    day: END,
    dimension,
    key,
    volume: 10,
    velocity: 0.5,
    crossCluster: 0.6,
    conversion: 0.3,
    gmv: 0,
    momentum: 80,
    emerging: false,
    evidence: {
      status: 'rising',
      volume7d: 50,
      volumePrev7d: 20,
      spreadClusters: 3,
      byCluster: { '0': 20, '1': 20, '2': 10 },
      daily: [],
      days: [],
      topProducts: [],
      topRootLooks: [],
      searches7d: 0,
      purchases7d: 0,
      remixes7d: 0,
      lineageReach: 0,
    },
    ...partial,
  }
}

function events(
  articleIds: string[],
  n: number,
  type: TrendEvent['type'] = 'PURCHASE',
  weight = 10,
): TrendEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    day: addDays(END, -(i % 7)),
    type,
    weight,
    keys: [],
    cluster: 0,
    articleIds,
    lookId: null,
    rootLookId: `root_${i % 2}`,
    gmv: 0,
  }))
}

function intent(id: string, partial: Partial<IntentSessionLite> = {}): IntentSessionLite {
  return {
    id,
    userId: 'u1',
    utterance: `utterance ${id}`,
    mode: 'single',
    aesthetics: ['trench-coat'],
    categoryGroups: ['outerwear'],
    colorFamilies: ['black'],
    createdAt: new Date(`${END}T01:00:00Z`),
    ...partial,
  }
}

function input(partial: Partial<ManufacturingInput> = {}): ManufacturingInput {
  return {
    events: events([ID1], 3),
    articles: new Map([[ID1, product(1)]]),
    intents: [intent('s1'), intent('s2'), intent('s3'), intent('s4'), intent('s5')],
    sessionsWithPurchase: new Set(['s1', 's2']),
    signals: new Map([
      [
        trendKey('aesthetic_category', 'trench-coat|outerwear'),
        signal('aesthetic_category', 'trench-coat|outerwear', {}),
      ],
      [trendKey('color', 'black'), signal('color', 'black', { momentum: 60 })],
    ]),
    supply: new Map([
      [supplyKey('trench-coat', 'outerwear', 'black'), { supply: 5, lowStock: 2 }],
      [supplyKey('trench-coat', 'outerwear', null), { supply: 5, lowStock: 2 }],
    ]),
    clusterLabels: new Map([[0, 'Minimalist / Scandi']]),
    endDay: END,
    ...partial,
  }
}

describe('formulas', () => {
  it('supplyGap, score, confidence, projected demand', () => {
    expect(supplyGapOf(0, 10)).toBe(0)
    expect(supplyGapOf(10, 0)).toBeCloseTo(1 - Math.exp(-10), 9)
    expect(supplyGapOf(5, 4)).toBeCloseTo(1 - Math.exp(-1), 9)
    expect(
      manufacturingScore({ momentum: 100, supplyGap: 1, conversion: 0.5, crossCluster: 1 }),
    ).toBeCloseTo(1, 9)
    expect(
      manufacturingScore({ momentum: 50, supplyGap: 0.5, conversion: 0.1, crossCluster: 0.5 }),
    ).toBeCloseTo(0.175 + 0.125 + 0.04 + 0.1, 9)
    expect(
      manufacturingConfidence({ demand14d: 200, crossCluster: 1, daysConsistent: 7 }),
    ).toBeCloseTo(1, 9)
    expect(
      manufacturingConfidence({ demand14d: 200, crossCluster: 0, daysConsistent: 3.5 }),
    ).toBeCloseTo(0.25, 9)
    expect(projectedDemandOf(10, 0.5)).toBe(30)
    expect(projectedDemandOf(10, -0.5)).toBe(20)
  })

  it('signal branches: develop / stock / watch / not emitted', () => {
    const base = { searchGap: 0, lowStockShare: 0, emerging: false, confidence: 0.5 }
    expect(manufacturingSignal({ ...base, score: 0.7, supply: 5 })).toBe('develop')
    expect(manufacturingSignal({ ...base, score: 0.7, supply: 50, searchGap: 0.5 })).toBe('develop')
    expect(manufacturingSignal({ ...base, score: 0.55, supply: 50, lowStockShare: 0.4 })).toBe(
      'stock',
    )
    expect(manufacturingSignal({ ...base, score: 0.55, supply: 50 })).toBe('watch')
    expect(manufacturingSignal({ ...base, score: 0.7, supply: 50 })).toBeNull()
    expect(manufacturingSignal({ ...base, score: 0.2, supply: 50 })).toBeNull()
    expect(
      manufacturingSignal({ ...base, score: 0.2, supply: 50, emerging: true, confidence: 0.3 }),
    ).toBe('watch')
  })
})

describe('recommendManufacturing', () => {
  it('builds a develop row with the pair-level and colour-level cells', () => {
    const rows = recommendManufacturing(input())
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.rank)).toEqual([1, 2])
    const colour = rows.find((r) => r.colorFamily === 'black')!
    const pair = rows.find((r) => r.colorFamily === null)!
    expect(colour.signal).toBe('develop')
    expect(colour.momentum).toBeCloseTo(80 * (0.5 + 0.5 * 0.6), 6)
    expect(pair.momentum).toBe(80)
    expect(colour.evidence).toMatchObject({
      signal: 'develop',
      demand14d: 30,
      demandIntents14d: 5,
      supply: 5,
      searchGap: 0.6,
      clusters: 3,
      purchases14d: 3,
      dominantSilhouette: 'trench-coat',
      topProducts: [ID1],
      clusterLabels: ['Minimalist / Scandi', 'cluster 1', 'cluster 2'],
    })
    expect(colour.evidence.lowStockShare).toBeCloseTo(0.4, 6)
    expect(colour.subcategory).toBe('trench-coat')
    expect(colour.projectedDemand).toBe(Math.round(5 * 1.5 * 2))
    expect(colour.evidence.topRootLooks).toEqual(['root_0', 'root_1'])
  })

  it('rationale cites every number of the evidence and sample intents are verbatim', () => {
    const [row] = recommendManufacturing(input())
    const r = row!
    expect(r.rationale).toContain('Develop (開款)')
    expect(r.rationale).toContain('Outerwear')
    expect(r.rationale).toContain('5 searches')
    expect(r.rationale).toContain('0 remixes')
    expect(r.rationale).toContain('3 purchases')
    expect(r.rationale).toContain('3 taste clusters')
    expect(r.rationale).toContain('30% conversion')
    expect(r.rationale).toContain('5 articles in stock (40% low stock)')
    expect(r.evidence.sampleIntents).toEqual(['utterance s1', 'utterance s2', 'utterance s3'])
    expect(String(r.evidence.rationaleZh)).toContain('建議開款')
  })

  it('drops cells under the demand threshold and honours the per-aesthetic cap and limit', () => {
    expect(recommendManufacturing(input({ events: events([ID1], 1, 'VIEW', 1) }))).toEqual([])
    expect(recommendManufacturing(input(), { perAesthetic: 1 })).toHaveLength(1)
    expect(recommendManufacturing(input(), { limit: 1 })).toHaveLength(1)
  })

  it('intents in outfit mode without groups match the casual template required slots only', () => {
    const rows = recommendManufacturing(
      input({
        intents: [
          intent('o1', {
            mode: 'outfit',
            categoryGroups: [],
            colorFamilies: [],
            aesthetics: ['tee'],
          }),
          intent('o2', {
            mode: 'outfit',
            categoryGroups: [],
            colorFamilies: ['red'],
            aesthetics: ['tee'],
          }),
        ],
        sessionsWithPurchase: new Set(),
      }),
    )
    // outerwear is not a required casual slot → no intent demand; supply gap 0 → watch at most
    for (const r of rows) expect(r.evidence.demandIntents14d).toBe(0)
    const tops = recommendManufacturing(
      input({
        articles: new Map([[ID1, product(1, { categoryGroup: 'tops', subcategory: 'tee' })]]),
        signals: new Map([
          [
            trendKey('aesthetic_category', 'tee|tops'),
            signal('aesthetic_category', 'tee|tops', {}),
          ],
        ]),
        supply: new Map([[supplyKey('tee', 'tops', null), { supply: 3, lowStock: 0 }]]),
        intents: [
          intent('o1', {
            mode: 'outfit',
            categoryGroups: [],
            colorFamilies: [],
            aesthetics: ['tee'],
          }),
          intent('o2', {
            mode: 'outfit',
            categoryGroups: [],
            colorFamilies: ['red'],
            aesthetics: ['tee'],
          }),
        ],
        sessionsWithPurchase: new Set(),
      }),
    )
    const pair = tops.find((r) => r.colorFamily === null)!
    expect(pair.evidence.demandIntents14d).toBe(2)
    const black = tops.find((r) => r.colorFamily === 'black')
    expect(black?.evidence.demandIntents14d ?? 1).toBe(1) // the red-only intent does not match black
  })
})
