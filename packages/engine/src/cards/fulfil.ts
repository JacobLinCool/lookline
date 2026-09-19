/**
 * What a confirmed order gives the buyer (#34): every line enters the wardrobe, and lines priced
 * at or above the threshold also grant credits.
 *
 * Both halves key off the purchase id, so this is safe to call again for the same order — a
 * retried checkout, a refreshed confirmation page, or a resumed partial order. Lines already
 * fulfilled are skipped rather than counted twice, which is also what lets an interrupted order
 * be completed by simply calling this again with the same ids.
 */
import type { Database } from '@lookline/db'
import { grantPurchaseCredits } from './credits'
import { grantEntitlement } from './wardrobe'

export interface FulfilLine {
  purchaseId: string
  articleId: string
  /** Price per unit, snapshotted on the purchase — never re-read from the catalogue. */
  unitPrice: number
  quantity: number
  size?: string | null
}

export interface FulfilResult {
  /** Lines newly added to the wardrobe by this call. */
  entitlements: number
  /** Credits newly granted by this call; a replay grants none. */
  credits: number
}

/** Deterministic from the purchase id, so a replay produces the same keys and collides. */
const entitlementId = (purchaseId: string): string => `ent_${purchaseId}`
const creditId = (purchaseId: string): string => `led_${purchaseId}`
const grantKey = (purchaseId: string): string => `grant:purchase:${purchaseId}`

export async function fulfilPurchaseLines(
  db: Database,
  ownerUserId: string,
  lines: readonly FulfilLine[],
): Promise<FulfilResult> {
  let entitlements = 0
  let credits = 0
  for (const line of lines) {
    const added = await grantEntitlement(db, {
      id: entitlementId(line.purchaseId),
      ownerUserId,
      purchaseId: line.purchaseId,
      articleId: line.articleId,
      size: line.size ?? null,
      quantity: line.quantity,
    })
    if (added) entitlements += 1
    credits += await grantPurchaseCredits(db, {
      id: creditId(line.purchaseId),
      ownerUserId,
      purchaseId: line.purchaseId,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      operationKey: grantKey(line.purchaseId),
    })
  }
  return { entitlements, credits }
}
