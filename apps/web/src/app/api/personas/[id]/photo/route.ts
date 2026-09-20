import { and, eq, personas } from '@lookline/db'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { sanitizeId } from '@/server/imagery'
import { storedImageResponse } from '@/server/storage'

/**
 * A persona's reference photograph, shown back to whoever manages it so they can see which
 * picture their cards are being rendered from.
 *
 * Strictly private. This is a photograph of a real person, often not the account holder, and
 * nothing else in the product ever serves it: a card carries the rendered artwork. Anyone who
 * does not manage this persona gets a 404, not a 403, so the id is not confirmed either.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = sanitizeId((await context.params).id)
  const user = await getSessionUser()
  if (!id || !user) return new Response('Not found', { status: 404 })

  const [persona] = await getDb()
    .db.select({ referencePath: personas.referencePath })
    .from(personas)
    .where(and(eq(personas.id, id), eq(personas.ownerUserId, user.id)))
    .limit(1)
  if (!persona) return new Response('Not found', { status: 404 })

  const photo = await storedImageResponse(request, persona.referencePath, 'private, no-store')
  return photo ?? new Response('Not found', { status: 404 })
}
