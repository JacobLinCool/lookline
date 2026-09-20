import { nanoid } from 'nanoid'
import { eq, sql, sqlNowMs, articles, purchases, type Database, type Purchase } from '@lookline/db'
import type { PurchaseInput } from '../types'
import { recordFeedback } from '../preference'

async function createdAtFor(db: Database, override?: Date): Promise<Date> {
  if (override) return override
  const row = await db.get<{ now: number | string | null }>(sql`select ${sqlNowMs()} as now`)
  const raw = row?.now
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw)
  if (typeof raw === 'string' && raw !== '') return new Date(Number(raw))
  throw new Error('@lookline/engine: could not read the database clock')
}

/** Record one canonical purchase and the preference feedback learned from it. */
export async function recordPurchase(db: Database, input: PurchaseInput): Promise<Purchase> {
  const [article] = await db
    .select({ id: articles.id, price: articles.price })
    .from(articles)
    .where(eq(articles.id, input.articleId))
    .limit(1)
  if (!article) throw new Error(`@lookline/engine: article ${input.articleId} not found`)

  const createdAt = await createdAtFor(db, input.createdAt)
  const forKind = input.forKind ?? 'undisclosed'
  const quantity = Math.max(1, Math.round(input.quantity ?? 1))
  const id = input.id ?? nanoid()
  const [purchase] = await db
    .insert(purchases)
    .values({
      id,
      userId: input.userId,
      articleId: input.articleId,
      quantity,
      price: article.price,
      size: input.size ?? null,
      forKind,
      forUserId: forKind === 'other' ? (input.forUserId ?? null) : null,
      forLabel: forKind === 'other' ? (input.forLabel ?? null) : null,
      sourceCardId: input.sourceCardId ?? null,
      intentSessionId: input.intentSessionId ?? null,
      createdAt,
    })
    .returning()
  if (!purchase) throw new Error('@lookline/engine: purchase was not inserted')

  await recordFeedback(db, {
    userId: input.userId,
    kind: 'purchase',
    articleId: input.articleId,
    cardId: input.sourceCardId ?? null,
    intentSessionId: input.intentSessionId ?? null,
    forOthers: forKind === 'other',
    context: {
      forKind,
      sourceCardId: input.sourceCardId ?? null,
      purchaseId: id,
      quantity,
    },
    createdAt,
  })
  return purchase
}
