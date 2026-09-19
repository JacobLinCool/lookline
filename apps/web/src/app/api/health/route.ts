import { count, articles } from '@lookline/db'
import { getLlm } from '@lookline/engine'
import { getDb } from '@/server/db'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/health` → `{ ok, db, articles, llm }`. `ok` is the web process; `db` the database;
 * `llm` the text/image providers in use (`offline` when no key is configured).
 */
export async function GET(): Promise<Response> {
  let db = false
  let productCount = 0
  try {
    const [row] = await getDb().db.select({ n: count() }).from(articles)
    productCount = row?.n ?? 0
    db = true
  } catch (error) {
    console.warn('[lookline] health: database check failed', error)
  }
  const llm = getLlm()
  return Response.json(
    {
      ok: true,
      db,
      articles: productCount,
      llm: { provider: llm.provider, textModel: llm.textModel, imageModel: llm.imageModel },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
