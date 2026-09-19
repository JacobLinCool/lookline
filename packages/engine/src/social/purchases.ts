/**
 * `recordPurchase`: the purchases row, the PURCHASE (+ BUY_FOR) interactions, an INSPIRE edge to
 * the source Look's owner when the purchase was attributed to a Look, and a `purchase` feedback
 * event (docs/CONTRACTS.md "Guarantees").
 */
import { eq, looks, articles, purchases, type Database, type Purchase } from '@lookline/db'
import type { PurchaseInput } from '../types'
import { emitFeedback } from './feedback'
import { newId } from './ids'
import { insertInteraction } from './interactions'
import { resolveCreatedAt } from './time'

export async function recordPurchase(db: Database, input: PurchaseInput): Promise<Purchase> {
  const [product] = await db
    .select({ id: articles.id, price: articles.price })
    .from(articles)
    .where(eq(articles.id, input.articleId))
    .limit(1)
  if (!product) throw new Error(`@lookline/engine: product ${input.articleId} not found`)

  const createdAt = await resolveCreatedAt(db, input.createdAt)
  const forKind = input.forKind ?? 'undisclosed'
  const forUserId = forKind === 'other' ? (input.forUserId ?? null) : null
  const quantity = Math.max(1, Math.round(input.quantity ?? 1))
  const id = newId(input.id)

  const [purchase] = await db
    .insert(purchases)
    .values({
      id,
      userId: input.userId,
      articleId: input.articleId,
      quantity,
      price: product.price,
      size: input.size ?? null,
      forKind,
      forUserId,
      forLabel: forKind === 'other' ? (input.forLabel ?? null) : null,
      sourceLookId: input.sourceLookId ?? null,
      sourceAskId: input.sourceAskId ?? null,
      intentSessionId: input.intentSessionId ?? null,
      createdAt,
    })
    .returning()
  if (!purchase) throw new Error('@lookline/engine: purchase was not inserted')

  const payload = {
    purchaseId: id,
    forKind,
    quantity,
    price: product.price,
    sourceLookId: input.sourceLookId ?? null,
    sourceAskId: input.sourceAskId ?? null,
  }
  await insertInteraction(db, {
    actorUserId: input.userId,
    type: 'PURCHASE',
    articleId: input.articleId,
    lookId: input.sourceLookId ?? null,
    askId: input.sourceAskId ?? null,
    payload,
    createdAt,
  })

  if (forKind === 'other') {
    await insertInteraction(db, {
      actorUserId: input.userId,
      type: 'BUY_FOR',
      targetUserId: forUserId,
      articleId: input.articleId,
      lookId: input.sourceLookId ?? null,
      payload: { ...payload, forLabel: input.forLabel ?? null },
      createdAt,
    })
  }

  if (input.sourceLookId) {
    const [source] = await db
      .select({ id: looks.id, ownerId: looks.ownerId })
      .from(looks)
      .where(eq(looks.id, input.sourceLookId))
      .limit(1)
    if (source && source.ownerId !== input.userId) {
      await insertInteraction(db, {
        actorUserId: input.userId,
        type: 'INSPIRE',
        targetUserId: source.ownerId,
        lookId: source.id,
        articleId: input.articleId,
        payload: { purchaseId: id, via: 'purchase' },
        createdAt,
      })
    }
  }

  await emitFeedback(db, {
    userId: input.userId,
    kind: 'purchase',
    articleId: input.articleId,
    lookId: input.sourceLookId ?? null,
    intentSessionId: input.intentSessionId ?? null,
    forOthers: forKind === 'other',
    context: {
      forKind,
      sourceLookId: input.sourceLookId ?? null,
      sourceAskId: input.sourceAskId ?? null,
      purchaseId: id,
      quantity,
    },
    createdAt,
  })

  return purchase
}
