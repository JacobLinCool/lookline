/**
 * The scenarios #33 asks to be covered, against a migrated in-memory SQLite database — the same
 * dialect as D1, and with no transactions available, which is the point of most of these.
 */
import {
  articles,
  brands,
  cardCopies,
  cards,
  cardCandidates,
  collections,
  eq,
  personaTransfers,
  personas,
  insertAll,
  purchases,
  users,
} from '@lookline/db'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  acceptTransfer,
  addCollectionMember,
  availableArticles,
  addCandidate,
  cardHolder,
  createPersona,
  creditBalance,
  creditThresholdTwd,
  creditsForPurchaseLine,
  grantEntitlement,
  grantPurchaseCredits,
  holdingsOf,
  issueEdition,
  lendArticle,
  offerTransfer,
  openSession,
  reserveCredit,
  settleCard,
  startAttempt,
  transferPreview,
  verificationCode,
} from './index'

let handle: DbHandle
const HOUR = 3_600_000

const article = (id: string) => ({
  id,
  brandId: 1,
  productCode: id.slice(0, 6),
  name: `Article ${id}`,
  subcategory: 'Trousers',
  productGroup: 'Garment Lower body',
  indexName: 'Ladieswear',
  indexGroupName: 'Ladieswear',
  categoryGroup: 'bottoms' as const,
  outfitRole: 'bottom' as const,
  department: 'women' as const,
  slug: `article-${id}`,
  styleVector: Array.from({ length: 64 }, () => 0),
})

beforeAll(async () => {
  handle = await createTestDb()
  await handle.db.insert(brands).values({ id: 1, slug: 'hm', name: 'H&M', tier: 'mid' })
  await insertAll(handle.db, articles, ['0000000001', '0000000002', '0000000003'].map(article))
  await insertAll(
    handle.db,
    users,
    ['acc_a', 'acc_b', 'acc_c'].map((id) => ({ id, handle: id, displayName: id })),
  )
})

afterAll(async () => {
  await handle.close()
})

describe('credit grant rules', () => {
  it('uses the fixed demo rate, not the budget rounding: NT$320 qualifies and NT$319 does not', () => {
    expect(creditThresholdTwd()).toBe(320)
    expect(creditsForPurchaseLine(320, 1)).toBe(3)
    expect(creditsForPurchaseLine(319, 1)).toBe(0)
  })

  it('counts per unit, so two qualifying items earn six and two cheap ones earn none', () => {
    expect(creditsForPurchaseLine(320, 2)).toBe(6)
    expect(creditsForPurchaseLine(192, 2)).toBe(0)
  })
})

