'use server'

import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  and,
  cardSessions,
  cards,
  collectionEditions,
  collectionInvites,
  collectionMembers,
  collections,
  eq,
  inArray,
  personaTransfers,
  personas,
} from '@lookline/db'
import {
  addCollectionMember,
  issueEdition,
  membersOf,
  openSession,
  releaseCredit,
  reserveCredit,
  settleCredit,
  verificationCode,
} from '@lookline/engine'
import type { ActionResult } from '@/components/latency/instant-form'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

const SESSION_TTL_MS = 3_600_000
// A `'use server'` module may only export async functions, so these stay private to it.
/** Two personas minimum: one is a personal card, not a collection. */
const MIN_MEMBERS = 2
/** What the renderer lays out legibly. */
const MAX_MEMBERS = 6

/**
 * Personas with a transfer offer still open. A copy is bound to a persona the moment an edition is
 * issued, so minting one mid-handover would leave it ambiguous whose it is — the server says so
 * rather than picking a side.
 */
async function personasMidTransfer(
  db: ReturnType<typeof getDb>['db'],
  personaIds: readonly string[],
): Promise<Set<string>> {
  if (personaIds.length === 0) return new Set()
  const rows = await db
    .select({ personaId: personaTransfers.personaId })
    .from(personaTransfers)
    .where(
      and(
        inArray(personaTransfers.personaId, [...personaIds]),
        eq(personaTransfers.state, 'pending'),
      ),
    )
  return new Set(rows.map((r) => r.personaId))
}

/**
 * Create a collection from already-issued personal cards (#37). Grouping costs no credit — only
 * issuing an edition from it does.
 *
 * A card may only be contributed by whoever manages its persona right now, so nobody can quietly
 * pull a friend's latest card into a collection. Within one account that means its own personas
 * can all be added at once; across accounts each side adds its own.
 */
export async function createCollectionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const title =
    String(formData.get('title') ?? '')
      .trim()
      .slice(0, 60) || '未命名收藏'
  const cardIds = formData.getAll('cardId').map(String).filter(Boolean)
  // One card is enough to start: the second participant may be a friend who has yet to accept.
  // Two personas are still required to issue, which is where the credit is actually spent.
  if (cardIds.length < 1) redirect('/collections?error=min')
  if (cardIds.length > MAX_MEMBERS) redirect('/collections?error=max')

  // Every card must belong to a persona this account manages, and each persona may bring one.
  const rows = await db
    .select({ cardId: cards.id, personaId: cards.personaId, owner: personas.ownerUserId })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(inArray(cards.id, cardIds))
  const mine = rows.filter((r) => r.owner === user.id)
  const byPersona = new Map(mine.map((r) => [r.personaId, r.cardId]))
  if (byPersona.size < 1) redirect('/collections?error=unauthorised')

  const collectionId = `col_${nanoid(12)}`
  await db.insert(collections).values({ id: collectionId, ownerUserId: user.id, title })
  for (const [personaId, cardId] of byPersona) {
    await addCollectionMember(db, { collectionId, personaId, cardId })
  }
  revalidatePath('/collections')
  redirect(`/collections/${collectionId}`)
}

/**
 * Start an edition: one credit from whoever presses it, however many personas take part. The
 * others contribute their cards, not their credits.
 */
