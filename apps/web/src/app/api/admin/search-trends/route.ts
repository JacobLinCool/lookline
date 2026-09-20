import {
  ANALYZE_TIMEOUT_MS,
  createLlmClient,
  currentHomeTrend,
  fetchSearchTrends,
  listSearchTrends,
  readSearchTrends,
  replaceSearchTrends,
  searchProducts,
  setHomeTrend,
} from '@lookline/engine'
import { getMessages } from '@/i18n/server'
import { getDb } from '@/server/db'

/**
 * `GET /api/admin/search-trends` → the current batch and the reading the home page is showing.
 * `POST` → fetch today's list, read it as a style, publish the reading. One action, no choosing:
 * the list is evidence for an operator, not a menu.
 *
 * Unlike the other lab routes this one writes something every visitor sees, so it is the one place
 * here that asks for a secret. `ADMIN_TOKEN` unset leaves it open, which is how local development
 * and a demo machine run; set it in production and the lab sends it as `x-admin-token`.
 */
const headers = { 'Cache-Control': 'no-store' }

/** Not `getLlm()`: that client caps text calls at the shopper-facing budget this one must exceed. */
let analyst: ReturnType<typeof createLlmClient> | null = null
const getAnalyst = () => (analyst ??= createLlmClient({ textTimeoutMs: ANALYZE_TIMEOUT_MS }))

function unauthorized(request: Request): boolean {
  const expected = process.env.ADMIN_TOKEN
  return Boolean(expected) && request.headers.get('x-admin-token') !== expected
}

export async function GET() {
  const { errors } = (await getMessages()).ui
  try {
    const { db } = getDb()
    const [trends, home] = await Promise.all([listSearchTrends(db), currentHomeTrend(db)])
    return Response.json({ trends, home }, { headers })
  } catch (error) {
    console.error('[admin] search-trends list failed', error)
    return Response.json({ error: errors.searchTrendsUnavailable }, { status: 503, headers })
  }
}

export async function POST(request: Request) {
  const { errors } = (await getMessages()).ui
  if (unauthorized(request))
    return Response.json({ error: errors.labToken }, { status: 401, headers })
  try {
    const { db } = getDb()
    const llm = getAnalyst()
    // No directions is a real answer — a list of names and lottery numbers has no mood to dress.
    // No provider at all is a different answer and must not be reported as one, or an operator
    // reads a setup gap as the filter having done its work.
    if (llm.provider === 'offline')
      return Response.json({ error: errors.textModelMissing }, { status: 503, headers })

    const trends = await fetchSearchTrends('TW', request.signal)
    await replaceSearchTrends(db, trends)
    const directions = await readSearchTrends(trends, { llm, signal: request.signal })

    // Nobody vets these by hand, so the catalogue decides: a reading is published only if it finds
    // pieces, and the first one that does wins. A model writes a plausible phrase whether or not
    // anything is stocked under it, and an unchecked reading is an empty row on the home page.
    let published: ((typeof directions)[number] & { matches: number }) | null = null
    for (const direction of directions) {
      const { total } = await searchProducts(db, { q: direction.styleQuery, pageSize: 1 })
      if (total > 0) {
        published = { ...direction, matches: total }
        break
      }
    }
    await setHomeTrend(db, published)

    const [rows, home] = await Promise.all([listSearchTrends(db), currentHomeTrend(db)])
    return Response.json({ trends: rows, home }, { headers })
  } catch (error) {
    console.error('[admin] search-trends refresh failed', error)
    return Response.json({ error: errors.searchTrendsUnavailable }, { status: 503, headers })
  }
}
