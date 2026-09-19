'use server'

import type { ActionResult } from '@/components/latency/instant-form'
import { createLookDraft } from '@/server/look-generation'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Visibility } from '@lookline/db'
import { and, eq, inArray, interactions, looks, products, users } from '@lookline/db'
import { recordInteraction } from '@lookline/engine'
import { getI18n } from '@/i18n/server'
import type { Messages } from '@/i18n'
import { getSessionUser, requireUser, safeNextPath } from '@/server/auth'
import { getDb } from '@/server/db'
import {
  DEFAULT_STYLE_PRESET,
  SOURCE_LOOK_COOKIE,
  loadStoredPhoto,
  MAX_PHOTO_BYTES,
  sanitizeId,
  savePhoto,
  type ReferencePhoto,
} from '@/server/looks'

const MAX_LOOK_PRODUCTS = 8
const VISIBILITIES: readonly Visibility[] = ['private', 'link', 'public']
const SOURCE_COOKIE_TTL = 30 * 24 * 60 * 60

function readText(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readVisibility(value: FormDataEntryValue | null, fallback: Visibility): Visibility {
  return typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value)
    ? (value as Visibility)
    : fallback
}

function readPresetSlug(value: FormDataEntryValue | null): string {
  const slug = readText(value, 40).toLowerCase()
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : DEFAULT_STYLE_PRESET
}

function readInt(value: FormDataEntryValue | null): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, 'http://lookline.local')
  url.searchParams.set(key, value)
  return `${url.pathname}${url.search}`
}

async function readPhoto(
  value: FormDataEntryValue | null,
  t: Messages,
): Promise<{ photo: ReferencePhoto | null; error: string | null }> {
  if (!(value instanceof File) || value.size === 0) return { photo: null, error: null }
  if (!value.type.startsWith('image/')) {
    return { photo: null, error: t.looks.errors.photoType }
  }
  if (value.size > MAX_PHOTO_BYTES) {
    return { photo: null, error: t.looks.errors.photoSize }
  }
  const data = Buffer.from(await value.arrayBuffer())
  return { photo: { mimeType: value.type, data }, error: null }
}

/**
 * `<form action={createLookAction} encType="multipart/form-data">` on `/looks/new`.
 * Fields: `productId` (repeated checkbox values), `stylePreset` (slug), `occasion`, `title`,
 * `visibility` (private | link | public), `photo` (file, ≤ 15 MB, image/*), `useSavedPhoto` (on),
 * `rememberPhoto` (on), `return` (path to come back to on validation errors).
 */
export async function createLookAction(formData: FormData): Promise<void> {
  const user = await requireUser('/looks/new')
  const { t } = await getI18n()
  const back = safeNextPath(formData.get('return'), '/looks/new')

  const productIds = [
    ...new Set(
      formData
        .getAll('productId')
        .map(readInt)
        .filter((n): n is number => n !== null),
    ),
  ].slice(0, MAX_LOOK_PRODUCTS)
  if (productIds.length === 0) {
    redirect(withParam(back, 'error', t.looks.errors.pickPiece))
  }

  const known = await getDb()
    .db.select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds))
  const knownIds = new Set(known.map((r) => r.id))
  const validIds = productIds.filter((id) => knownIds.has(id))
  if (validIds.length === 0) {
    redirect(withParam(back, 'error', t.looks.errors.unknownProducts))
  }

  const stylePreset = readPresetSlug(formData.get('stylePreset'))
  const occasion = readText(formData.get('occasion'), 80) || null
  const title = readText(formData.get('title'), 80) || t.looks.titles.edition(user.displayName)
  const visibility = readVisibility(formData.get('visibility'), 'link')
  const rememberPhoto = formData.get('rememberPhoto') === 'on'
  const useSavedPhoto = formData.get('useSavedPhoto') === 'on'

  const { photo, error: photoError } = await readPhoto(formData.get('photo'), t)
  if (photoError) redirect(withParam(back, 'error', photoError))

  let referencePhoto: ReferencePhoto | null = photo
  if (photo && rememberPhoto) {
    try {
      const photoPath = await savePhoto(user.id, photo)
      await getDb().db.update(users).set({ photoPath }).where(eq(users.id, user.id))
    } catch (error) {
      console.warn('[looks] could not persist the owner photo', error)
    }
  } else if (!photo && useSavedPhoto && user.photoPath) {
    referencePhoto = await loadStoredPhoto(user.photoPath)
  }

  let lookId: string | null = null
  try {
    const look = await createLookDraft({
      ownerId: user.id,
      productIds: validIds,
      stylePreset,
      title,
      occasion,
      visibility,
      kind: 'edition',
      referencePhoto,
    })
    lookId = look.id
  } catch (error) {
    console.warn('[looks] createLookDraft failed', error)
  }
  if (!lookId) redirect(withParam(back, 'error', t.looks.errors.notCreated))

  revalidatePath('/me')
  redirect(`/looks/${lookId}`)
}

