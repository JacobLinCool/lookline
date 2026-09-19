import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../shared'
import type { InteractionLite, LookLite, ParticipantLite, PurchaseLite } from '../shared'
import { deriveRelationships, trust, type RelationshipInput } from './relationships'

const NOW = new Date('2026-09-18T00:00:00Z')
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * DAY_MS)

let seq = 0
const ix = (
  partial: Partial<InteractionLite> & Pick<InteractionLite, 'actorUserId' | 'type'>,
): InteractionLite => ({
  id: `ix_${++seq}`,
  targetUserId: null,
  lookId: null,
  articleId: null,
  sourceInteractionId: null,
  createdAt: NOW,
  ...partial,
})
const purchase = (
  partial: Partial<PurchaseLite> & Pick<PurchaseLite, 'userId' | 'articleId'>,
): PurchaseLite => ({
  id: `pu_${++seq}`,
  quantity: 1,
  price: 1000,
  forKind: 'self',
  forUserId: null,
  sourceLookId: null,
  sourceInteractionId: null,
  intentSessionId: null,
  createdAt: NOW,
  ...partial,
})
const look = (partial: Partial<LookLite> & Pick<LookLite, 'id' | 'ownerId'>): LookLite => ({
  kind: 'edition',
  parentLookId: null,
  aesthetics: [],
  createdAt: NOW,
  ...partial,
})
const empty = (): RelationshipInput => ({
  interactions: [],
  purchases: [],
  looks: [],
  lookParticipants: [],
})
const weight = (score: number): number => 1 - Math.exp(-score / 4)

describe('deriveRelationships', () => {
  it('styles: base 1.5 with a 30-day half-life', () => {
    const rows = deriveRelationships(
      {
        ...empty(),
        interactions: [
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'STYLE', createdAt: daysAgo(0) }),
          ix({ actorUserId: 'A', targetUserId: 'C', type: 'STYLE', createdAt: daysAgo(30) }),
        ],
      },
      NOW,
    )
    const ab = rows.find((r) => r.aUserId === 'A' && r.bUserId === 'B')!
    const ac = rows.find((r) => r.aUserId === 'A' && r.bUserId === 'C')!
    expect(ab.kind).toBe('styles')
    expect(ab.weight).toBeCloseTo(weight(1.5), 6)
    expect(ab.count).toBe(1)
    expect(ac.weight).toBeCloseTo(weight(0.75), 6)
    expect(ac.lastAt).toEqual(daysAgo(30))
  })

  it('inspired_by from remixes (1.5) and attributed purchases (2.5); remixed is the inverse view', () => {
    const rows = deriveRelationships(
      {
        ...empty(),
        looks: [
          look({ id: 'l1', ownerId: 'B' }),
          look({ id: 'l2', ownerId: 'A', kind: 'remix', parentLookId: 'l1' }),
        ],
        purchases: [purchase({ userId: 'C', articleId: '0000000001', sourceLookId: 'l1' })],
      },
      NOW,
    )
    const find = (a: string, b: string, kind: string) =>
      rows.find((r) => r.aUserId === a && r.bUserId === b && r.kind === kind)
    expect(find('A', 'B', 'inspired_by')?.weight).toBeCloseTo(weight(1.5), 6)
    expect(find('B', 'A', 'remixed')?.weight).toBeCloseTo(weight(1.0), 6)
    expect(find('C', 'B', 'inspired_by')?.weight).toBeCloseTo(weight(2.5), 6)
  })

  it('shops_with is symmetric over Together participants; buys_for follows purchases.for_user_id', () => {
    const participants: ParticipantLite[] = [
      { lookId: 't1', userId: 'A', sourceLookId: null },
      { lookId: 't1', userId: 'B', sourceLookId: null },
    ]
    const rows = deriveRelationships(
      {
        ...empty(),
        looks: [look({ id: 't1', ownerId: 'A', kind: 'together' })],
        lookParticipants: participants,
        purchases: [
          purchase({ userId: 'A', articleId: '0000000003', forKind: 'other', forUserId: 'C' }),
        ],
      },
      NOW,
    )
    const ab = rows.find((r) => r.kind === 'shops_with' && r.aUserId === 'A' && r.bUserId === 'B')!
    const ba = rows.find((r) => r.kind === 'shops_with' && r.aUserId === 'B' && r.bUserId === 'A')!
    expect(ab.weight).toBeCloseTo(weight(1.5), 6)
    expect(ba.weight).toBe(ab.weight)
    expect(rows.find((r) => r.kind === 'buys_for')).toMatchObject({ aUserId: 'A', bUserId: 'C' })
  })

  it('styles gets +1.5 when the styled person buys from the Look within 14 days', () => {
    const rows = deriveRelationships(
      {
        ...empty(),
        interactions: [
          ix({
            actorUserId: 'B',
            targetUserId: 'A',
            type: 'STYLE',
            lookId: 'l9',
            createdAt: daysAgo(5),
          }),
        ],
        purchases: [
          purchase({
            userId: 'A',
            articleId: '0000000001',
            sourceLookId: 'l9',
            createdAt: daysAgo(2),
          }),
        ],
      },
      NOW,
    )
    const decay = 2 ** (-5 / 30)
    expect(rows[0]).toMatchObject({ aUserId: 'B', bUserId: 'A', kind: 'styles' })
    expect(rows[0]!.weight).toBeCloseTo(weight(3 * decay), 6)
  })

  it('prunes rows whose decayed score is below 0.05 and never links a user to themselves', () => {
    const rows = deriveRelationships(
      {
        ...empty(),
        interactions: [
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'STYLE', createdAt: daysAgo(300) }),
          ix({ actorUserId: 'A', targetUserId: 'A', type: 'STYLE' }),
        ],
      },
      NOW,
    )
    expect(rows).toEqual([])
  })

  it('accumulates repeated events into count and keeps the latest lastAt', () => {
    const rows = deriveRelationships(
      {
        ...empty(),
        interactions: [
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'STYLE', createdAt: daysAgo(3) }),
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'STYLE', createdAt: daysAgo(1) }),
        ],
      },
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(2)
    expect(rows[0]!.lastAt).toEqual(daysAgo(1))
    expect(rows[0]!.weight).toBeCloseTo(weight(1.5 * (2 ** (-3 / 30) + 2 ** (-1 / 30))), 6)
  })
})

describe('trust', () => {
  it('is the clamped weighted sum of §5.1', () => {
    expect(trust({ inspired_by: 0.5, styles: 0.2 })).toBeCloseTo(0.47, 9)
    expect(trust({ inspired_by: 1, styles: 1 })).toBe(1)
    expect(trust({ remixed: 1 })).toBe(0)
  })
})
