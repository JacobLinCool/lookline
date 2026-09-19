import { count, products } from '@lookline/db'
import { getDb } from '@/server/db'

export const dynamic = 'force-dynamic'

/** `GET /api/health` → `{ ok, db, products }`. `ok` is the web process; `db` the database. */
export async function GET(): Promise<Response> {
  let db = false
  let productCount = 0
  try {
    const [row] = await getDb().db.select({ n: count() }).from(products)
    productCount = row?.n ?? 0
    db = true
  } catch (error) {
    console.warn('[lookline] health: database check failed', error)
  }
  return Response.json(
    { ok: true, db, products: productCount },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
