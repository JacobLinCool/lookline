/**
 * Integration smoke test for the social write paths against the local SQLite database.
 *
 *   pnpm --filter @lookline/engine exec tsx scripts/social-smoke.ts
 *
 * Creates two throwaway users, records a purchase, creates an edition, a remix by the second
 * user (via suggestRemix), an Ask + answer, prints the interactions written, then deletes every
 * throwaway row. Skips cleanly when the products table is empty.
 */
import {
  askResponses,
  asks,
  count,
  desc,
  eq,
  feedbackEvents,
  gt,
  inArray,
  interactions,
  lookParticipants,
  lookProducts,
  looks,
  preferenceSnapshots,
  products,
  purchases,
  users,
} from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'
import { nanoid } from 'nanoid'
import { answerAsk, createAsk, createLook, recordPurchase, suggestRemix } from '../src/social'

loadEnv()

const tag = nanoid(6)
const timings: Record<string, number> = {}
async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now()
  const out = await fn()
  timings[name] = Math.round(performance.now() - t0)
  return out
}

const handle = createLocalDb()
const { db } = handle

async function main(): Promise<void> {
  const counted = await db.select({ n: count() }).from(products)
  if ((counted[0]?.n ?? 0) === 0) {
    console.log('products table is empty — skipping social smoke test')
    return
  }
  const picks = await db
    .select()
    .from(products)
    .where(gt(products.stock, 0))
    .orderBy(desc(products.popularity))
    .limit(60)
  const byGroup = new Map<string, (typeof picks)[number]>()
  for (const p of picks) if (!byGroup.has(p.categoryGroup)) byGroup.set(p.categoryGroup, p)
  const outfit = [...byGroup.values()].slice(0, 4)
  if (outfit.length === 0) throw new Error('no in-stock products found')

  const alice = `smoke_${tag}_a`
  const bob = `smoke_${tag}_b`
  await db.insert(users).values([
    {
      id: alice,
      handle: `smoke-${tag}-alice`,
      displayName: 'Smoke Alice',
      department: 'women',
      sizes: { alpha: 'M', 'numeric-waist': '28', 'eu-shoe': '38' },
    },
    {
      id: bob,
      handle: `smoke-${tag}-bob`,
      displayName: 'Smoke Bob',
      department: 'men',
      sizes: { alpha: 'L', 'numeric-waist': '32', 'eu-shoe': '43' },
    },
  ])
  const lookIds: string[] = []
  const askIds: string[] = []
  try {
    const purchase = await timed('recordPurchase', () =>
      recordPurchase(db, { userId: alice, productId: outfit[0]!.id, forKind: 'self', size: 'M' }),
    )
    console.log('purchase', purchase.id, 'NT$', purchase.price)

    const edition = await timed('createLook(edition)', () =>
      createLook(db, {
        ownerId: alice,
        productIds: outfit.map((p) => p.id),
        stylePreset: 'paris-editorial',
        visibility: 'link',
      }),
    )
    lookIds.push(edition.id)
    console.log(
      'edition',
      edition.id,
      edition.title,
      edition.aesthetics,
      edition.palette,
      `depth=${edition.depth}`,
    )

    const suggestion = await timed('suggestRemix', () => suggestRemix(db, edition.id, bob, {}))
    console.log('remix suggestion:', suggestion.explanation.summary)
    for (const it of suggestion.items) {
      console.log(
        `  [${it.role}] ${it.brandName} ${it.product.name} NT$${it.product.price} score=${it.score} — ${it.explanation.summary}`,
      )
    }
    console.log('  kept aesthetics', suggestion.keptAesthetics, 'palette', suggestion.palette)
    const remixProducts =
      suggestion.items.length > 0
        ? suggestion.items.map((i) => i.product.id)
        : outfit.map((p) => p.id)
    const remix = await timed('createLook(remix)', () =>
      createLook(db, {
        ownerId: bob,
        productIds: remixProducts,
        stylePreset: 'tokyo-midnight',
        kind: 'remix',
        parentLookId: edition.id,
      }),
    )
    lookIds.push(remix.id)
    console.log('remix', remix.id, `root=${remix.rootLookId} depth=${remix.depth}`)

    const giftPurchase = await timed('recordPurchase(fromLook)', () =>
      recordPurchase(db, {
        userId: bob,
        productId: remixProducts[0]!,
        forKind: 'other',
        forUserId: alice,
        forLabel: 'Alice',
        sourceLookId: edition.id,
      }),
    )
    console.log('purchase from look', giftPurchase.id)

    const together = await timed('createLook(together)', () =>
      createLook(db, {
        ownerId: alice,
        productIds: [...new Set([...outfit.map((p) => p.id), ...remixProducts])],
        stylePreset: 'studio-minimal',
        kind: 'together',
        occasion: 'brunch',
        participants: [
          { userId: alice, sourceLookId: edition.id },
          { userId: bob, sourceLookId: remix.id },
        ],
      }),
    )
    lookIds.push(together.id)
    console.log(
      'together',
      together.id,
      `participants=${(await db.select().from(lookParticipants).where(eq(lookParticipants.lookId, together.id))).length}`,
    )

    const ask = await timed('createAsk', () =>
      createAsk(db, {
        askerId: alice,
        kind: 'choose',
        question: 'Which one for brunch?',
        optionProductIds: outfit.slice(0, 2).map((p) => p.id),
        lookId: edition.id,
        targetUserId: bob,
      }),
    )
    askIds.push(ask.id)
    const answer = await timed('answerAsk', () =>
      answerAsk(db, {
        askId: ask.id,
        responderUserId: bob,
        responderName: 'Smoke Bob',
        choiceProductId: outfit[0]!.id,
        comment: 'The first one.',
      }),
    )
    const [answered] = await db
      .select({ status: asks.status })
      .from(asks)
      .where(eq(asks.id, ask.id))
    console.log('ask', ask.id, 'answer', answer.id, 'status', answered?.status)

    const written = await db
      .select({
        type: interactions.type,
        actor: interactions.actorUserId,
        target: interactions.targetUserId,
        lookId: interactions.lookId,
        askId: interactions.askId,
        productId: interactions.productId,
      })
      .from(interactions)
      .where(inArray(interactions.actorUserId, [alice, bob]))
      .orderBy(interactions.createdAt, interactions.type)
    console.log(`\n${written.length} interactions written:`)
    for (const row of written) {
      console.log(
        `  ${row.type.padEnd(11)} ${row.actor} → ${row.target ?? '-'}  look=${row.lookId ?? '-'} ask=${row.askId ?? '-'} product=${row.productId ?? '-'}`,
      )
    }
    const fb = await db
      .select({
        kind: feedbackEvents.kind,
        reward: feedbackEvents.reward,
        forOthers: feedbackEvents.forOthers,
      })
      .from(feedbackEvents)
      .where(inArray(feedbackEvents.userId, [alice, bob]))
    console.log(
      `${fb.length} feedback events:`,
      fb.map((f) => `${f.kind}${f.forOthers ? '(gift)' : ''}=${f.reward}`).join(', '),
    )
    console.log('\ntimings (ms):', timings)
  } finally {
    await db.delete(feedbackEvents).where(inArray(feedbackEvents.userId, [alice, bob]))
    await db.delete(preferenceSnapshots).where(inArray(preferenceSnapshots.userId, [alice, bob]))
    await db.delete(interactions).where(inArray(interactions.actorUserId, [alice, bob]))
    await db.delete(purchases).where(inArray(purchases.userId, [alice, bob]))
    if (askIds.length > 0) {
      await db.delete(askResponses).where(inArray(askResponses.askId, askIds))
      await db.delete(asks).where(inArray(asks.id, askIds))
    }
    if (lookIds.length > 0) {
      await db.delete(lookProducts).where(inArray(lookProducts.lookId, lookIds))
      await db.delete(lookParticipants).where(inArray(lookParticipants.lookId, lookIds))
      await db.delete(looks).where(inArray(looks.id, lookIds))
    }
    await db.delete(users).where(inArray(users.id, [alice, bob]))
    console.log('cleaned up throwaway rows')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => handle.close())
