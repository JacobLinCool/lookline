'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSessionUser, safeNextPath } from '@/server/auth'
import { after } from 'next/server'
import { recordFeedbackFor } from './feedback'
import type { ActionResult } from '@/components/latency/instant-form'
import { addManyToBag, addToBag, clearBag, removeFromBag, setBagQty } from '@/server/bag'
import {
  INTENT_SESSION_COOKIE,
  SOURCE_ASK_COOKIE,
  SOURCE_LOOK_COOKIE,
  sanitizeId,
} from '@/server/looks'

const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 7

/**
 * Remembers where a bag line came from (Look / Ask / intent turn) so `/checkout` can attribute the
 * purchase (`sourceLookId`, `sourceAskId`, `intentSessionId`). Later sources overwrite earlier ones.
 */
async function rememberAttribution(formData: FormData): Promise<void> {
  const pairs: Array<[string, string | null]> = [
    [SOURCE_LOOK_COOKIE, sanitizeId(formData.get('sourceLook'))],
    [SOURCE_ASK_COOKIE, sanitizeId(formData.get('sourceAsk'))],
    [INTENT_SESSION_COOKIE, sanitizeId(formData.get('intentSession'))],
  ]
  if (!pairs.some(([, v]) => v)) return
  const store = await cookies()
  for (const [name, value] of pairs) {
    if (!value) continue
    store.set(name, value, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ATTRIBUTION_MAX_AGE,
    })
  }
}

function readInt(value: FormDataEntryValue | null): number | null {
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

function readSize(value: FormDataEntryValue | null): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s ? s : null
}

function finish(formData: FormData): void {
  revalidatePath('/', 'layout')
  const to = formData.get('redirect')
  if (typeof to === 'string' && to) redirect(safeNextPath(to, '/bag'))
}

/**
 * Fields: `productId` (int), `size` (optional), `qty` (optional int), `redirect` (optional path),
 * and optional attribution ids `sourceLook`, `sourceAsk`, `intentSession` (stored in cookies for
 * `/checkout`).
 */
export async function addToBagAction(formData: FormData): Promise<ActionResult> {
  const productId = readInt(formData.get('productId'))
  if (productId === null || productId <= 0) return { ok: false, message: 'Choose a product.' }
  const result = await addToBag({
    productId,
    size: readSize(formData.get('size')),
    qty: readInt(formData.get('qty')) ?? 1,
  })
  if (!result.ok)
    return {
      ok: false,
      message:
        result.reason === 'full'
          ? 'Your bag is full (20 pieces). Remove a piece and retry.'
          : 'Choose a valid size and quantity.',
    }
  await rememberAttribution(formData)
  const user = await getSessionUser()
  if (user)
    after(() =>
      recordFeedbackFor(user.id, {
        kind: 'add_to_bag',
        productId,
        lookId: sanitizeId(formData.get('sourceLook')),
        intentSessionId: sanitizeId(formData.get('intentSession')),
      }).then(() => {}),
    )
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Fields: `productId`, `size` (optional; omit to drop every size of the product), `redirect`. */
export async function removeFromBagAction(formData: FormData): Promise<void> {
  const productId = readInt(formData.get('productId'))
  if (productId === null) return
  const size = formData.has('size') ? readSize(formData.get('size')) : undefined
  await removeFromBag(productId, size)
  finish(formData)
}

/** Fields: `productId`, `size`, `qty` (0 removes), `redirect`. */
export async function setBagQtyAction(formData: FormData): Promise<void> {
  const productId = readInt(formData.get('productId'))
  const qty = readInt(formData.get('qty'))
  if (productId === null || qty === null) return
  await setBagQty(productId, readSize(formData.get('size')), qty)
  finish(formData)
}

/** Fields: `redirect` (optional). */
export async function clearBagAction(formData: FormData): Promise<void> {
  await clearBag()
  finish(formData)
}

/** Outfit additions share one cookie commit and the same attribution path as single pieces. */
export async function addOutfitToBagAction(formData: FormData): Promise<ActionResult> {
  const ids = [...new Set(formData.getAll('productId').map(Number))]
  if (!ids.length || ids.length > 12 || ids.some((id) => !Number.isInteger(id) || id <= 0))
    return { ok: false, message: 'Choose up to 12 available pieces.' }
  const result = await addManyToBag(ids.map((productId) => ({ productId })))
  if (!result.ok)
    return { ok: false, message: 'Your bag has no room for this outfit. Remove a piece and retry.' }
  await rememberAttribution(formData)
  const user = await getSessionUser()
  const intentSessionId = sanitizeId(formData.get('intentSession'))
  if (user)
    after(async () => {
      for (const productId of ids)
        await recordFeedbackFor(user.id, { kind: 'add_to_bag', productId, intentSessionId })
    })
  revalidatePath('/', 'layout')
  return { ok: true }
}
