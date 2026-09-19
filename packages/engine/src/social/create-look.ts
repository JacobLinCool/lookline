/**
 * `createLook`: looks + look_products (roles from category groups) + look_participants +
 * LOOK_CREATE (and REMIX / INSPIRE for remixes, TOGETHER for shared editions) interactions,
 * lineage (`rootLookId` / `depth`) from the parent, and `aesthetics` / `palette` / `styleVector`
 * from `deriveLookStyle`. Also a `look_create` feedback event per product for the owner.
 */
import {
  eq,
  inArray,
  lookParticipants,
  lookArticles,
  looks,
  articles,
  users,
  type Database,
  type Look,
  type Article,
} from '@lookline/db'
import { findAesthetic } from '@lookline/catalog'
import { deriveLookStyle } from '../looks'
import type { CreateLookInput } from '../types'
import { emitFeedback } from './feedback'
import { newId, newShareToken } from './ids'
import { insertInteraction } from './interactions'
import { inferRoles } from './roles'
import { resolveCreatedAt } from './time'

/** Products in the caller's order, deduplicated; throws when any id is unknown. */
export async function loadProductsInOrder(
  db: Database,
  articleIds: readonly string[],
): Promise<Article[]> {
  const ids = [...new Set(articleIds)]
  if (ids.length === 0) throw new Error('@lookline/engine: createLook needs at least one product')
  const rows = await db.select().from(articles).where(inArray(articles.id, ids))
  const byId = new Map(rows.map((p) => [p.id, p]))
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new Error(`@lookline/engine: unknown product id(s) ${missing.join(', ')}`)
  }
  return ids.map((id) => byId.get(id)!)
}

function defaultTitle(ownerName: string, aesthetics: readonly string[], kind: string): string {
  const lead = aesthetics[0] ? (findAesthetic(aesthetics[0])?.name ?? aesthetics[0]) : null
  const noun = kind === 'together' ? 'together' : kind === 'remix' ? 'remix' : 'edition'
  return lead ? `${ownerName}'s ${lead} ${noun}` : `${ownerName}'s ${noun}`
}

export async function createLook(
  db: Database,
  input: CreateLookInput,
  options: { deferFeedback?: (work: () => Promise<void>) => void } = {},
): Promise<Look> {
  const items = await loadProductsInOrder(db, input.articleIds)
  const [owner] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, input.ownerId))
    .limit(1)
  if (!owner) throw new Error(`@lookline/engine: user ${input.ownerId} not found`)

  const parent = input.parentLookId
    ? (
        await db
          .select({
            id: looks.id,
            ownerId: looks.ownerId,
            rootLookId: looks.rootLookId,
            depth: looks.depth,
          })
          .from(looks)
          .where(eq(looks.id, input.parentLookId))
          .limit(1)
      )[0]
    : undefined
  if (input.parentLookId && !parent) {
    throw new Error(`@lookline/engine: parent look ${input.parentLookId} not found`)
  }

  const createdAt = await resolveCreatedAt(db, input.createdAt)
  const id = newId(input.id)
  const kind = input.kind ?? 'edition'
  const style = deriveLookStyle(items)
  const rootLookId = parent ? (parent.rootLookId ?? parent.id) : id
  const depth = parent ? parent.depth + 1 : 0
  const title = input.title?.trim() || defaultTitle(owner.displayName, style.aesthetics, kind)

  const [look] = await db
    .insert(looks)
    .values({
      id,
      ownerId: input.ownerId,
      kind,
      title,
      stylePreset: input.stylePreset,
      prompt: input.prompt ?? null,
      imagePath: input.imagePath ?? null,
      imageStatus: input.imageStatus ?? (input.imagePath ? 'ready' : 'pending'),
      imageProvider: input.imageProvider ?? null,
      aesthetics: style.aesthetics,
      palette: style.palette,
      styleVector: style.styleVector,
      occasion: input.occasion ?? null,
      parentLookId: parent?.id ?? null,
      rootLookId,
      depth,
      visibility: input.visibility ?? 'link',
      shareToken: newShareToken(input.shareToken),
      createdAt,
    })
    .returning()
  if (!look) throw new Error('@lookline/engine: look was not inserted')

  const roles = inferRoles(items)
  await db.insert(lookArticles).values(
    items.map((p, position) => ({
      lookId: id,
      articleId: p.id,
      role: roles[position] ?? null,
      position,
    })),
  )

  // Participants: explicit list (with source Looks) or ids; Together editions always include the owner.
  const participants = new Map<string, string | null>()
  if (kind === 'together') participants.set(input.ownerId, null)
  for (const p of input.participants ?? []) participants.set(p.userId, p.sourceLookId ?? null)
  for (const userId of input.participantIds ?? []) {
    if (!participants.has(userId)) participants.set(userId, null)
  }
  if (participants.size > 0) {
    await db.insert(lookParticipants).values(
      [...participants.entries()].map(([userId, sourceLookId]) => ({
        lookId: id,
        userId,
        sourceLookId,
      })),
    )
  }

  const articleIds = items.map((p) => p.id)
  await insertInteraction(db, {
    actorUserId: input.ownerId,
    type: 'LOOK_CREATE',
    lookId: id,
    payload: {
      kind,
      articleIds,
      stylePreset: input.stylePreset,
      parentLookId: parent?.id ?? null,
      rootLookId,
      depth,
    },
    createdAt,
  })

  if (kind === 'remix' && parent) {
    await insertInteraction(db, {
      actorUserId: input.ownerId,
      type: 'REMIX',
      targetUserId: parent.ownerId,
      lookId: id,
      payload: { parentLookId: parent.id, rootLookId },
      createdAt,
    })
    await insertInteraction(db, {
      actorUserId: input.ownerId,
      type: 'INSPIRE',
      targetUserId: parent.ownerId,
      lookId: parent.id,
      payload: { childLookId: id, via: 'remix' },
      createdAt,
    })
  }

  if (kind === 'together') {
    const ids = [...participants.keys()]
    const sourceLookIds = Object.fromEntries(participants.entries())
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        await insertInteraction(db, {
          actorUserId: ids[i]!,
          type: 'TOGETHER',
          targetUserId: ids[j]!,
          lookId: id,
          payload: { participantIds: ids, sourceLookIds, occasion: input.occasion ?? null },
          createdAt,
        })
      }
    }
  }

  const feedback = async () => {
    for (const p of items) {
      await emitFeedback(db, {
        userId: input.ownerId,
        kind: 'look_create',
        articleId: p.id,
        lookId: id,
        context: { lookId: id, kind, parentLookId: parent?.id ?? null },
        createdAt,
      })
    }
  }
  if (options.deferFeedback) options.deferFeedback(feedback)
  else await feedback()

  return look
}
