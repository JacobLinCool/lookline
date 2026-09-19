/**
 * Wardrobe entitlements and lending (#33, #34).
 *
 * Every purchased item enters the wardrobe, whatever it cost — the price threshold only decides
 * credits. Lending copies nothing: the lender keeps the entitlement, the borrower may dress a
 * persona in the article, and no new credits are created by either side.
 */
import {
  and,
  articles,
  eq,
  inArray,
  or,
  sql,
  wardrobeEntitlements,
  wardrobeLoans,
  type Database,
  type EntitlementSource,
} from '@lookline/db'
import { entitlementQuantity } from './rules'

export interface EntitlementInput {
  id: string
  ownerUserId: string
  purchaseId: string
  articleId: string
  size?: string | null
  quantity: number
}

/**
 * Record what a confirmed purchase line put in the wardrobe. The unique index on `purchaseId`
 * makes a repeated checkout a no-op rather than a second entitlement.
 */
export async function grantEntitlement(db: Database, input: EntitlementInput): Promise<boolean> {
  const quantity = entitlementQuantity(input.quantity)
  if (quantity === 0) return false
  const existing = await db
    .select({ id: wardrobeEntitlements.id })
    .from(wardrobeEntitlements)
    .where(eq(wardrobeEntitlements.purchaseId, input.purchaseId))
    .limit(1)
  if (existing.length > 0) return false
  await db.insert(wardrobeEntitlements).values({
    id: input.id,
    ownerUserId: input.ownerUserId,
    purchaseId: input.purchaseId,
    articleId: input.articleId,
    size: input.size ?? null,
    quantity,
  })
  return true
}

export async function lendArticle(
  db: Database,
  input: { id: string; entitlementId: string; lenderUserId: string; borrowerUserId: string },
): Promise<void> {
  await db.insert(wardrobeLoans).values({
    id: input.id,
    entitlementId: input.entitlementId,
    lenderUserId: input.lenderUserId,
    borrowerUserId: input.borrowerUserId,
    state: 'active',
  })
}

export async function revokeLoan(db: Database, input: { id: string; now: Date }): Promise<void> {
  await db
    .update(wardrobeLoans)
    .set({ state: 'revoked', revokedAt: input.now })
    .where(eq(wardrobeLoans.id, input.id))
}

export interface AvailableArticle {
  articleId: string
  entitlementId: string
  source: EntitlementSource
  /** The account that bought it — the lender, for a borrowed one. */
  ownerUserId: string
}

/**
 * What this account may dress a persona in: its own purchases, plus what friends have lent it.
 * The exact article and the entitlement it came from are both kept, because a card records which
 * of the clothes on it were the author's own.
 */
export async function availableArticles(db: Database, userId: string): Promise<AvailableArticle[]> {
  const [owned, borrowed] = await Promise.all([
    db
      .select({
        articleId: wardrobeEntitlements.articleId,
        entitlementId: wardrobeEntitlements.id,
        ownerUserId: wardrobeEntitlements.ownerUserId,
      })
      .from(wardrobeEntitlements)
      .where(eq(wardrobeEntitlements.ownerUserId, userId)),
    db
      .select({
        articleId: wardrobeEntitlements.articleId,
        entitlementId: wardrobeEntitlements.id,
        ownerUserId: wardrobeEntitlements.ownerUserId,
      })
      .from(wardrobeLoans)
      .innerJoin(wardrobeEntitlements, eq(wardrobeEntitlements.id, wardrobeLoans.entitlementId))
      .where(and(eq(wardrobeLoans.borrowerUserId, userId), eq(wardrobeLoans.state, 'active'))),
  ])
  return [
    ...owned.map((r) => ({ ...r, source: 'purchase' as const })),
    ...borrowed.map((r) => ({ ...r, source: 'loan' as const })),
  ]
}

/** The share of a card's articles the author owned outright — snapshotted onto the card. */
export function ownedRatio(sources: ReadonlyArray<{ source: EntitlementSource }>): number {
  if (sources.length === 0) return 0
  const owned = sources.filter((s) => s.source === 'purchase').length
  return Math.round((owned / sources.length) * 1000) / 1000
}

export { articles, inArray, or, sql }
