'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getI18n } from '@/i18n/server'
import { getSessionUser, safeNextPath } from '@/server/auth'
import { and, eq, gt, previewArticles, previews, articles } from '@lookline/db'
import { after } from 'next/server'
import { recordFeedbackFor } from './feedback'
import type { ActionResult } from '@/components/latency/instant-form'
import {
  addManyToBag,
  addToBag,
  BAG_MAX_LINES,
  clearBag,
  removeFromBag,
  setBagQty,
} from '@/server/bag'
import {
  INTENT_SESSION_COOKIE,
  SOURCE_ASK_COOKIE,
  SOURCE_LOOK_COOKIE,
  sanitizeId,
} from '@/server/looks'
import { getDb } from '@/server/db'

const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 7
const OUTFIT_MAX_PIECES = 12

/**
 * Remembers where a bag line came from (Look / Ask / intent turn) so `/checkout` can attribute the
 * purchase (`sourceLookId`, `sourceAskId`, `intentSessionId`). Later sources overwrite earlier ones.
 */
async function rememberAttribution(
  formData: FormData,
  sourceLookOverride?: string | null,
): Promise<void> {
  const pairs: Array<[string, string | null]> = [
    [SOURCE_LOOK_COOKIE, sourceLookOverride ?? sanitizeId(formData.get('sourceLook'))],
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

/** An article id from a form field: ten digits with their leading zeros. */
function readArticleId(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? '')
  return /^\d{10}$/.test(s) ? s : null
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
 * Fields: `articleId` (int), `size` (optional), `qty` (optional int), `redirect` (optional path),
 * and optional attribution ids `sourceLook`, `sourceAsk`, `intentSession` (stored in cookies for
 * `/checkout`).
 */
export async function addToBagAction(formData: FormData): Promise<ActionResult> {
  const { t } = await getI18n()
  const articleId = readArticleId(formData.get('articleId'))
  if (articleId === null) return { ok: false, message: t.bag.errors.chooseProduct }
  const result = await addToBag({
    articleId,
    size: readSize(formData.get('size')),
    qty: readInt(formData.get('qty')) ?? 1,
  })
  if (!result.ok)
    return {
      ok: false,
      message:
        result.reason === 'full' ? t.bag.errors.full(BAG_MAX_LINES) : t.bag.errors.invalidLine,
    }
  await rememberAttribution(formData)
  const user = await getSessionUser()
  if (user)
    after(() =>
      recordFeedbackFor(user.id, {
        kind: 'add_to_bag',
        articleId,
        lookId: sanitizeId(formData.get('sourceLook')),
        intentSessionId: sanitizeId(formData.get('intentSession')),
      }).then(() => {}),
    )
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Fields: `articleId`, `size` (optional; omit to drop every size of the product), `redirect`. */
export async function removeFromBagAction(formData: FormData): Promise<void> {
  const articleId = readArticleId(formData.get('articleId'))
  if (articleId === null) return
  const size = formData.has('size') ? readSize(formData.get('size')) : undefined
  await removeFromBag(articleId, size)
  finish(formData)
}

/** Fields: `articleId`, `size`, `qty` (0 removes), `redirect`. */
export async function setBagQtyAction(formData: FormData): Promise<void> {
  const articleId = readArticleId(formData.get('articleId'))
  const qty = readInt(formData.get('qty'))
  if (articleId === null || qty === null) return
  await setBagQty(articleId, readSize(formData.get('size')), qty)
  finish(formData)
}

/** Fields: `redirect` (optional). */
export async function clearBagAction(formData: FormData): Promise<void> {
  await clearBag()
  finish(formData)
}

/** Outfit additions share one cookie commit and the same attribution path as single pieces. */
export async function addOutfitToBagAction(formData: FormData): Promise<ActionResult> {
  const { t } = await getI18n()
  const ids = [...new Set(formData.getAll('articleId').map(String))].filter((id) =>
    /^\d{10}$/.test(id),
  )
  if (!ids.length || ids.length > OUTFIT_MAX_PIECES)
    return { ok: false, message: t.bag.errors.outfitTooMany(OUTFIT_MAX_PIECES) }
  const result = await addManyToBag(ids.map((articleId) => ({ articleId })))
  if (!result.ok) return { ok: false, message: t.bag.errors.outfitNoRoom }
  await rememberAttribution(formData)
  const user = await getSessionUser()
  const intentSessionId = sanitizeId(formData.get('intentSession'))
  if (user)
    after(async () => {
      for (const articleId of ids)
        await recordFeedbackFor(user.id, { kind: 'add_to_bag', articleId, intentSessionId })
    })
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Adds every currently available product from an owned, active preview in one bag commit. */
export async function addPreviewToBagAction(formData: FormData): Promise<ActionResult> {
  const [{ t }, user] = await Promise.all([getI18n(), getSessionUser()])
  const previewId = sanitizeId(formData.get('previewId'))
  if (!user || !previewId) return { ok: false, message: t.previews.errors.unavailable }
  const { db } = getDb()
  const [preview] = await db
    .select({ sourceLookId: previews.sourceLookId })
    .from(previews)
    .where(
      and(
        eq(previews.id, previewId),
        eq(previews.ownerId, user.id),
        gt(previews.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!preview) return { ok: false, message: t.previews.errors.unavailable }

  const available = await db
    .select({ articleId: previewArticles.articleId })
    .from(previewArticles)
    .innerJoin(articles, eq(previewArticles.articleId, articles.id))
    .where(eq(previewArticles.previewId, previewId))
  const ids = available.map(({ articleId }) => articleId)
  if (ids.length === 0) return { ok: false, message: t.previews.errors.noneAvailable }
  const result = await addManyToBag(ids.map((articleId) => ({ articleId })))
  if (!result.ok) return { ok: false, message: t.previews.errors.bagFull }

  await rememberAttribution(formData, preview.sourceLookId)
  after(async () => {
    for (const articleId of ids)
      await recordFeedbackFor(user.id, {
        kind: 'add_to_bag',
        articleId,
        lookId: preview.sourceLookId,
      })
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}