export interface ShareLookResult {
  ok: boolean
  /** Same-origin share path (`/l/<token>`); the client prefixes `location.origin`. */
  path: string | null
  /** Whether a SHARE interaction was written (false for signed-out visitors or engine stubs). */
  recorded: boolean
  reason?: string
}

/** Records a SHARE interaction for the signed-in visitor and returns the `/l/<token>` path. */
export async function shareLookAction(lookId: string): Promise<ShareLookResult> {
  const id = sanitizeId(lookId)
  if (!id) return { ok: false, path: null, recorded: false, reason: 'invalid' }
  const user = await getSessionUser()
  const [look] = await getDb()
    .db.select({
      ownerId: looks.ownerId,
      visibility: looks.visibility,
      shareToken: looks.shareToken,
    })
    .from(looks)
    .where(eq(looks.id, id))
    .limit(1)
  if (!look) return { ok: false, path: null, recorded: false, reason: 'not_found' }
  const isOwner = user?.id === look.ownerId
  if (!isOwner && look.visibility === 'private') {
    return { ok: false, path: null, recorded: false, reason: 'private' }
  }
  const path = `/l/${look.shareToken}`
  if (!user) return { ok: true, path, recorded: false, reason: 'anonymous' }
  try {
    await recordInteraction(getDb().db, {
      actorUserId: user.id,
      type: 'SHARE',
      lookId: id,
      targetUserId: isOwner ? null : look.ownerId,
      payload: { channel: 'link' },
    })
    return { ok: true, path, recorded: true }
  } catch (error) {
    console.warn('[looks] SHARE interaction failed', error)
    return { ok: true, path, recorded: false, reason: 'engine' }
  }
}

/** `<form action={reactToLookAction}>` with hidden `lookId`. One REACT per user per Look. */
export async function reactToLookAction(formData: FormData): Promise<ActionResult> {
  const { t } = await getI18n()
  const id = sanitizeId(formData.get('lookId'))
  if (!id) return { ok: false, message: t.looks.errors.unavailable }
  const user = await getSessionUser()
  if (!user) return { ok: false, message: t.looks.errors.signInToReact }
  const { db } = getDb()
  const [look] = await db
    .select({ ownerId: looks.ownerId, visibility: looks.visibility })
    .from(looks)
    .where(eq(looks.id, id))
    .limit(1)
  if (!look || look.ownerId === user.id) return { ok: false, message: t.looks.errors.cannotReact }
  if (look.visibility === 'private') return { ok: false, message: t.looks.errors.private }

  const [existing] = await db
    .select({ id: interactions.id })
    .from(interactions)
    .where(
      and(
        eq(interactions.actorUserId, user.id),
        eq(interactions.lookId, id),
        eq(interactions.type, 'REACT'),
      ),
    )
    .limit(1)
  if (existing) return { ok: true }

  let failure: string | null = null
  try {
    await recordInteraction(db, {
      actorUserId: user.id,
      type: 'REACT',
      lookId: id,
      targetUserId: look.ownerId,
    })
  } catch (error) {
    console.warn('[looks] REACT interaction failed', error)
    failure = t.looks.errors.reactionNotSaved
  }
  revalidatePath(`/looks/${id}`)
  return failure ? { ok: false, message: failure } : { ok: true }
}

/** Owner only. `<form action={setLookVisibilityAction}>` with `lookId` and `visibility`. */
export async function setLookVisibilityAction(formData: FormData): Promise<void> {
  const id = sanitizeId(formData.get('lookId'))
  if (!id) redirect('/')
  const [user, { t }] = await Promise.all([requireUser(`/looks/${id}`), getI18n()])
  const visibility = readVisibility(formData.get('visibility'), 'link')
  const [updated] = await getDb()
    .db.update(looks)
    .set({ visibility })
    .where(and(eq(looks.id, id), eq(looks.ownerId, user.id)))
    .returning({ id: looks.id })
  revalidatePath(`/looks/${id}`)
  redirect(
    withParam(
      `/looks/${id}`,
      updated ? 'notice' : 'error',
      updated ? 'visibility' : t.looks.errors.ownerOnlyVisibility,
    ),
  )
}

/** Remember a Look as the purchase source without adding anything (e.g. before browsing). */
export async function rememberSourceLookAction(formData: FormData): Promise<void> {
  const lookId = sanitizeId(formData.get('lookId'))
  const to = safeNextPath(formData.get('redirect'), '/shop')
  if (lookId) {
    const store = await cookies()
    store.set({
      name: SOURCE_LOOK_COOKIE,
      value: lookId,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SOURCE_COOKIE_TTL,
    })
  }
  redirect(to)
}
