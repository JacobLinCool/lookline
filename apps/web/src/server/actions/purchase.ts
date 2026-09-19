'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { PurchaseFor } from '@lookline/db'
import { recordPurchase } from '@lookline/engine'
import { requireUser } from '@/server/auth'
import { clearBag, getBag, removeFromBag, type BagLine } from '@/server/bag'
import { getDb } from '@/server/db'
import {
  SOURCE_ASK_COOKIE,
  SOURCE_LOOK_COOKIE,
  describeEngineError,
  sanitizeId,
} from '@/server/looks'

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
 * `sourceLookId`, `sourceAskId`, `intentSessionId` (optional hidden attribution ids).
 * Writes one purchase per bag line through the engine (`recordPurchase` also writes the
 * PURCHASE / BUY_FOR interactions and the purchase feedback event), clears the bag and redirects
 * to `/checkout/done?orders=<ids>`.
 */
export async function placeOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser('/checkout')
  const lines = await getBag()
  if (lines.length === 0) redirect('/bag')

  const forKind = readForKind(formData.get('forKind'))
  const forLabel = forKind === 'other' ? readLabel(formData.get('forLabel')) : null
  const sourceLookId = sanitizeId(formData.get('sourceLookId'))
  const sourceAskId = sanitizeId(formData.get('sourceAskId'))
  const intentSessionId = sanitizeId(formData.get('intentSessionId'))

  const orderIds: string[] = []
  const purchased: BagLine[] = []
  let failure: string | null = null
  try {
    for (const line of lines) {
      const purchase = await recordPurchase(getDb().db, {
        userId: user.id,
        productId: line.productId,
        quantity: line.qty,
        size: line.size,
        forKind,
        forLabel,
        sourceLookId,
        sourceAskId,
        intentSessionId,
      })
      orderIds.push(purchase.id)
      purchased.push(line)
    }
  } catch (error) {
    console.warn('[purchase] recordPurchase failed', error)
    failure = describeEngineError('purchase', error)
  }

  const query = new URLSearchParams()
  if (failure && orderIds.length === 0) {
    query.set('error', failure)
    redirect(`/checkout?${query.toString()}`)
  }

  if (failure) {
    // Partial success: keep the unpurchased lines in the bag.
    for (const line of purchased) await removeFromBag(line.productId, line.size)
  } else {
    await clearBag()
  }
  const store = await cookies()
  store.delete(SOURCE_LOOK_COOKIE)
  store.delete(SOURCE_ASK_COOKIE)
  revalidatePath('/', 'layout')

  query.set('orders', orderIds.join(','))
  if (failure) query.set('error', failure)
  redirect(`/checkout/done?${query.toString()}`)
}
