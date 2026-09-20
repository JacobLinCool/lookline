import {
  friendActivity,
  preferences,
  recent,
  searching,
  trending,
} from '@lookline/engine/discovery'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(_request: Request, { params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!['trending', 'searching', 'preferences', 'recent', 'friends'].includes(section))
    return new Response(null, { status: 404 })
  const start = performance.now()
  try {
    const { db } = getDb()
    const signedOut = section === 'trending' || section === 'searching'
    const user = signedOut ? null : await getSessionUser()
    if (!signedOut && !user)
      return Response.json({ error: 'unauthorized' }, { status: 401, headers })
    const data =
      section === 'trending'
        ? await trending(db)
        : section === 'searching'
          ? await searching(db)
          : section === 'preferences'
            ? await preferences(db, user!.id)
            : section === 'recent'
              ? await recent(db, user!.id)
              : await friendActivity(db, user!.id)
    return Response.json(data, {
      headers: {
        ...headers,
        'Server-Timing': `discovery;dur=${(performance.now() - start).toFixed(1)}`,
      },
    })
  } catch (error) {
    console.error('[discovery]', section, error)
    return Response.json({ error: 'unavailable' }, { status: 503, headers })
  }
}
