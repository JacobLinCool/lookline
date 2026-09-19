import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../shared'
import type {
  AskResponseLite,
  InteractionLite,
  LookLite,
  ParticipantLite,
  PurchaseLite,
} from '../shared'
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
  productId: null,
  askId: null,
  sourceInteractionId: null,
  createdAt: NOW,
  ...partial,
})
const purchase = (
  partial: Partial<PurchaseLite> & Pick<PurchaseLite, 'userId' | 'productId'>,
): PurchaseLite => ({
  id: `pu_${++seq}`,
  quantity: 1,
  price: 1000,
  forKind: 'self',
  forUserId: null,
  sourceLookId: null,
  sourceAskId: null,
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
  asks: [],
  askResponses: [],
  looks: [],
  lookParticipants: [],
})
const weight = (score: number): number => 1 - Math.exp(-score / 4)

describe('deriveRelationships', () => {
  it('asks: base 1.0 with a 30-day half-life', () => {
    const rows = deriveRelationships(
      {
        ...empty(),
        interactions: [
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'ASK', createdAt: daysAgo(0) }),
          ix({ actorUserId: 'A', targetUserId: 'C', type: 'ASK', createdAt: daysAgo(30) }),
        ],
      },
      NOW,
    )
    const ab = rows.find((r) => r.aUserId === 'A' && r.bUserId === 'B')!
    const ac = rows.find((r) => r.aUserId === 'A' && r.bUserId === 'C')!
    expect(ab.kind).toBe('asks')
    expect(ab.weight).toBeCloseTo(weight(1), 6)
    expect(ab.count).toBe(1)
    expect(ac.weight).toBeCloseTo(weight(0.5), 6)
    expect(ac.lastAt).toEqual(daysAgo(30))
  })

  it('trusts: 2.0 when the advice is bought within 7 days, 1.0 when saved, else 0.3', () => {
    const responses: AskResponseLite[] = [
      {
        askId: 'ask1',
        responderUserId: 'B',
        choiceProductId: 7,
        styledLookId: null,
        createdAt: daysAgo(10),
      },
      {
        askId: 'ask2',
        responderUserId: 'C',
        choiceProductId: 8,
        styledLookId: null,
        createdAt: daysAgo(10),
      },
      {
        askId: 'ask3',
        responderUserId: 'D',
        choiceProductId: 9,
        styledLookId: null,
        createdAt: daysAgo(10),
      },
    ]
    const rows = deriveRelationships(
      {
        ...empty(),
        askResponses: responses,
        interactions: [
          ix({
            id: 'adv1',
            actorUserId: 'B',
            targetUserId: 'A',
            type: 'ADVISE',
            askId: 'ask1',
            createdAt: daysAgo(10),
          }),
          ix({
            id: 'adv2',
            actorUserId: 'C',
            targetUserId: 'A',
            type: 'ADVISE',
            askId: 'ask2',
            createdAt: daysAgo(10),
          }),
          ix({
            id: 'adv3',
            actorUserId: 'D',
            targetUserId: 'A',
            type: 'ADVISE',
            askId: 'ask3',
            createdAt: daysAgo(10),
          }),
          ix({ actorUserId: 'A', type: 'SAVE', productId: 8, createdAt: daysAgo(8) }),
        ],
        purchases: [
          purchase({ userId: 'A', productId: 7, sourceAskId: 'ask1', createdAt: daysAgo(8) }),
          // too late to count as "followed"
          purchase({ userId: 'A', productId: 9, sourceAskId: 'ask3', createdAt: daysAgo(1) }),
        ],
      },
      NOW,
    )
    const decay = 2 ** (-10 / 30)
    const t = (b: string) =>
      rows.find((r) => r.kind === 'trusts' && r.aUserId === 'A' && r.bUserId === b)!
    expect(t('B').weight).toBeCloseTo(weight(2 * decay), 6)
    expect(t('C').weight).toBeCloseTo(weight(1 * decay), 6)
    expect(t('D').weight).toBeCloseTo(weight(0.3 * decay), 6)
  })

  it('inspired_by from remixes (1.5) and attributed purchases (2.5); remixed is the inverse view', () => {
    const rows = deriveRelationships(
      {
        ...empty(),
        looks: [
          look({ id: 'l1', ownerId: 'B' }),
          look({ id: 'l2', ownerId: 'A', kind: 'remix', parentLookId: 'l1' }),
        ],
        purchases: [purchase({ userId: 'C', productId: 1, sourceLookId: 'l1' })],
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
        purchases: [purchase({ userId: 'A', productId: 3, forKind: 'other', forUserId: 'C' })],
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
          purchase({ userId: 'A', productId: 1, sourceLookId: 'l9', createdAt: daysAgo(2) }),
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
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'ASK', createdAt: daysAgo(300) }),
          ix({ actorUserId: 'A', targetUserId: 'A', type: 'ASK' }),
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
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'ASK', createdAt: daysAgo(3) }),
          ix({ actorUserId: 'A', targetUserId: 'B', type: 'ASK', createdAt: daysAgo(1) }),
        ],
      },
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(2)
    expect(rows[0]!.lastAt).toEqual(daysAgo(1))
    expect(rows[0]!.weight).toBeCloseTo(weight(2 ** (-3 / 30) + 2 ** (-1 / 30)), 6)
  })
})

describe('trust', () => {
  it('is the clamped weighted sum of §5.1', () => {
    expect(trust({ trusts: 0.5, asks: 0.2 })).toBeCloseTo(0.6, 9)
    expect(trust({ trusts: 1, inspired_by: 1, styles: 1 })).toBe(1)
    expect(trust({ remixed: 1 })).toBe(0)
  })
})
