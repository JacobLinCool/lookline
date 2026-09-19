import { aestheticIndex, toStyleVector } from '@lookline/catalog'
import type { FeedbackKind } from '@lookline/db'
import { describe, expect, it } from 'vitest'
import { armIndexByName } from './arms'
import { LinUCB, contextVector } from './bandit'
import { buildProfile, describeEvent, eventsByTarget, foldMeta, type ProfileEvent } from './profile'
import { departmentPrior } from './update'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 8, 1) // 1 Sep 2026
const at = (days: number, hours = 0): Date => new Date(T0 + days * DAY + hours * 3_600_000)

const gorp = toStyleVector({
  aesthetics: { gorpcore: 0.95, techwear: 0.6 },
  colorFamily: 'green',
  axes: {
    formality: 0.2,
    warmth: 0.8,
    boldness: 0.5,
    structure: 0.4,
    'price-tier': 0.5,
    coverage: 0.8,
    texture: 0.7,
    trendiness: 0.75,
  },
  categoryGroup: 'outerwear',
})
const glam = toStyleVector({
  aesthetics: { glam: 1 },
  colorFamily: 'multi-metallic',
  axes: {
    formality: 0.85,
    warmth: 0.3,
    boldness: 0.9,
    structure: 0.5,
    'price-tier': 0.7,
    coverage: 0.3,
    texture: 0.9,
    trendiness: 0.6,
  },
  categoryGroup: 'dresses',
})

let seq = 0
function ev(
  kind: FeedbackKind,
  reward: number,
  vector: number[],
  createdAt: Date,
  extra: Partial<ProfileEvent> = {},
): ProfileEvent {
  seq += 1
  return {
    id: `fb_${String(seq).padStart(3, '0')}`,
    kind,
    reward,
    position: null,
    forOthers: false,
    context: {},
    createdAt,
    articleId: String(seq).padStart(10, '0'),
    lookId: null,
    intentSessionId: null,
    vector,
    productName: 'Trail Shell',
    brandName: 'Northline',
    ...extra,
  }
}

function base(events: ProfileEvent[], extra: Partial<Parameters<typeof buildProfile>[0]> = {}) {
  return buildProfile({
    userId: 'u_1',
    department: 'unisex',
    createdAt: at(-30),
    preferenceVector: null,
    giftPreferenceVector: null,
    events,
    snapshots: [],
    bandit: null,
    now: at(10),
    ...extra,
  })
}

describe('eventsByTarget / foldMeta', () => {
  it('routes by §4.1 and folds n / decayed mass / lastAt', () => {
    const events = [
      ev('save', 0.4, gorp, at(0)),
      ev('purchase', 1, glam, at(1), { context: { forKind: 'other' } }),
      ev('purchase', 1, gorp, at(46), { context: { forKind: 'undisclosed' } }),
      ev('impression', 0, gorp, at(2)),
    ]
    const by = eventsByTarget(events)
    expect(by.self.map((t) => [t.event.kind, t.scale])).toEqual([
      ['save', 1],
      ['purchase', 0.5],
    ])
    expect(by.gift.map((t) => [t.event.kind, t.scale])).toEqual([
      ['purchase', 1],
      ['purchase', 0.5],
    ])
    const meta = foldMeta(by.self)
    expect(meta.n).toBe(2)
    expect(meta.lastAt).toEqual(at(46))
    // 0.4 decayed over 46 days plus 1
    expect(meta.mass).toBeCloseTo(0.4 * 2 ** (-46 / 45) + 1, 10)
  })
})

