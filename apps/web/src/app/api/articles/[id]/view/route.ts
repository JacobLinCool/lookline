import { articles, eq } from '@lookline/db'
import { recordInteraction } from '@lookline/engine'
import { recordArticleView } from '@lookline/engine/discovery'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response(null, { status: 403, headers })
  const user = await getSessionUser()
  if (!user) return new Response(null, { status: 401, headers })
  const { id } = await params
  if (!/^\d{10}$/.test(id)) return new Response(null, { status: 400, headers })
  const { db } = getDb()
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1)
  if (!article) return new Response(null, { status: 404, headers })
  await recordArticleView(db, user.id, id)
  const query = new URL(request.url).searchParams
  const from = query.get('from')
  const rawPosition = query.get('pos')
  const parsed = rawPosition === null ? null : Number(rawPosition)
  const position = parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
  await recordInteraction(db, {
    actorUserId: user.id,
    articleId: id,
    type: 'VIEW',
    ...(from && from.length <= 100 ? { payload: { intentSessionId: from, position } } : {}),
  })
  return new Response(null, { status: 204, headers })
}
