/**
 * The product rules for card credits, in one place and versioned, so a grant can always be
 * explained by the rules that were in force when it happened (#33, #34).
 *
 * Pure: no database, no clock. Everything here is decided from a purchase line's own snapshot.
 */
import { currencyRate } from '../constants/currency'

/**
 * Bump when any number below changes. Every ledger row records the version that decided it, so a
 * later reading of the rules never rewrites what an earlier purchase was entitled to.
 */
export const CREDIT_RULE_VERSION = '2026-09-20.1'

/** An item priced at or above this, per unit, earns credits. Below it, it still enters the wardrobe. */
export const CREDIT_THRESHOLD_USD = 10

/** Granted per qualifying unit — not per order, and not per card. */
export const CREDITS_PER_QUALIFYING_UNIT = 3

/** A session may produce this many candidates; exactly one of them becomes the card. */
export const MAX_CANDIDATES_PER_SESSION = 4

/**
 * The threshold in the currency the catalogue actually stores. This is the project's fixed demo
 * rate (1 USD = 32 TWD), not a live one, and deliberately not `toTwd`: that rounds to the nearest
 * 50 or 100 for budget phrasing, which would move the boundary this rule is defined by.
 */
export function creditThresholdTwd(): number {
  return CREDIT_THRESHOLD_USD * (currencyRate('USD') ?? 32)
}

/**
 * Credits earned by one confirmed purchase line. `unitPrice` is the price snapshotted on the
 * line, never the catalogue's price at the time a card is made.
 */
export function creditsForPurchaseLine(unitPrice: number, quantity: number): number {
  if (quantity <= 0) return 0
  return unitPrice >= creditThresholdTwd() ? CREDITS_PER_QUALIFYING_UNIT * quantity : 0
}

/** Every purchased item enters the wardrobe, whatever it cost. */
export function entitlementQuantity(quantity: number): number {
  return Math.max(0, quantity)
}
