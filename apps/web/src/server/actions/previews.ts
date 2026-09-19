'use server'

import { eq, inArray, products, users } from '@lookline/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getI18n } from '@/i18n/server'
import { requireUser, safeNextPath } from '@/server/auth'
import { getDb } from '@/server/db'
import {
  DEFAULT_STYLE_PRESET,
  loadStoredPhoto,
  MAX_PHOTO_BYTES,
  savePhoto,
  sanitizeId,
  type ReferencePhoto,
} from '@/server/looks'
import { createPreviewDraft } from '@/server/preview-generation'
import { loadPreviewSourceLook } from '@/server/preview-source'

const MAX_PRODUCTS = 8

function readText(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readProductId(value: FormDataEntryValue): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function returnWithError(path: string, message: string): never {
  const url = new URL(path, 'http://lookline.local')
  url.searchParams.set('error', message)
  redirect(`${url.pathname}${url.search}`)
}

async function readUploadedPhoto(
  value: FormDataEntryValue | null,
): Promise<
  { photo: ReferencePhoto; error: null } | { photo: null; error: 'type' | 'size' | null }
> {
  if (!(value instanceof File) || value.size === 0) return { photo: null, error: null }
  if (!value.type.startsWith('image/')) return { photo: null, error: 'type' }
  if (value.size > MAX_PHOTO_BYTES) return { photo: null, error: 'size' }
  return {
    photo: { mimeType: value.type, data: Buffer.from(await value.arrayBuffer()) },
    error: null,
  }
}

/** Creates a private, expiring preview from catalog products without creating an owned Look. */
export async function createPreviewAction(formData: FormData): Promise<void> {
  const back = safeNextPath(formData.get('return'), '/previews/new')
  const [user, { t }] = await Promise.all([requireUser(back), getI18n()])
  let productIds = [
    ...new Set(
      formData
        .getAll('productId')
        .map(readProductId)
        .filter((id): id is number => id !== null),
    ),
  ].slice(0, MAX_PRODUCTS)
  const sourceLookId = sanitizeId(formData.get('sourceLookId'))
  const source = sourceLookId ? await loadPreviewSourceLook(sourceLookId, user.id) : null
  if (sourceLookId && !source) returnWithError(back, t.previews.errors.sourceUnavailable)
  if (source) productIds = source.productIds.slice(0, MAX_PRODUCTS)
  if (productIds.length === 0) returnWithError(back, t.previews.errors.pickPiece)

  const rows = await getDb()
    .db.select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds))
  if (rows.length !== productIds.length) returnWithError(back, t.previews.errors.unknownProducts)

  const uploaded = await readUploadedPhoto(formData.get('photo'))
  if (uploaded.error === 'type') returnWithError(back, t.previews.errors.photoType)
  if (uploaded.error === 'size') returnWithError(back, t.previews.errors.photoSize)

  let referencePhoto = uploaded.photo
  if (uploaded.photo && formData.get('rememberPhoto') === 'on') {
    try {
      const photoPath = await savePhoto(user.id, uploaded.photo)
      await getDb().db.update(users).set({ photoPath }).where(eq(users.id, user.id))
    } catch (error) {
      console.warn('[previews] could not persist the reference photo', error)
    }
  } else if (!uploaded.photo && formData.get('useSavedPhoto') === 'on' && user.photoPath) {
    referencePhoto = await loadStoredPhoto(user.photoPath)
  }
  if (!referencePhoto) returnWithError(back, t.previews.errors.photoRequired)

  let previewId: string | null = null
  try {
    const preview = await createPreviewDraft({
      ownerId: user.id,
      productIds,
      sourceLookId: source?.look.id ?? null,
      stylePreset:
        source?.look.stylePreset ||
        readText(formData.get('stylePreset'), 40) ||
        DEFAULT_STYLE_PRESET,
      title: readText(formData.get('title'), 80) || t.previews.new.defaultTitle,
      occasion: source?.look.occasion || readText(formData.get('occasion'), 80) || null,
      referencePhoto,
    })
    previewId = preview.id
  } catch (error) {
    console.warn('[previews] createPreviewDraft failed', error)
  }
  if (!previewId) returnWithError(back, t.previews.errors.notCreated)

  revalidatePath('/me')
  redirect(`/previews/${previewId}`)
}
