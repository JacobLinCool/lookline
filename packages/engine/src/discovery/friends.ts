import {
  activitySharing,
  and,
  asc,
  cards,
  desc,
  eq,
  friendships,
  inArray,
  or,
  personas,
  users,
  type Database,
} from '@lookline/db'

const pair = (a: string, b: string) =>
  a < b ? { lowUserId: a, highUserId: b } : { lowUserId: b, highUserId: a }
const pairWhere = (a: string, b: string) => {
  const p = pair(a, b)
  return and(eq(friendships.lowUserId, p.lowUserId), eq(friendships.highUserId, p.highUserId))
}

export async function inviteFriend(db: Database, actor: string, handle: string) {
  const [other] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, handle.replace(/^@/, '').trim()))
    .limit(1)
  if (!other || other.id === actor) return false
  await db
    .insert(friendships)
    .values({ ...pair(actor, other.id), requestedBy: actor })
    .onConflictDoNothing()
  return true
}

export async function respondFriend(
  db: Database,
  actor: string,
  other: string,
  action: 'accept' | 'remove',
) {
  if (action === 'remove') {
    await db.delete(friendships).where(pairWhere(actor, other))
    return
  }
  // Only the recipient can accept; the sender cannot confirm their own invitation.
  await db
    .update(friendships)
    .set({ state: 'accepted', updatedAt: new Date() })
    .where(
      and(
        pairWhere(actor, other),
        eq(friendships.requestedBy, other),
        eq(friendships.state, 'pending'),
      ),
    )
}

export async function friendList(db: Database, actor: string) {
  return db
    .select({
      id: users.id,
      handle: users.handle,
      name: users.displayName,
      state: friendships.state,
      requestedBy: friendships.requestedBy,
    })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(eq(friendships.lowUserId, actor), eq(users.id, friendships.highUserId)),
        and(eq(friendships.highUserId, actor), eq(users.id, friendships.lowUserId)),
      ),
    )
    .where(or(eq(friendships.lowUserId, actor), eq(friendships.highUserId, actor)))
    .orderBy(desc(friendships.updatedAt), asc(users.id))
    .limit(100)
}

export async function setPurchaseSharing(db: Database, actor: string, enabled: boolean) {
  await db
    .insert(activitySharing)
    .values({ userId: actor, purchases: enabled })
    .onConflictDoUpdate({ target: activitySharing.userId, set: { purchases: enabled } })
}

export async function setCardVisibility(
  db: Database,
  actor: string,
  id: string,
  visibility: 'private' | 'link' | 'public',
) {
  // Current ownership is checked inside the mutation; a persona transfer cannot race the check.
  const held = db.select({ id: personas.id }).from(personas).where(eq(personas.ownerUserId, actor))
  await db
    .update(cards)
    .set({ visibility })
    .where(and(eq(cards.id, id), inArray(cards.personaId, held)))
}
