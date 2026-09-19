import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  articles,
  brands,
  cardCandidates,
  cardSessions,
  cards,
  feedbackEvents,
  friendships,
  generationAttempts,
  insertAll,
  personas,
  purchases,
  users,
} from '@lookline/db'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import {
  friendActivity,
  inviteFriend,
  preferences,
  recent,
  recordArticleView,
  respondFriend,
  setCardVisibility,
  setPurchaseSharing,
  trending,
} from './index'

let handle: DbHandle
const now = new Date()
beforeAll(async () => {
  handle = await createTestDb()
  const db = handle.db
  await db.insert(brands).values({ id: 1, slug: 'hm', name: 'H&M', tier: 'mid' })
  await insertAll(
    db,
    users,
    ['alice', 'bob', 'carol'].map((id) => ({ id, handle: id, displayName: id })),
  )
  await insertAll(
    db,
    articles,
    Array.from({ length: 30 }, (_, i) => ({
      id: String(i + 1).padStart(10, '0'),
      brandId: 1,
      productCode: String(i + 1),
      name: `Piece ${i + 1}`,
      subcategory: 'Trousers',
      productGroup: 'Garment Lower body',
      indexName: 'Ladieswear',
      indexGroupName: 'Ladieswear',
      categoryGroup: 'bottoms' as const,
      outfitRole: 'bottom' as const,
      department: 'women' as const,
      slug: `piece-${i}`,
      styleVector: Array.from({ length: 64 }, () => 0),
      aesthetics: [i % 2 ? 'minimalist' : 'streetwear'],
      colorFamily: i % 2 ? ('blue' as const) : ('black' as const),
      popularity: i,
      trendScore: i === 5 ? 100 : 0,
    })),
  )
  await db
    .insert(personas)
    .values({ id: 'persona', ownerUserId: 'bob', displayName: 'Bob persona' })
  for (const visibility of ['private', 'link', 'public'] as const) {
    await db.insert(cardSessions).values({
      id: visibility,
      ownerUserId: 'bob',
      personaId: 'persona',
      reserveOperationKey: visibility,
      expiresAt: new Date(Date.now() + 100000),
    })
    await db
      .insert(generationAttempts)
      .values({ id: visibility, sessionId: visibility, state: 'succeeded' })
    await db.insert(cardCandidates).values({
      id: visibility,
      sessionId: visibility,
      attemptId: visibility,
      imagePath: 'test.svg',
      position: 0,
    })
    await db.insert(cards).values({
      id: visibility,
      sessionId: visibility,
      candidateId: visibility,
      personaId: 'persona',
      authorUserId: 'bob',
      imagePath: 'test.svg',
      verificationCode: visibility,
      tier: 'owned',
      visibility,
      issuedAt: now,
    })
  }
  // A candidate that was never settled must never appear in activity.
  await db.insert(cardCandidates).values({
    id: 'draft',
    sessionId: 'private',
    attemptId: 'private',
    imagePath: 'draft.svg',
    position: 1,
  })
  await db
    .insert(purchases)
    .values({ id: 'purchase', userId: 'bob', articleId: '0000000001', price: 800, createdAt: now })
})
afterAll(async () => handle.close())

it('uses the global trend ordering and de-duplicates A → B → A by last actual visit', async () => {
  const db = handle.db
  expect((await trending(db))[0]?.id).toBe('0000000006')
  await recordArticleView(db, 'alice', '0000000001', new Date(1000))
  await recordArticleView(db, 'alice', '0000000002', new Date(2000))
  await recordArticleView(db, 'alice', '0000000001', new Date(3000))
  await recordArticleView(db, 'alice', '0000000001', new Date(500))
  expect((await recent(db, 'alice')).map((p) => p.id)).toEqual(['0000000001', '0000000002'])
  expect(await recent(db, 'carol')).toEqual([])
})
it('builds two genuinely different preference rails, with no repeated article or product', async () => {
  const db = handle.db
  expect(await preferences(db, 'alice')).toEqual([])
  await insertAll(
    db,
    feedbackEvents,
    [1, 2, 3, 4].map((i) => ({
      id: `save-${i}`,
      userId: 'alice',
      articleId: String(i).padStart(10, '0'),
      kind: 'save' as const,
      reward: 0.4,
      createdAt: now,
    })),
  )
  const rows = await preferences(db, 'alice')
  expect(rows).toHaveLength(2)
  expect(new Set(rows.map((r) => `${r.kind}:${r.value}`)).size).toBe(2)
  const ids = rows.flatMap((row) => row.items.map((p) => p.id))
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids.length).toBeGreaterThan(2)
})
it('requires a recipient-accepted invitation and opt-in purchases; candidates/private/link cards stay out', async () => {
  const db = handle.db
  await setPurchaseSharing(db, 'bob', true)
  await inviteFriend(db, 'alice', 'bob')
  await respondFriend(db, 'alice', 'bob', 'accept')
  expect((await friendActivity(db, 'alice')).items).toEqual([])
  await respondFriend(db, 'carol', 'bob', 'accept')
  expect((await friendActivity(db, 'alice')).items).toEqual([])
  await respondFriend(db, 'bob', 'alice', 'accept')
  const result = await friendActivity(db, 'alice')
  expect(result.friendCount).toBe(1)
  expect(result.items.map((item) => item.id).toSorted()).toEqual(['public', 'purchase'])
  await setPurchaseSharing(db, 'bob', false)
  expect((await friendActivity(db, 'alice')).items.map((item) => item.id)).toEqual(['public'])
  await setCardVisibility(db, 'carol', 'public', 'private')
  expect((await friendActivity(db, 'alice')).items.map((item) => item.id)).toEqual(['public'])
  await setCardVisibility(db, 'bob', 'public', 'private')
  expect((await friendActivity(db, 'alice')).items).toEqual([])
  await setCardVisibility(db, 'bob', 'public', 'public')
  await respondFriend(db, 'alice', 'bob', 'remove')
  expect((await friendActivity(db, 'alice')).items).toEqual([])
  expect(await db.select().from(friendships)).toHaveLength(0)
})
it('has indexed top-N plans rather than catalog/history scans', async () => {
  const plans = [
    [
      'select article_id from articles order by trend_score desc, popularity desc, article_id desc limit 12',
      'articles_home_trending_idx',
    ],
    [
      "select article_id from recent_article_views where user_id='alice' order by viewed_at desc, article_id desc limit 12",
      'recent_article_views_user_time_idx',
    ],
    [
      "select id from feedback_events where user_id='alice' order by created_at desc, id desc limit 200",
      'feedback_events_user_time_idx',
    ],
  ]
  for (const [query, index] of plans) {
    const result = await handle.client.execute(`EXPLAIN QUERY PLAN ${query}`)
    const plan = JSON.stringify(result.rows)
    expect(plan).toContain(index)
    expect(plan).not.toContain('USE TEMP B-TREE')
  }
})
