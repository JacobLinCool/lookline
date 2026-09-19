/**
 * Integration test of `recordFeedback` / `getPreferenceProfile` against a migrated in-memory
 * SQLite database (the same dialect as D1): two generated catalog products, a throw-away user, a
 * handful of events, then the profile.
 */
import {
  banditState,
  brands,
  eq,
  feedbackEvents,
  insertAll,
  preferenceSnapshots,
  products,
  users,
} from '@lookline/db'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import { aestheticIndex, generateBrands, generateProduct } from '@lookline/catalog'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPreferenceProfile, recordFeedback } from './index'
import { BANDIT_STATE_ID } from './bandit'
import { cosineRange } from './vector'

const SEED = 20260918
const USER_ID = 'u_test_engine03'
const SESSION = `is_test_${USER_ID}`

let handle: DbHandle
let productId = 0
let otherProductId = 0
let productAesthetics: string[] = []

beforeAll(async () => {
  handle = await createTestDb()
  const brandRecords = generateBrands(SEED)
  await insertAll(
    handle.db,
    brands,
    brandRecords.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      tier: b.tier,
      homeAesthetics: b.homeAesthetics,
      homeDepartments: b.homeDepartments,
      priceMultiplier: b.priceMultiplier,
      origin: b.origin,
      description: b.description,
    })),
    { maxParams: 30_000 },
  )
  const [first, second] = [1, 2].map((i) => generateProduct(i, SEED, brandRecords))
  await insertAll(handle.db, products, [first!, second!], { maxParams: 30_000 })
  productId = first!.id
  otherProductId = second!.id
  productAesthetics = first!.aesthetics ?? []
  await handle.db
    .insert(users)
    .values({ id: USER_ID, handle: USER_ID, displayName: 'Engine 03 test', department: 'unisex' })
})

afterAll(async () => {
  await handle.close()
})