export async function startEditionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const collectionId = String(formData.get('collectionId') ?? '')

  const members = await membersOf(db, collectionId)
  if (members.length < MIN_MEMBERS) redirect(`/collections/${collectionId}?error=min`)

  // Anyone taking part may issue — checked by persona ownership, not by who created the group.
  const owners = await db
    .select({ personaId: personas.id, owner: personas.ownerUserId })
    .from(personas)
    .where(
      inArray(
        personas.id,
        members.map((m) => m.personaId),
      ),
    )
  if (!owners.some((o) => o.owner === user.id)) {
    redirect(`/collections/${collectionId}?error=participant`)
  }

  const moving = await personasMidTransfer(
    db,
    members.map((m) => m.personaId),
  )
  if (moving.size > 0) redirect(`/collections/${collectionId}?error=transfer`)

  const sessionId = `cs_${nanoid(12)}`
  const reserved = await reserveCredit(db, {
    id: `led_${sessionId}`,
    ownerUserId: user.id,
    sessionId,
    operationKey: `reserve:${sessionId}`,
  })
  if (!reserved) redirect(`/collections/${collectionId}?error=credits`)

  // The artwork has to keep each persona with their own clothes, so the session freezes the
  // member cards' pieces tagged by wearer. Taken from the cards, which never change, rather than
  // from the wardrobe: a card issued last month still shows what it was made from.
  const sourceCards = await db
    .select({ personaId: cards.personaId, snapshot: cards.articleSnapshot })
    .from(cards)
    .where(
      inArray(
        cards.id,
        members.map((m) => m.cardId),
      ),
    )
  const worn = sourceCards.flatMap((c) =>
    (c.snapshot ?? []).map((a) => ({ ...a, personaId: c.personaId })),
  )

  // The session's persona is the issuer's own; the edition's copies follow the members.
  const own = owners.find((o) => o.owner === user.id)!
  try {
    await openSession(db, {
      id: sessionId,
      ownerUserId: user.id,
      personaId: own.personaId,
      collectionId,
      reserveOperationKey: `reserve:${sessionId}`,
      articles: worn,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
  } catch (error) {
    console.warn('[collections] session could not be opened, releasing the credit', error)
    await releaseCredit(db, {
      id: `led_release_${sessionId}`,
      ownerUserId: user.id,
      sessionId,
      operationKey: `release:${sessionId}`,
    })
    redirect(`/collections/${collectionId}?error=session`)
  }
  revalidatePath(`/collections/${collectionId}`)
  redirect(`/collections/${collectionId}/issue/${sessionId}`)
}

/**
 * Settle the edition: one artwork, one numbered copy per participating persona. The member list,
 * their order and N are fixed here — editing the collection afterwards changes nothing already
 * issued, and issuing again costs a new credit and makes a separate edition.
 */
export async function settleEditionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const posted = String(formData.get('collectionId') ?? '')
  const sessionId = String(formData.get('sessionId') ?? '')
  const candidateId = String(formData.get('candidateId') ?? '')

  const [session] = await db
    .select()
    .from(cardSessions)
    .where(and(eq(cardSessions.id, sessionId), eq(cardSessions.ownerUserId, user.id)))
    .limit(1)
  if (!session) redirect(`/collections/${posted}?error=session`)
  // The collection comes from the session, which `startEditionAction` checked participation
  // against. Taking it from the form would let a crafted post spend this session on a group the
  // issuer never took part in, and mint copies for its personas.
  const collectionId = session.collectionId
  if (!collectionId) redirect(`/collections/${posted}?error=session`)

  // A resubmitted issue lands on the edition that already exists rather than minting a second.
  const [existing] = await db
    .select({ id: collectionEditions.id })
    .from(collectionEditions)
    .where(eq(collectionEditions.sessionId, sessionId))
    .limit(1)
  if (existing) redirect(`/editions/${existing.id}`)

  const members = await membersOf(db, collectionId)
  const editionId = `ed_${nanoid(12)}`
  const result = await issueEdition(db, {
    editionId,
    collectionId,
    sessionId,
    imagePath: candidateId,
    copies: members.map((m) => ({
      id: `cp_${nanoid(12)}`,
      personaId: m.personaId,
      verificationCode: verificationCode(),
    })),
    now: new Date(),
  })
  if (!result.ok) redirect(`/collections/${collectionId}?error=min`)

  await settleCredit(db, {
    id: `led_settle_${sessionId}`,
    ownerUserId: user.id,
    sessionId,
    operationKey: `settle:${sessionId}`,
  })
  revalidatePath('/me')
  revalidatePath('/collections')
  redirect(`/editions/${editionId}`)
}

/**
 * Ask a friend's persona to take part. The invite carries no card: which one that persona brings
 * is its manager's decision, made when they accept. That is what stops a collection from quietly
 * taking someone's latest or private card.
 */
