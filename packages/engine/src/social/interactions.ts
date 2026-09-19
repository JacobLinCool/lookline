import { interactions, type Database, type Interaction } from '@lookline/db'
import type { InteractionInput } from '../types'
import { newId } from './ids'
import { resolveCreatedAt } from './time'

/** Insert one interaction row. `id` / `createdAt` overrides keep the simulation deterministic. */
export async function recordInteraction(
  db: Database,
  input: InteractionInput,
): Promise<Interaction> {
  const createdAt = await resolveCreatedAt(db, input.createdAt)
  const [row] = await db
    .insert(interactions)
    .values({
      id: newId(input.id),
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId ?? null,
      lookId: input.lookId ?? null,
      articleId: input.articleId ?? null,
      type: input.type,
      payload: input.payload ?? {},
      sourceInteractionId: input.sourceInteractionId ?? null,
      createdAt,
    })
    .returning()
  if (!row) throw new Error(`@lookline/engine: interaction ${input.type} was not inserted`)
  return row
}

/** Same as `recordInteraction` but with the timestamp already resolved (batch writes). */
export async function insertInteraction(
  db: Database,
  input: InteractionInput & { createdAt: Date },
): Promise<Interaction> {
  return recordInteraction(db, input)
}
