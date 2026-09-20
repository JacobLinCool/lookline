import { and, cardSessions, eq } from '@lookline/db'
import { MAX_CANDIDATES_PER_SESSION } from '@lookline/engine'
import { getSessionUser } from '@/server/auth'
import { studioProgress } from '@/server/card-generation'
import { getDb } from '@/server/db'
import { sanitizeId } from '@/server/imagery'

const headers = { 'Cache-Control': 'private, no-store' }

/**
 * What the studio page polls while a candidate is being rendered.
 *
 * A render takes tens of seconds, so the page cannot learn about it from the server action that
 * started it. This is the session's own owner asking how far along it is: which candidates exist,
 * how many are still coming, and — once nothing is running — why a slot came back empty.
 *
 * Private, like the candidates themselves: anyone else gets a 404 rather than being told the
 * session id is real.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = sanitizeId((await context.params).id)
  const user = await getSessionUser()
  if (!id || !user) return new Response('Not found', { status: 404 })

  const [session] = await getDb()
    .db.select({ state: cardSessions.state })
    .from(cardSessions)
    .where(and(eq(cardSessions.id, id), eq(cardSessions.ownerUserId, user.id)))
    .limit(1)
  if (!session) return new Response('Not found', { status: 404 })

  const progress = await studioProgress(id)
  return Response.json(
    { ...progress, max: MAX_CANDIDATES_PER_SESSION, settled: session.state !== 'open' },
    { headers },
  )
}
