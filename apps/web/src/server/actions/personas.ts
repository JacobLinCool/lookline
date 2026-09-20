'use server'

import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { and, eq, personaTransfers, personas, users } from '@lookline/db'
import {
  acceptTransfer,
  cancelTransfer,
  createPersona,
  offerTransfer,
  transferPreview,
} from '@lookline/engine'
import type { ActionResult } from '@/components/latency/instant-form'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { readPersonaPhoto, replacePersonaPhoto } from '@/server/personas'

/** An offer is good for a week; after that the recipient has to be asked again. */
const OFFER_TTL_MS = 7 * 24 * 3_600_000

const name = (value: FormDataEntryValue | null): string =>
  typeof value === 'string' ? value.trim().slice(0, 40) : ''

/**
 * A persona belongs to exactly one account at a time and every action below re-reads that from the
 * database rather than trusting the form, because a transfer may have landed since the page
 * rendered.
 */
async function ownedPersona(personaId: string, userId: string) {
  const [row] = await getDb().db.select().from(personas).where(eq(personas.id, personaId)).limit(1)
  return row && row.ownerUserId === userId ? row : null
}

export async function createPersonaAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/me/personas')
  const displayName = name(formData.get('displayName'))
  if (!displayName) return { ok: false, message: '請給這位 persona 一個名字。' }
  const kind = formData.get('kind') === 'avatar' ? 'avatar' : 'person'
  const { photo, error } = await readPersonaPhoto(formData.get('photo'))
  if (error) return { ok: false, message: error }

  // The photo is stored under the persona's own id, so it cannot be saved before the persona
  // exists. A failed upload afterwards leaves a persona with no reference rather than no persona:
  // the name is what the studio needs, and the photo can be added from the list at any time.
  const id = `per_${nanoid(12)}`
  await createPersona(getDb().db, {
    id,
    ownerUserId: user.id,
    displayName,
    kind,
    avatarSeed: Math.floor(Math.random() * 1_000_000),
  })
  if (photo) {
    try {
      await replacePersonaPhoto({ id, referencePath: null }, photo)
    } catch (uploadError) {
      console.warn('[personas] could not store the reference photo', uploadError)
      revalidatePath('/me/personas')
      return { ok: false, message: '已建立，但參考照片沒有存起來，請再上傳一次。' }
    }
  }
  revalidatePath('/me/personas')
  return { ok: true }
}

/**
 * Give a persona the photograph its cards are rendered from, or take it away again.
 *
 * This is the one thing that makes a card of a real person look like them: the image model is
 * handed this picture as the subject reference. It is never published — a card carries the
 * rendered artwork, not the photograph — and `remove` is honoured immediately, which is what lets
 * someone withdraw a family member's likeness without deleting the persona or its cards.
 */
export async function setPersonaPhotoAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/me/personas')
  const personaId = String(formData.get('personaId') ?? '')
  const persona = await ownedPersona(personaId, user.id)
  if (!persona) return { ok: false, message: '這位 persona 不是你管理的。' }

  if (formData.get('remove') === 'on') {
    await replacePersonaPhoto(persona, null)
    revalidatePath('/me/personas')
    return { ok: true }
  }

  const { photo, error } = await readPersonaPhoto(formData.get('photo'))
  if (error) return { ok: false, message: error }
  if (!photo) return { ok: false, message: '請選一張照片。' }
  try {
    await replacePersonaPhoto(persona, photo)
  } catch (uploadError) {
    console.warn('[personas] could not store the reference photo', uploadError)
    return { ok: false, message: '照片沒有存起來，請再試一次。' }
  }
  revalidatePath('/me/personas')
  return { ok: true }
}

/**
 * Name and kind. Kind is editable here rather than only at creation because it decides how the
 * card is rendered: a subject marked 真人 is described to the image model as a person whose skin
 * and hair must be kept, which is wrong — and visibly wrong — for a toy, a pet or a drawn
 * character, whose reference photo then gets overridden by an invented human.
 */