describe('the ledger', () => {
  it('grants once per purchase line however often the checkout is replayed', async () => {
    const db = handle.db
    await db.insert(purchases).values({
      id: 'pur_1',
      userId: 'acc_a',
      articleId: '0000000001',
      quantity: 1,
      price: 400,
    })
    const first = await grantPurchaseCredits(db, {
      id: 'led_1',
      ownerUserId: 'acc_a',
      purchaseId: 'pur_1',
      unitPrice: 400,
      quantity: 1,
      operationKey: 'grant:pur_1',
    })
    const replay = await grantPurchaseCredits(db, {
      id: 'led_1b',
      ownerUserId: 'acc_a',
      purchaseId: 'pur_1',
      unitPrice: 400,
      quantity: 1,
      operationKey: 'grant:pur_1',
    })
    expect(first).toBe(3)
    expect(replay).toBe(0)
    expect(await creditBalance(db, 'acc_a')).toBe(3)
  })

  it('lets only one of two sessions take the last credit', async () => {
    const db = handle.db
    await db.insert(purchases).values({
      id: 'pur_2',
      userId: 'acc_b',
      articleId: '0000000001',
      quantity: 1,
      price: 320,
    })
    await grantPurchaseCredits(db, {
      id: 'led_2',
      ownerUserId: 'acc_b',
      purchaseId: 'pur_2',
      unitPrice: 320,
      quantity: 1,
      operationKey: 'grant:pur_2',
    })
    // Spend two of the three, so exactly one is left for the race below.
    for (const n of [1, 2]) {
      expect(
        await reserveCredit(db, {
          id: `res_warm_${n}`,
          ownerUserId: 'acc_b',
          sessionId: `sess_warm_${n}`,
          operationKey: `reserve:warm:${n}`,
        }),
      ).toBe(true)
    }
    expect(await creditBalance(db, 'acc_b')).toBe(1)

    const [a, b] = await Promise.all([
      reserveCredit(db, {
        id: 'res_race_a',
        ownerUserId: 'acc_b',
        sessionId: 'sess_race_a',
        operationKey: 'reserve:race:a',
      }),
      reserveCredit(db, {
        id: 'res_race_b',
        ownerUserId: 'acc_b',
        sessionId: 'sess_race_b',
        operationKey: 'reserve:race:b',
      }),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(await creditBalance(db, 'acc_b')).toBe(0)
  })
})

describe('wardrobe', () => {
  it('shows owned and borrowed articles with the source each came from', async () => {
    const db = handle.db
    await db.insert(purchases).values({
      id: 'pur_3',
      userId: 'acc_c',
      articleId: '0000000002',
      quantity: 1,
      price: 100,
    })
    await grantEntitlement(db, {
      id: 'ent_1',
      ownerUserId: 'acc_c',
      purchaseId: 'pur_3',
      articleId: '0000000002',
      quantity: 1,
    })
    // Cheap enough to earn no credits, but it still enters the wardrobe.
    expect(await creditBalance(db, 'acc_c')).toBe(0)

    await lendArticle(db, {
      id: 'loan_1',
      entitlementId: 'ent_1',
      lenderUserId: 'acc_c',
      borrowerUserId: 'acc_a',
    })
    const mine = await availableArticles(db, 'acc_c')
    const borrowed = await availableArticles(db, 'acc_a')
    expect(mine.map((a) => a.source)).toEqual(['purchase'])
    expect(borrowed.map((a) => [a.articleId, a.source])).toEqual([['0000000002', 'loan']])
    // Lending hands over no credits.
    expect(await creditBalance(db, 'acc_a')).toBe(3)
  })
})

describe('a session settles into one card', () => {
  it('accepts four candidates, refuses a fifth, and any of them can be the card', async () => {
    const db = handle.db
    const now = new Date()
    await createPersona(db, { id: 'per_solo', ownerUserId: 'acc_a', displayName: 'Solo' })
    await reserveCredit(db, {
      id: 'res_solo',
      ownerUserId: 'acc_a',
      sessionId: 'sess_solo',
      operationKey: 'reserve:solo',
    })
    await openSession(db, {
      id: 'sess_solo',
      ownerUserId: 'acc_a',
      personaId: 'per_solo',
      reserveOperationKey: 'reserve:solo',
      articles: [
        { articleId: '0000000001', source: 'purchase' },
        { articleId: '0000000002', source: 'loan' },
      ],
      expiresAt: new Date(now.getTime() + HOUR),
    })
    await startAttempt(db, { id: 'att_solo', sessionId: 'sess_solo' })
    for (const n of [1, 2, 3, 4]) {
      const r = await addCandidate(db, {
        id: `cand_${n}`,
        sessionId: 'sess_solo',
        attemptId: 'att_solo',
        imagePath: `cards/solo-${n}.webp`,
        now,
      })
      expect(r).toEqual({ ok: true, position: n })
    }
    const fifth = await addCandidate(db, {
      id: 'cand_5',
      sessionId: 'sess_solo',
      attemptId: 'att_solo',
      imagePath: 'cards/solo-5.webp',
      now,
    })
    expect(fifth).toEqual({ ok: false, reason: 'full' })

    // The third of four is as valid a choice as the first.
    const settled = await settleCard(db, {
      cardId: 'card_solo',
      sessionId: 'sess_solo',
      candidateId: 'cand_3',
      verificationCode: 'LL-SOLO-0001',
      tier: 'standard',
      now,
    })
    expect(settled).toEqual({ ok: true })

    const [card] = await db.select().from(cards).where(eq(cards.id, 'card_solo'))
    expect(card?.imagePath).toBe('cards/solo-3.webp')
    expect(card?.authorUserId).toBe('acc_a')
    // One of the two articles was borrowed.
    expect(card?.ownedRatio).toBe(0.5)
    // A settled session takes no more candidates.
    const after = await addCandidate(db, {
      id: 'cand_6',
      sessionId: 'sess_solo',
      attemptId: 'att_solo',
      imagePath: 'cards/solo-6.webp',
      now,
    })
    expect(after).toEqual({ ok: false, reason: 'session-closed' })
  })
})

describe('a collection issues one copy per persona', () => {
  /** One account managing three personas still receives three copies, numbered 1/3 to 3/3. */
  it('numbers by persona, not by account, and transfers exactly one persona out', async () => {
    const db = handle.db
    const now = new Date()
    for (const [id, name] of [
      ['per_me', 'Me'],
      ['per_mum', 'Mum'],
      ['per_dad', 'Dad'],
    ] as const) {
      await createPersona(db, { id, ownerUserId: 'acc_a', displayName: name })
    }
    await db.insert(collections).values({
      id: 'col_1',
      ownerUserId: 'acc_a',
      title: 'Family',
    })
    // Each persona brings a personal card; one session per card, then the edition.
    for (const [i, personaId] of ['per_me', 'per_mum', 'per_dad'].entries()) {
      const sessionId = `sess_fam_${i}`
      await db.insert(purchases).values({
        id: `pur_fam_${i}`,
        userId: 'acc_a',
        articleId: '0000000003',
        quantity: 1,
        price: 640,
      })
      await grantPurchaseCredits(db, {
        id: `led_fam_${i}`,
        ownerUserId: 'acc_a',
        purchaseId: `pur_fam_${i}`,
        unitPrice: 640,
        quantity: 1,
        operationKey: `grant:pur_fam_${i}`,
      })
      await reserveCredit(db, {
        id: `res_fam_${i}`,
        ownerUserId: 'acc_a',
        sessionId,
        operationKey: `reserve:fam:${i}`,
      })
      await openSession(db, {
        id: sessionId,
        ownerUserId: 'acc_a',
        personaId,
        reserveOperationKey: `reserve:fam:${i}`,
        articles: [{ articleId: '0000000003', source: 'purchase' }],
        expiresAt: new Date(now.getTime() + HOUR),
      })
      await startAttempt(db, { id: `att_fam_${i}`, sessionId })
      await addCandidate(db, {
        id: `cand_fam_${i}`,
        sessionId,
        attemptId: `att_fam_${i}`,
        imagePath: `cards/fam-${i}.webp`,
        now,
      })
      await settleCard(db, {
        cardId: `card_fam_${i}`,
        sessionId,
        candidateId: `cand_fam_${i}`,
        verificationCode: `LL-FAM-000${i}`,
        tier: 'standard',
        now,
      })
      await addCollectionMember(db, {
        collectionId: 'col_1',
        personaId,
        cardId: `card_fam_${i}`,
      })
    }

    await reserveCredit(db, {
      id: 'res_edition',
      ownerUserId: 'acc_a',
      sessionId: 'sess_edition',
      operationKey: 'reserve:edition',
    })
    await openSession(db, {
      id: 'sess_edition',
      ownerUserId: 'acc_a',
      personaId: 'per_me',
      reserveOperationKey: 'reserve:edition',
      articles: [{ articleId: '0000000003', source: 'purchase' }],
      expiresAt: new Date(now.getTime() + HOUR),
    })
    const issued = await issueEdition(db, {
      editionId: 'ed_1',
      collectionId: 'col_1',
      sessionId: 'sess_edition',
      imagePath: 'cards/family.webp',
      copies: [
        { id: 'copy_me', personaId: 'per_me', verificationCode: 'LL-ED-1' },
        { id: 'copy_mum', personaId: 'per_mum', verificationCode: 'LL-ED-2' },
        { id: 'copy_dad', personaId: 'per_dad', verificationCode: 'LL-ED-3' },
      ],
      now,
    })
    expect(issued).toEqual({ ok: true, editionSize: 3 })

    // Three personas on one account: three cards and three copies, all held here.
    const before = await holdingsOf(db, 'acc_a')
    expect(before.copyIds).toHaveLength(3)

    // Handing Mum to another account moves her card and her one copy — and nothing else.
    const preview = await transferPreview(db, 'per_mum')
    expect(preview).toEqual({ cards: 1, copies: 1 })
    await offerTransfer(db, {
      id: 'tr_1',
      personaId: 'per_mum',
      fromUserId: 'acc_a',
      toUserId: 'acc_b',
      personaVersion: 1,
      expiresAt: new Date(now.getTime() + HOUR),
    })
    expect(
      await acceptTransfer(db, {
        transferId: 'tr_1',
        acceptingUserId: 'acc_b',
        now,
      }),
    ).toEqual({ ok: true })

    const afterA = await holdingsOf(db, 'acc_a')
    const afterB = await holdingsOf(db, 'acc_b')
    expect(afterA.copyIds.toSorted()).toEqual(['copy_dad', 'copy_me'])
    expect(afterB.copyIds).toEqual(['copy_mum'])
    expect(afterB.cardIds).toEqual(['card_fam_1'])
    expect(await cardHolder(db, 'card_fam_1')).toBe('acc_b')

    // The edition itself, and everyone else's numbering, is untouched.
    const copies = await db.select().from(cardCopies).where(eq(cardCopies.editionId, 'ed_1'))
    expect(copies.map((c) => c.editionNumber).toSorted()).toEqual([1, 2, 3])
    // The card still says who made it.
    const [mumCard] = await db.select().from(cards).where(eq(cards.id, 'card_fam_1'))
    expect(mumCard?.authorUserId).toBe('acc_a')
    expect(mumCard?.verificationCode).toBe('LL-FAM-0001')
  })

  it('refuses a second acceptance, a wrong recipient and an expired offer', async () => {
    const db = handle.db
    const now = new Date()
    await createPersona(db, { id: 'per_x', ownerUserId: 'acc_c', displayName: 'X' })
    await offerTransfer(db, {
      id: 'tr_x',
      personaId: 'per_x',
      fromUserId: 'acc_c',
      toUserId: 'acc_a',
      personaVersion: 1,
      expiresAt: new Date(now.getTime() + HOUR),
    })
    expect(await acceptTransfer(db, { transferId: 'tr_x', acceptingUserId: 'acc_b', now })).toEqual(
      { ok: false, reason: 'wrong-recipient' },
    )
    expect(await acceptTransfer(db, { transferId: 'tr_x', acceptingUserId: 'acc_a', now })).toEqual(
      { ok: true },
    )
    expect(await acceptTransfer(db, { transferId: 'tr_x', acceptingUserId: 'acc_a', now })).toEqual(
      { ok: false, reason: 'not-pending' },
    )

    await createPersona(db, { id: 'per_y', ownerUserId: 'acc_c', displayName: 'Y' })
    await offerTransfer(db, {
      id: 'tr_y',
      personaId: 'per_y',
      fromUserId: 'acc_c',
      toUserId: 'acc_a',
      personaVersion: 1,
      expiresAt: new Date(now.getTime() - 1),
    })
    expect(await acceptTransfer(db, { transferId: 'tr_y', acceptingUserId: 'acc_a', now })).toEqual(
      { ok: false, reason: 'expired' },
    )
  })
})

describe('what has no transaction around it', () => {
  it('finishes an acceptance whose second step never ran, instead of calling it stale', async () => {
    // D1 has no transaction, so the persona can be handed over with the offer still `pending`.
    // Left that way the partial unique index refuses every later offer for that persona.
    const db = handle.db
    const now = new Date()
    await createPersona(db, { id: 'per_half', ownerUserId: 'acc_c', displayName: 'Half' })
    await offerTransfer(db, {
      id: 'tr_half',
      personaId: 'per_half',
      fromUserId: 'acc_c',
      toUserId: 'acc_a',
      personaVersion: 1,
      expiresAt: new Date(now.getTime() + HOUR),
    })
    // The first step only: the persona moves, the offer stays open.
    await db
      .update(personas)
      .set({ ownerUserId: 'acc_a', version: 2 })
      .where(eq(personas.id, 'per_half'))

    expect(
      await acceptTransfer(db, { transferId: 'tr_half', acceptingUserId: 'acc_a', now }),
    ).toEqual({ ok: true })
    const [offer] = await db
      .select()
      .from(personaTransfers)
      .where(eq(personaTransfers.id, 'tr_half'))
    expect(offer?.state).toBe('accepted')
    // And a fresh offer is possible again, which the stuck `pending` row would have blocked.
    await offerTransfer(db, {
      id: 'tr_half2',
      personaId: 'per_half',
      fromUserId: 'acc_a',
      toUserId: 'acc_c',
      personaVersion: 2,
      expiresAt: new Date(now.getTime() + HOUR),
    })
  })

  it('numbers a candidate after the places already taken, not after how many there are', async () => {
    // What a second generate sees once the first has landed. The retry above it is for the
    // narrower window where both insert at once, which a single-threaded test cannot stage —
    // this covers the state that window leaves behind, and that positions never collide.
    const db = handle.db
    const now = new Date()
    await createPersona(db, { id: 'per_race', ownerUserId: 'acc_a', displayName: 'Race' })
    await reserveCredit(db, {
      id: 'led_race',
      ownerUserId: 'acc_a',
      sessionId: 'sess_race',
      operationKey: 'reserve:race',
    })
    await openSession(db, {
      id: 'sess_race',
      ownerUserId: 'acc_a',
      personaId: 'per_race',
      reserveOperationKey: 'reserve:race',
      articles: [],
      expiresAt: new Date(now.getTime() + HOUR),
    })
    await startAttempt(db, { id: 'ga_race1', sessionId: 'sess_race' })
    await startAttempt(db, { id: 'ga_race2', sessionId: 'sess_race' })
    // Stand in for the winner of the race: position 1 is taken before the loser inserts.
    await db.insert(cardCandidates).values({
      id: 'cc_winner',
      sessionId: 'sess_race',
      attemptId: 'ga_race1',
      imagePath: '',
      position: 1,
    })
    expect(
      await addCandidate(db, {
        id: 'cc_loser',
        sessionId: 'sess_race',
        attemptId: 'ga_race2',
        imagePath: '',
        now,
      }),
    ).toEqual({ ok: true, position: 2 })
  })

  it('refuses to issue an edition twice from one session', async () => {
    const db = handle.db
    const now = new Date()
    const again = await issueEdition(db, {
      editionId: 'ed_again',
      collectionId: 'col_1',
      sessionId: 'sess_edition',
      imagePath: 'cc_edition',
      copies: [{ id: 'cp_again', personaId: 'per_mum', verificationCode: 'LL-AGAIN-01' }],
      now,
    })
    expect(again).toEqual({ ok: false, reason: 'session-closed' })
  })
})

describe('verificationCode', () => {
  it('leaves out the characters that get mistyped off a printed card', () => {
    // nanoid's own alphabet has `-` and `_`, which produced codes like `LL--TWS-3TM`.
    const codes = Array.from({ length: 200 }, () => verificationCode())
    for (const code of codes) expect(code).toMatch(/^LL-[23456789A-HJ-NP-Z]{8}$/)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