describe('describeEvent', () => {
  it('formats "verb item (+r, d Mon)" with gift recipients', () => {
    const e = ev('save', 0.4, gorp, at(2))
    expect(describeEvent(e)).toBe('saved Northline Trail Shell (+0.40, 3 Sep)')
    const gift = ev('purchase', 1, gorp, at(11), {
      context: { forKind: 'other', forLabel: 'dad' },
      productName: 'Wool Overcoat',
    })
    expect(describeEvent(gift, 'gift')).toBe(
      'bought Northline Wool Overcoat for dad (+1.00, 12 Sep)',
    )
    expect(describeEvent(ev('dismiss', -0.3, gorp, at(0)))).toBe(
      'dismissed Northline Trail Shell (−0.30, 1 Sep)',
    )
    expect(
      describeEvent(
        ev('look_create', 0.8, gorp, at(0), { productName: null, brandName: null, lookId: 'lk_1' }),
      ),
    ).toBe('styled into a Look a Look (+0.80, 1 Sep)')
  })
})

describe('buildProfile', () => {
  it('is empty and "still learning" with fewer than 3 self events', () => {
    const p = base([ev('save', 0.4, gorp, at(0)), ev('click', 0.1, gorp, at(1))])
    expect(p.eventCount).toBe(2)
    expect(p.vector).not.toBeNull()
    expect(p.topAesthetics).toEqual([])
    expect(p.giftVector).toBeNull()
    expect(p.giftTopAesthetics).toEqual([])
    expect(p.topColorFamilies.length).toBeGreaterThan(0)
    expect(p.axes.formality).toBeDefined()
    const none = base([])
    expect(none.vector).toBeNull()
    expect(none.topColorFamilies).toEqual([])
    expect(none.axes.warmth).toBe(0.5)
  })

  it('top aesthetics: weight, confidence = w·(1 − e^{−n_tag/5}), evidence from the actual events', () => {
    const events = [
      ev('save', 0.4, gorp, at(0)),
      ev('save', 0.4, gorp, at(1)),
      ev('save', 0.4, gorp, at(2)),
      ev('purchase', 1, gorp, at(3), { productName: 'Wool Overcoat' }),
      ev('dismiss', -0.3, glam, at(4)),
      ev('click', 0.1, gorp, at(5)),
    ]
    const p = base(events)
    expect(p.eventCount).toBe(6)
    expect(p.topAesthetics.length).toBeGreaterThan(0)
    expect(p.topAesthetics.length).toBeLessThanOrEqual(5)
    const top = p.topAesthetics[0]!
    expect(top.slug).toBe('gorpcore')
    expect(top.name).toBe('Gorpcore')
    expect(top.weight).toBe(p.vector![aestheticIndex('gorpcore')])
    expect(top.weight).toBeGreaterThanOrEqual(0.25)
    // 5 positive events carry gorpcore ≥ .4
    expect(top.confidence).toBeCloseTo(top.weight * (1 - Math.exp(-5 / 5)), 10)
    expect(top.evidence).toHaveLength(3)
    expect(top.evidence[0]).toBe('saved 3 pieces tagged gorpcore')
    // the purchase has the largest |r|·decay·v[tag]
    expect(top.evidence[1]).toBe('bought Northline Wool Overcoat (+1.00, 4 Sep)')
    expect(top.evidence[2]).toMatch(/^saved Northline Trail Shell \(\+0\.40, [123] Sep\)$/)
    // glam was only dismissed → not a top aesthetic
    expect(p.topAesthetics.find((a) => a.slug === 'glam')).toBeUndefined()
    const weights = p.topAesthetics.map((a) => a.weight)
    expect(weights).toEqual(weights.toSorted((a, b) => b - a))
    expect(p.topColorFamilies[0]!.family).toBe('green')
  })

  it('separates gift taste from self taste', () => {
    const events = [
      ev('save', 0.4, gorp, at(0)),
      ev('save', 0.4, gorp, at(1)),
      ev('purchase', 1, gorp, at(2)),
      ev('purchase', 1, glam, at(3), {
        context: { forKind: 'other', forLabel: 'mum' },
        productName: 'Sequin Dress',
      }),
      ev('save', 0.4, glam, at(4), { forOthers: true, productName: 'Sequin Dress' }),
      ev('ask_choice', 0.15, glam, at(5), {
        context: { role: 'adviser', chosen: true },
        productName: 'Sequin Dress',
      }),
    ]
    const p = base(events)
    expect(p.topAesthetics[0]!.slug).toBe('gorpcore')
    expect(p.topAesthetics.find((a) => a.slug === 'glam')).toBeUndefined()
    expect(p.giftVector).not.toBeNull()
    expect(p.giftTopAesthetics[0]!.slug).toBe('glam')
    expect(p.giftTopAesthetics[0]!.evidence).toContain(
      'bought Northline Sequin Dress for mum (+1.00, 4 Sep)',
    )
    expect(p.giftVector![aestheticIndex('glam')]!).toBeGreaterThan(
      p.vector![aestheticIndex('glam')]!,
    )
  })

  it('uses the stored vector when present and lists the last 10 snapshots', () => {
    const stored = departmentPrior('unisex')
    stored[aestheticIndex('scandi')] = 0.9
    const events = [
      ev('save', 0.4, gorp, at(0)),
      ev('save', 0.4, gorp, at(1)),
      ev('save', 0.4, gorp, at(2)),
    ]
    const snapshots = Array.from({ length: 12 }, (_, i) => ({
      version: i + 1,
      createdAt: at(i),
      metrics: { mass: i },
    }))
    const p = base(events, { preferenceVector: stored, snapshots })
    expect(p.vector![aestheticIndex('scandi')]).toBeCloseTo(
      0.9 * 2 ** (-8 / 45) + stored[aestheticIndex('scandi')]! * 0,
      1,
    )
    expect(p.topAesthetics[0]!.slug).toBe('scandi')
    expect(p.snapshots).toHaveLength(10)
    expect(p.snapshots[0]!.version).toBe(12)
    expect(p.snapshots[9]!.version).toBe(3)
  })

  it('bandit summary: pulls and mean reward per arm from the events, current arm and reason', () => {
    const x = contextVector({ eventCount: 5 })
    const imp = (id: string, session: string, armId: string, hour: number): ProfileEvent =>
      ev('impression', 0, gorp, at(0, hour), {
        id,
        intentSessionId: session,
        context: { armId, contextVector: x, position: 0 },
        position: 0,
      })
    const events = [
      imp('i1', 's1', 'taste-led', 0),
      ev('save', 0.4, gorp, at(0, 1), { intentSessionId: 's1', position: 0 }),
      ev('purchase', 1, gorp, at(0, 2), { intentSessionId: 's1', position: 0 }),
      imp('i2', 's2', 'taste-led', 5),
      ev('dismiss', -0.3, glam, at(0, 6), { intentSessionId: 's2', position: 0 }),
      imp('i3', 's3', 'balanced', 9),
      ev('click', 0.1, gorp, at(0, 10), { intentSessionId: 's3', position: 0 }),
    ]
    const bandit = new LinUCB()
    const tasteLed = armIndexByName('taste-led')
    for (let i = 0; i < 30; i++) bandit.update(tasteLed, x, 0.9)
    const p = base(events, { bandit })
    const arms = Object.fromEntries(p.bandit!.arms.map((a) => [a.name, a]))
    expect(arms['taste-led']!.pulls).toBe(2)
    expect(arms['taste-led']!.meanReward).toBeCloseTo((1 + (1 - 0.3) / 2) / 2, 10)
    expect(arms['balanced']!.pulls).toBe(1)
    expect(arms['balanced']!.meanReward).toBeCloseTo((1 + 0.1) / 2, 10)
    expect(arms['explore']!.pulls).toBe(0)
    expect(p.bandit!.current).toBe('taste-led')
    expect(p.bandit!.reason).toBe(
      'taste-led — 1 of 2 slates under this blend earned a positive reward for you',
    )
    // cold user: forced balanced with the "still learning" reason
    const cold = base([ev('save', 0.4, gorp, at(0))], { bandit })
    expect(cold.bandit!.current).toBe('balanced')
    expect(cold.bandit!.reason).toContain('still learning')
  })
})
