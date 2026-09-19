/**
 * The product rules for card credits, in one place and versioned, so a grant can always be
 * explained by the rules that were in force when it happened (#33, #34).
 *
 * Pure: no database, no clock. Everything here is decided from a purchase line's own snapshot.
 */
import { customAlphabet } from 'nanoid'
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

// ---------------------------------------------------------------------------
// Card tiers (#36)
// ---------------------------------------------------------------------------

/**
 * A card's tier is how much of what it shows the author owned: owned pieces over all pieces, by
 * count and not by price, so a cheap shirt counts the same as an expensive coat. Selecting the
 * same article twice cannot inflate it — `ownedRatioOf` counts distinct articles.
 *
 * The lowest band exists so an outfit borrowed entirely from friends still lands somewhere named
 * rather than nowhere. Bands and their public names are configured here, once.
 */
export interface CardTier {
  slug: string
  labelEn: string
  labelZh: string
  /** Inclusive lower bound of the band. */
  min: number
}

export const CARD_TIERS: readonly CardTier[] = [
  { slug: 'full', labelEn: 'Fully owned', labelZh: '全數自有', min: 1 },
  { slug: 'mostly', labelEn: 'Mostly owned', labelZh: '多數自有', min: 0.75 },
  { slug: 'half', labelEn: 'Half owned', labelZh: '半數自有', min: 0.5 },
  { slug: 'some', labelEn: 'Part owned', labelZh: '部分自有', min: 0.25 },
  { slug: 'borrowed', labelEn: 'Borrowed', labelZh: '全數借用', min: 0 },
]

/** The band a ratio falls in. Bands are half-open downwards: 0.75 is `mostly`, 0.749 is `half`. */
export function tierForRatio(ratio: number): CardTier {
  const r = Math.max(0, Math.min(1, ratio))
  return CARD_TIERS.find((t) => r >= t.min) ?? CARD_TIERS[CARD_TIERS.length - 1]!
}

/**
 * Owned share of the pieces on a card, counting each article once however many times it was
 * picked. An empty selection is not a card, and answers 0.
 */
export function ownedRatioOf(
  pieces: ReadonlyArray<{ articleId: string; source: 'purchase' | 'loan' }>,
): number {
  const seen = new Map<string, 'purchase' | 'loan'>()
  for (const p of pieces) if (!seen.has(p.articleId)) seen.set(p.articleId, p.source)
  if (seen.size === 0) return 0
  let owned = 0
  for (const source of seen.values()) if (source === 'purchase') owned += 1
  return Math.round((owned / seen.size) * 1000) / 1000
}

/**
 * Codes are read off a card and typed into the verification box, so the alphabet leaves out
 * everything that fails that trip: nanoid's own `-` and `_` (which collide with the `LL-` prefix
 * and with each other in handwriting), and the 0/O, 1/I/L pairs.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const codeBody = customAlphabet(CODE_ALPHABET, 8)

/** A fresh verification code, e.g. `LL-7KQD3XJP`. Unique-indexed wherever it is stored. */
export function verificationCode(): string {
  return `LL-${codeBody()}`
}
