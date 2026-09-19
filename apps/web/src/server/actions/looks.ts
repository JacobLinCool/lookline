'use server'

import type { ActionResult } from '@/components/latency/instant-form'
import { createLookDraft } from '@/server/look-generation'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Visibility } from '@lookline/db'
import { and, eq, inArray, interactions, looks, articles, users } from '@lookline/db'
import { recordInteraction } from '@lookline/engine'
import { getSessionUser, requireUser, safeNextPath } from '@/server/auth'
import { getDb } from '@/server/db'
import {
  DEFAULT_STYLE_PRESET,
  SOURCE_LOOK_COOKIE,
  describeEngineError,
  loadStoredPhoto,
  sanitizeId,
  savePhoto,
  type ReferencePhoto,
} from '@/server/looks'

const MAX_PHOTO_BYTES = 8 * 1024 * 1024
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

function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, 'http://lookline.local')
  url.searchParams.set(key, value)
  return `${url.pathname}${url.search}`
}

async function readPhoto(
  value: FormDataEntryValue | null,
): Promise<{ photo: ReferencePhoto | null; error: string | null }> {
  if (!(value instanceof File) || value.size === 0) return { photo: null, error: null }
  if (!value.type.startsWith('image/')) {
    return { photo: null, error: 'The photo must be an image file.' }
  }
  if (value.size > MAX_PHOTO_BYTES) {
    return { photo: null, error: 'The photo must be 8 MB or smaller.' }
  }
  const data = Buffer.from(await value.arrayBuffer())
  return { photo: { mimeType: value.type, data }, error: null }
}

/**
 * `<form action={createLookAction} encType="multipart/form-data">` on `/looks/new`.
 * Fields: `articleId` (repeated checkbox values), `stylePreset` (slug), `occasion`, `title`,
 * `visibility` (private | link | public), `photo` (file, ≤ 8 MB, image/*), `useSavedPhoto` (on),
 * `rememberPhoto` (on), `return` (path to come back to on validation errors).
 */
export async function createLookAction(formData: FormData): Promise<void> {
  const user = await requireUser('/looks/new')
  const back = safeNextPath(formData.get('return'), '/looks/new')

  const articleIds = [
    ...new Set(
      formData
        .getAll('articleId')
        .map(String)
        .filter((id) => /^\d{10}$/.test(id)),
    ),
  ].slice(0, MAX_LOOK_PRODUCTS)
  if (articleIds.length === 0) {
    redirect(withParam(back, 'error', 'Pick at least one piece to put in the edition.'))
  }

  const known = await getDb()
    .db.select({ id: articles.id })
    .from(articles)
    .where(inArray(articles.id, articleIds))
  const knownIds = new Set(known.map((r) => r.id))
  const validIds = articleIds.filter((id) => knownIds.has(id))
  if (validIds.length === 0) {
    redirect(withParam(back, 'error', 'Those articles are no longer in the catalog.'))
  }

  const stylePreset = readPresetSlug(formData.get('stylePreset'))
  const occasion = readText(formData.get('occasion'), 80) || null
  const title = readText(formData.get('title'), 80) || `${user.displayName} · Edition`
  const visibility = readVisibility(formData.get('visibility'), 'link')
  const rememberPhoto = formData.get('rememberPhoto') === 'on'
  const useSavedPhoto = formData.get('useSavedPhoto') === 'on'

  const { photo, error: photoError } = await readPhoto(formData.get('photo'))
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
  let failure: string | null = null
  try {
    const look = await createLookDraft({
      ownerId: user.id,
      articleIds: validIds,
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
    failure = describeEngineError('look', error)
  }
  if (!lookId) redirect(withParam(back, 'error', failure ?? 'The Look could not be created.'))

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
    return {
      ok: true,
      path,
      recorded: false,
      reason: describeEngineError('reaction', error),
    }
  }
}

/** `<form action={reactToLookAction}>` with hidden `lookId`. One REACT per user per Look. */
export async function reactToLookAction(formData: FormData): Promise<ActionResult> {
  const id = sanitizeId(formData.get('lookId'))
  if (!id) return { ok: false, message: 'This Look is unavailable.' }
  const user = await getSessionUser()
  if (!user) return { ok: false, message: 'Sign in to react.' }
  const { db } = getDb()
  const [look] = await db
    .select({ ownerId: looks.ownerId, visibility: looks.visibility })
    .from(looks)
    .where(eq(looks.id, id))
    .limit(1)
  if (!look || look.ownerId === user.id)
    return { ok: false, message: 'This Look cannot receive your reaction.' }
  if (look.visibility === 'private') return { ok: false, message: 'This Look is private.' }

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
    failure = describeEngineError('reaction', error)
  }
  revalidatePath(`/looks/${id}`)
  return failure ? { ok: false, message: failure } : { ok: true }
}

/** Owner only. `<form action={setLookVisibilityAction}>` with `lookId` and `visibility`. */
export async function setLookVisibilityAction(formData: FormData): Promise<void> {
  const id = sanitizeId(formData.get('lookId'))
  if (!id) redirect('/')
  const user = await requireUser(`/looks/${id}`)
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
      updated ? 'visibility' : 'Only the owner can change visibility.',
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
