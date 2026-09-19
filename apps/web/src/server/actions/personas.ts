'use server'

import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { eq, personaTransfers, personas, users } from '@lookline/db'
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
  if (!displayName) return { ok: false, message: 'Give the persona a name.' }
  const kind = formData.get('kind') === 'avatar' ? 'avatar' : 'person'
  await createPersona(getDb().db, {
    id: `per_${nanoid(12)}`,
    ownerUserId: user.id,
    displayName,
    kind,
    avatarSeed: Math.floor(Math.random() * 1_000_000),
  })
  revalidatePath('/me/personas')
  return { ok: true }
}

export async function renamePersonaAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/me/personas')
  const personaId = String(formData.get('personaId') ?? '')
  const displayName = name(formData.get('displayName'))
  if (!displayName) return { ok: false, message: 'Give the persona a name.' }
  if (!(await ownedPersona(personaId, user.id))) {
    return { ok: false, message: 'That persona is not yours to edit.' }
  }
  // Renaming does not touch cards already issued: their artwork and number are fixed.
  await getDb().db.update(personas).set({ displayName }).where(eq(personas.id, personaId))
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
  if (!persona) return { ok: false, message: 'That persona is not yours to transfer.' }
  if (!handle) return { ok: false, message: 'Who should receive it?' }

  const { db } = getDb()
  const [recipient] = await db.select().from(users).where(eq(users.handle, handle)).limit(1)
  if (!recipient) return { ok: false, message: `No account called @${handle}.` }
  if (recipient.id === user.id) return { ok: false, message: 'It is already yours.' }

  const existing = await db
    .select({ id: personaTransfers.id })
    .from(personaTransfers)
    .where(eq(personaTransfers.personaId, personaId))
  if (existing.length > 0) {
    const [live] = await db
      .select({ id: personaTransfers.id, state: personaTransfers.state })
      .from(personaTransfers)
      .where(eq(personaTransfers.personaId, personaId))
      .orderBy(personaTransfers.createdAt)
    if (live?.state === 'pending') {
      return { ok: false, message: 'There is already an offer waiting on this persona.' }
    }
  }

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
      ? 'That offer has expired.'
      : result.reason === 'wrong-recipient'
        ? 'That offer was not made to you.'
        : result.reason === 'stale'
          ? 'The persona changed since the offer was made. Ask for a new one.'
          : 'That offer is no longer open.'
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
    return { ok: false, message: 'That offer is not yours to cancel.' }
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
