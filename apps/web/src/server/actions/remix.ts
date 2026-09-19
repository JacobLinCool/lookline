'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { STYLE_PRESETS } from '@lookline/engine'
import {
  attempt,
  ensureInteraction,
  loadLookById,
  loadLookByToken,
  loadProductsByIds,
  loadUser,
} from '@/components/social/data'
import { getI18n } from '@/i18n/server'
import { recordFeedbackFor } from '@/server/actions/feedback'
import { createGuest, getSessionUser, safeNextPath } from '@/server/auth'
import { getDb } from '@/server/db'
import { MAX_PHOTO_BYTES, type ReferencePhoto } from '@/server/looks'
import { createLookDraft } from '@/server/look-generation'

/**
 * Make It Mine and the shared-Look actions that lead into it.
 *
 * reactToLookAction  `<form>` on /l/[token]. Fields: `token`, `displayName?` (guest name when
 *                    signed out). Writes REACT viewer → owner once per viewer.
 * createRemixAction  `<form>` on /looks/[id]/remix. Fields: `sourceLookId`, `forUserId?`,
 *                    `productId` (repeated), `stylePreset`, `title?`, `photo?` (file), `budget?`.
 *                    Creates a `remix` Look for the viewer (redirect → /looks/<newId>), or, with
 *                    `forUserId`, an `edition` owned by that person + a STYLE interaction
 *                    (redirect → the remix page with `?created=<newId>` and the share link).
 */

const MAX_MESSAGE = 160

function text(value: FormDataEntryValue | null, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function ints(values: FormDataEntryValue[]): number[] {
  return [
    ...new Set(
      values.map((v) => Number(v)).filter((n): n is number => Number.isInteger(n) && n > 0),
    ),
  ]
}

function withParams(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

async function readPhoto(
  value: FormDataEntryValue | null,
): Promise<{ photo: ReferencePhoto | null; error: string | null }> {
  if (!(value instanceof File) || value.size === 0) return { photo: null, error: null }
  if (!value.type.startsWith('image/')) return { photo: null, error: 'photoType' }
  if (value.size > MAX_PHOTO_BYTES) return { photo: null, error: 'photoSize' }
  return {
    photo: { mimeType: value.type, data: Buffer.from(await value.arrayBuffer()) },
    error: null,
  }
}

export async function reactToLookAction(formData: FormData): Promise<void> {
  const token = text(formData.get('token'), 128)
  if (!token) redirect('/')
  const back = `/l/${encodeURIComponent(token)}`

  const bundle = await loadLookByToken(token)
  if (!bundle) redirect(back)

  let user = await getSessionUser()
  if (!user) {
    const displayName = text(formData.get('displayName'), 40)
    if (!displayName) redirect(withParams(back, { error: 'name' }))
    user = await createGuest(displayName)
  }

  const result = await ensureInteraction(getDb().db, {
    actorUserId: user.id,
    type: 'REACT',
    targetUserId: bundle.owner.id,
    lookId: bundle.look.id,
    payload: { via: 'share-link', source: 'web' },
  })

  redirect(
    withParams(back, {
      reacted: result.ok ? '1' : null,
      error: result.ok ? null : 'engine',
      message: result.ok ? null : (result.error ?? '').slice(0, MAX_MESSAGE),
    }),
  )
}

export async function createRemixAction(formData: FormData): Promise<void> {
  const sourceLookId = text(formData.get('sourceLookId'), 64)
  if (!sourceLookId) redirect('/')
  const forUserId = text(formData.get('forUserId'), 64) || null
  const budget = text(formData.get('budget'), 12) || null
  const page = withParams(`/looks/${encodeURIComponent(sourceLookId)}/remix`, {
    for: forUserId,
    budget,
  })

  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(page))}`)

  const source = await loadLookById(sourceLookId)
  if (!source) redirect('/')

  const productIds = ints(formData.getAll('productId'))
  if (productIds.length === 0) redirect(withParams(page, { error: 'products' }))
  const found = await loadProductsByIds(productIds)
  if (found.length === 0) redirect(withParams(page, { error: 'products' }))

  const requestedPreset = text(formData.get('stylePreset'), 64)
  const stylePreset =
    STYLE_PRESETS.find((p) => p.slug === requestedPreset)?.slug ??
    (requestedPreset || source.look.stylePreset)
  const { photo, error: photoError } = await readPhoto(formData.get('photo'))
  if (photoError) redirect(withParams(page, { error: photoError }))

  const recipient = forUserId ? await loadUser(forUserId) : null
  if (forUserId && !recipient) redirect(withParams(page, { error: 'recipient' }))

  const { t } = await getI18n()
  const customTitle = text(formData.get('title'), 120)
  const title = recipient
    ? customTitle || t.looks.titles.styledFor(user.displayName, recipient.displayName)
    : customTitle || t.looks.titles.remixOf(user.displayName, source.look.title)

  const created = await attempt(() =>
    createLookDraft({
      ownerId: recipient ? recipient.id : user.id,
      productIds: found.map((p) => p.id),
      stylePreset,
      kind: recipient ? 'edition' : 'remix',
      parentLookId: source.look.id,
      visibility: 'link',
      title,
      occasion: source.look.occasion,
      referencePhoto: photo,
    }),
  )
  if (!created.ok) {
    redirect(withParams(page, { error: 'look', message: created.error.slice(0, MAX_MESSAGE) }))
  }

  if (recipient) {
    // "Style <Owner>": the creator styled the recipient. The engine's createLook records
    // LOOK_CREATE; the person-to-person STYLE edge is ensured here.
    await ensureInteraction(getDb().db, {
      actorUserId: user.id,
      type: 'STYLE',
      targetUserId: recipient.id,
      lookId: created.value.id,
      payload: { sourceLookId: source.look.id, source: 'web' },
    })
    redirect(withParams(page, { created: created.value.id }))
  }

  // Engine 03: one `remix` feedback row per source product — kept or swapped out.
  const kept = new Set(found.map((p) => p.id))
  after(async () => {
    await Promise.all(
      source.products.map((p) =>
        recordFeedbackFor(user.id, {
          kind: 'remix',
          productId: p.id,
          lookId: created.value.id,
          context: { kept: kept.has(p.id), sourceLookId: source.look.id },
        }),
      ),
    )
  })

  redirect(`/looks/${created.value.id}`)
}