describe('recordFeedback / getPreferenceProfile (SQLite integration)', () => {
  it('learns from events, snapshots on purchase, separates gifts and attributes slates', async () => {
    const db = handle.db
    const T0 = Date.UTC(2026, 8, 1)
    const at = (h: number): Date => new Date(T0 + h * 3_600_000)
    // impression batch under an arm, then rewards attributed to the session
    await recordFeedback(db, {
      userId: USER_ID,
      kind: 'impression',
      productId,
      intentSessionId: SESSION,
      position: 0,
      context: { armId: 'taste-led', contextVector: [1, 0, 0, 0, 0.8, 0, 1, 0], position: 0 },
      createdAt: at(0),
    })
    await recordFeedback(db, {
      userId: USER_ID,
      kind: 'click',
      productId,
      intentSessionId: SESSION,
      position: 0,
      createdAt: at(1),
    })
    await recordFeedback(db, {
      userId: USER_ID,
      kind: 'save',
      productId,
      intentSessionId: SESSION,
      position: 0,
      createdAt: at(2),
    })

    const [afterSave] = await db
      .select({ p: users.preferenceVector, g: users.giftPreferenceVector })
      .from(users)
      .where(eq(users.id, USER_ID))
    expect(afterSave?.p).toHaveLength(64)
    expect(afterSave?.g).toBeNull()
    const [product] = await db
      .select({ v: products.styleVector })
      .from(products)
      .where(eq(products.id, productId))
    const primary = productAesthetics[0]
    if (primary) {
      const idx = aestheticIndex(primary)
      expect(afterSave!.p![idx]!).toBeGreaterThan(0.05)
    }
    expect(cosineRange(afterSave!.p!, product!.v, 0, 52)).toBeGreaterThan(0.3)

    // a purchase writes a snapshot; a gift purchase touches only the gift vector
    await recordFeedback(db, {
      userId: USER_ID,
      kind: 'purchase',
      productId,
      intentSessionId: SESSION,
      position: 0,
      context: { forKind: 'self' },
      createdAt: at(3),
    })
    const snaps = await db
      .select()
      .from(preferenceSnapshots)
      .where(eq(preferenceSnapshots.userId, USER_ID))
    expect(snaps).toHaveLength(1)
    expect(snaps[0]!.version).toBe(1)
    expect(snaps[0]!.eventCount).toBe(3)
    expect(snaps[0]!.metrics['n']).toBe(3)
    expect(snaps[0]!.metrics['confidence']).toBeGreaterThan(0)
    const [beforeGift] = await db
      .select({ p: users.preferenceVector })
      .from(users)
      .where(eq(users.id, USER_ID))
    await recordFeedback(db, {
      userId: USER_ID,
      kind: 'purchase',
      productId: otherProductId,
      forOthers: true,
      context: { forKind: 'other', forLabel: 'dad' },
      createdAt: at(4),
    })
    const [afterGift] = await db
      .select({ p: users.preferenceVector, g: users.giftPreferenceVector })
      .from(users)
      .where(eq(users.id, USER_ID))
    expect(afterGift!.p).toEqual(beforeGift!.p)
    expect(afterGift!.g).toHaveLength(64)
    const snaps2 = await db
      .select()
      .from(preferenceSnapshots)
      .where(eq(preferenceSnapshots.userId, USER_ID))
    expect(snaps2).toHaveLength(2)
    // two more gift saves so the gift profile passes the 3-event floor
    await recordFeedback(db, {
      userId: USER_ID,
      kind: 'save',
      productId: otherProductId,
      forOthers: true,
      createdAt: at(5),
    })
    await recordFeedback(db, {
      userId: USER_ID,
      kind: 'save',
      productId: otherProductId,
      forOthers: true,
      createdAt: at(6),
    })
    const [afterGiftSaves] = await db
      .select({ p: users.preferenceVector })
      .from(users)
      .where(eq(users.id, USER_ID))
    expect(afterGiftSaves!.p).toEqual(beforeGift!.p)

    // bandit state carries the attributed slate
    const [state] = await db
      .select()
      .from(banditState)
      .where(eq(banditState.id, BANDIT_STATE_ID))
      .limit(1)
    expect(state).toBeDefined()
    const slates = (state!.payload as { slates: Array<[string, { reward: number }]> }).slates
    const mine = slates.find(([key]) => key === `${USER_ID}|${SESSION}`)
    expect(mine).toBeDefined()
    expect(mine![1].reward).toBe(1) // click .1 + save .4 + purchase 1 at position 0 → clipped to 1 → 1

    // profile
    const profile = await getPreferenceProfile(db, USER_ID)
    expect(profile.userId).toBe(USER_ID)
    expect(profile.eventCount).toBe(6)
    expect(profile.vector).toHaveLength(64)
    expect(profile.giftVector).toHaveLength(64)
    expect(profile.topAesthetics.length).toBeGreaterThan(0)
    expect(profile.topAesthetics[0]!.evidence.length).toBeGreaterThan(0)
    expect(profile.topAesthetics[0]!.evidence.join(' ')).toMatch(/bought|saved|clicked/)
    expect(profile.giftTopAesthetics.length).toBeGreaterThan(0)
    expect(profile.giftTopAesthetics[0]!.evidence.join(' ')).toContain('for dad')
    expect(profile.snapshots).toHaveLength(2)
    expect(profile.snapshots[0]!.version).toBe(2)
    expect(profile.bandit?.arms.find((a) => a.name === 'taste-led')?.pulls).toBe(1)
    expect(profile.bandit?.current).toBeDefined()
    expect(profile.bandit?.reason).toBeDefined()

    // unknown user → empty profile, no throw
    const empty = await getPreferenceProfile(db, 'u_does_not_exist')
    expect(empty.vector).toBeNull()
    expect(empty.eventCount).toBe(0)
    // impression, click, save, purchase, gift purchase, two gift saves
    expect(await db.select().from(feedbackEvents)).toHaveLength(7)
  }, 30_000)
})