export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const collectionId = String(formData.get('collectionId') ?? '')
  const personaId = String(formData.get('personaId') ?? '')

  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.ownerUserId, user.id)))
    .limit(1)
  if (!collection) return { ok: false, message: '這個收藏不是你的。' }

  const [persona] = await db.select().from(personas).where(eq(personas.id, personaId)).limit(1)
  if (!persona) return { ok: false, message: '找不到那位 persona。' }
  if (persona.ownerUserId === user.id) {
    return { ok: false, message: '你自己的 persona 直接加入就好，不需要邀請。' }
  }

  const taken = await db
    .select({ personaId: collectionMembers.personaId })
    .from(collectionMembers)
    .where(eq(collectionMembers.collectionId, collectionId))
  if (taken.length >= MAX_MEMBERS) return { ok: false, message: `一個收藏最多 ${MAX_MEMBERS} 位。` }
  if (taken.some((t) => t.personaId === personaId)) {
    return { ok: false, message: '那位 persona 已經在這個收藏裡了。' }
  }

  // Re-inviting after a decline is allowed; the primary key means it replaces rather than piles up.
  await db
    .insert(collectionInvites)
    .values({ collectionId, personaId, invitedByUserId: user.id, state: 'pending' })
    .onConflictDoUpdate({
      target: [collectionInvites.collectionId, collectionInvites.personaId],
      set: { state: 'pending', invitedByUserId: user.id, respondedAt: null },
    })
  revalidatePath(`/collections/${collectionId}`)
  return { ok: true }
}

/**
 * Answer an invite. Accepting joins with a card of the invitee's own choosing — checked to be an
 * issued card of that very persona, so accepting cannot smuggle in someone else's.
 */
export async function respondToInviteAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const collectionId = String(formData.get('collectionId') ?? '')
  const personaId = String(formData.get('personaId') ?? '')
  const accept = String(formData.get('accept') ?? '') === 'yes'
  const cardId = String(formData.get('cardId') ?? '')

  const [persona] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, personaId), eq(personas.ownerUserId, user.id)))
    .limit(1)
  if (!persona) return { ok: false, message: '那位 persona 不是你管理的。' }

  const [invite] = await db
    .select()
    .from(collectionInvites)
    .where(
      and(
        eq(collectionInvites.collectionId, collectionId),
        eq(collectionInvites.personaId, personaId),
      ),
    )
    .limit(1)
  if (!invite || invite.state !== 'pending') return { ok: false, message: '這個邀請已經處理過了。' }

  if (!accept) {
    await db
      .update(collectionInvites)
      .set({ state: 'declined', respondedAt: new Date() })
      .where(
        and(
          eq(collectionInvites.collectionId, collectionId),
          eq(collectionInvites.personaId, personaId),
        ),
      )
    revalidatePath('/collections')
    return { ok: true }
  }

  if ((await personasMidTransfer(db, [personaId])).size > 0) {
    return { ok: false, message: '這位 persona 正在轉讓中，請先完成或收回轉讓再加入。' }
  }

  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.personaId, personaId)))
    .limit(1)
  if (!card) return { ok: false, message: '請選一張這位 persona 的卡。' }

  const members = await membersOf(db, collectionId)
  if (members.length >= MAX_MEMBERS)
    return { ok: false, message: `這個收藏已經滿 ${MAX_MEMBERS} 位。` }

  await addCollectionMember(db, { collectionId, personaId, cardId })
  await db
    .update(collectionInvites)
    .set({ state: 'accepted', respondedAt: new Date() })
    .where(
      and(
        eq(collectionInvites.collectionId, collectionId),
        eq(collectionInvites.personaId, personaId),
      ),
    )
  revalidatePath('/collections')
  revalidatePath(`/collections/${collectionId}`)
  return { ok: true }
}

/** Remove a member while the collection is still being put together. */
export async function removeMemberAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const collectionId = String(formData.get('collectionId') ?? '')
  const personaId = String(formData.get('personaId') ?? '')
  const [persona] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, personaId), eq(personas.ownerUserId, user.id)))
    .limit(1)
  if (!persona) return { ok: false, message: '那位 persona 不是你管理的。' }
  await db
    .delete(collectionMembers)
    .where(
      and(
        eq(collectionMembers.collectionId, collectionId),
        eq(collectionMembers.personaId, personaId),
      ),
    )
  revalidatePath(`/collections/${collectionId}`)
  return { ok: true }
}
