'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { PurchaseFor } from '@lookline/db'
import { fulfilPurchaseLines, recordPurchase } from '@lookline/engine'
import { getI18n } from '@/i18n/server'
import { requireUser } from '@/server/auth'
import { clearBag, getBag, removeFromBag, type BagLine } from '@/server/bag'
import { getDb } from '@/server/db'
import { SOURCE_CARD_COOKIE, sanitizeId } from '@/server/imagery'

const FOR_KINDS: readonly PurchaseFor[] = ['self', 'other', 'undisclosed']

function readForKind(value: FormDataEntryValue | null): PurchaseFor {
  return typeof value === 'string' && (FOR_KINDS as readonly string[]).includes(value)
    ? (value as PurchaseFor)
    : 'undisclosed'
}

function readLabel(value: FormDataEntryValue | null): string | null {
  const s = typeof value === 'string' ? value.trim().slice(0, 60) : ''
  return s ? s : null
}

/**
 * `<form action={placeOrderAction}>` on `/checkout`.
 * Fields: `forKind` (self | other | undisclosed), `forLabel` (optional, "partner", "dad"…),
 * `sourceCardId`, `intentSessionId` (optional hidden attribution ids).
 * Writes one purchase per bag line through the engine, clears the bag and redirects
 * to `/checkout/done?orders=<ids>`.
 */
export async function placeOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser('/checkout')
  const [{ t }, lines] = await Promise.all([getI18n(), getBag()])
  if (lines.length === 0) redirect('/bag')

  const forKind = readForKind(formData.get('forKind'))
  const forLabel = forKind === 'other' ? readLabel(formData.get('forLabel')) : null
  const sourceCardId = sanitizeId(formData.get('sourceCardId'))
  const intentSessionId = sanitizeId(formData.get('intentSessionId'))

  const orderIds: string[] = []
  const purchased: BagLine[] = []
  const fulfilment: Array<{
    purchaseId: string
    articleId: string
    unitPrice: number
    quantity: number
    size: string | null
  }> = []
  let failure: string | null = null
  try {
    for (const line of lines) {
      const purchase = await recordPurchase(getDb().db, {
        userId: user.id,
        articleId: line.articleId,
        quantity: line.qty,
        size: line.size,
        forKind,
        forLabel,
        sourceCardId,
        intentSessionId,
      })
      orderIds.push(purchase.id)
      purchased.push(line)
      fulfilment.push({
        purchaseId: purchase.id,
        articleId: purchase.articleId,
        // The price snapshotted on the line decides the credits, not today's catalogue price.
        unitPrice: purchase.price,
        quantity: purchase.quantity,
        size: purchase.size,
      })
    }
  } catch (error) {
    console.warn('[purchase] recordPurchase failed', error)
    failure = t.bag.errors.orderFailed
  }

  // Wardrobe and credits for whatever did go through. Keyed by purchase id, so a retried or
  // partially completed order can be finished by running this again without granting twice.
  if (fulfilment.length > 0) {
    try {
      await fulfilPurchaseLines(getDb().db, user.id, fulfilment)
    } catch (error) {
      // The order stands; the entitlements can be granted again from the same purchase ids.
      console.warn('[purchase] fulfilment deferred', error)
    }
  }

  const query = new URLSearchParams()
  if (failure && orderIds.length === 0) {
    query.set('error', failure)
    redirect(`/checkout?${query.toString()}`)
  }

  if (failure) {
    // Partial success: keep the unpurchased lines in the bag.
    for (const line of purchased) await removeFromBag(line.articleId, line.size)
  } else {
    await clearBag()
  }
  const store = await cookies()
  store.delete(SOURCE_CARD_COOKIE)
  revalidatePath('/', 'layout')

  query.set('orders', orderIds.join(','))
  if (failure) query.set('error', failure)
  redirect(`/checkout/done?${query.toString()}`)
}