export async function renamePersonaAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/me/personas')
  const personaId = String(formData.get('personaId') ?? '')
  const displayName = name(formData.get('displayName'))
  if (!displayName) return { ok: false, message: '請給這位 persona 一個名字。' }
  const persona = await ownedPersona(personaId, user.id)
  if (!persona) return { ok: false, message: '這位 persona 不是你管理的。' }
  const posted = formData.get('kind')
  const kind = posted === 'avatar' ? 'avatar' : posted === 'person' ? 'person' : persona.kind
  // Renaming does not touch cards already issued: their artwork and number are fixed.
  await getDb().db.update(personas).set({ displayName, kind }).where(eq(personas.id, personaId))
  revalidatePath('/me/personas')
  return { ok: true }
}

/**
 * Offer a persona to another registered account. The offer records the persona version it was
 * written against, so anything that changes the persona in the meantime makes it stale rather
 * than letting two owners appear.
 */
export async function offerPersonaAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/me/personas')
  const personaId = String(formData.get('personaId') ?? '')
  const handle = String(formData.get('handle') ?? '')
    .trim()
    .replace(/^@/, '')
  const persona = await ownedPersona(personaId, user.id)
  if (!persona) return { ok: false, message: '這位 persona 不是你管理的。' }
  if (!handle) return { ok: false, message: '要交給誰？請填對方的帳號。' }

  const { db } = getDb()
  const [recipient] = await db.select().from(users).where(eq(users.handle, handle)).limit(1)
  if (!recipient) return { ok: false, message: `找不到帳號 @${handle}。` }
  if (recipient.id === user.id) return { ok: false, message: '這位 persona 已經是你的了。' }

  // Ask for the pending offer, not for the oldest of all of them. Reading every row and taking
  // the first by `createdAt` picked up a cancelled one, let the guard through, and left the
  // insert to fail on the partial unique index — a 500 after transfer, cancel, transfer, transfer.
  const [live] = await db
    .select({ id: personaTransfers.id })
    .from(personaTransfers)
    .where(and(eq(personaTransfers.personaId, personaId), eq(personaTransfers.state, 'pending')))
    .limit(1)
  if (live) return { ok: false, message: '這個 persona 已經有一筆邀請在等待中。' }

  await offerTransfer(db, {
    id: `tr_${nanoid(12)}`,
    personaId,
    fromUserId: user.id,
    toUserId: recipient.id,
    personaVersion: persona.version,
    expiresAt: new Date(Date.now() + OFFER_TTL_MS),
  })
  revalidatePath('/me/personas')
  return { ok: true }
}

export async function acceptPersonaAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/me/personas')
  const transferId = String(formData.get('transferId') ?? '')
  const result = await acceptTransfer(getDb().db, {
    transferId,
    acceptingUserId: user.id,
    now: new Date(),
  })
  revalidatePath('/me/personas')
  revalidatePath('/me')
  if (result.ok) return { ok: true }
  const reason =
    result.reason === 'expired'
      ? '這筆邀請已經過期了。'
      : result.reason === 'wrong-recipient'
        ? '這筆邀請不是給你的。'
        : result.reason === 'stale'
          ? '這位 persona 在邀請送出後有變動，請對方重新送一次。'
          : '這筆邀請已經不是待處理狀態了。'
  return { ok: false, message: reason }
}

export async function cancelPersonaOfferAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/me/personas')
  const transferId = String(formData.get('transferId') ?? '')
  const { db } = getDb()
  const [offer] = await db
    .select()
    .from(personaTransfers)
    .where(eq(personaTransfers.id, transferId))
    .limit(1)
  if (!offer || offer.fromUserId !== user.id) {
    return { ok: false, message: '這筆邀請不是你送出的。' }
  }
  await cancelTransfer(db, { transferId, now: new Date() })
  revalidatePath('/me/personas')
  return { ok: true }
}

/** What an offer will move, shown before it is sent and before it is accepted. */
export async function transferPreviewOf(
  personaId: string,
): Promise<{ cards: number; copies: number }> {
  return transferPreview(getDb().db, personaId)
}
