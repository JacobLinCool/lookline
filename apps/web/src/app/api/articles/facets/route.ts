import { findSearchFacet } from '@lookline/catalog'
import { countFacet } from '@lookline/engine'
import { parseProductSearch, type RawSearchParams } from '@/components/shop/query'
import { getMessages } from '@/i18n/server'
import { getDb } from '@/server/db'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/articles/facets?facet=<SEARCH_FACETS id>&<the /shop search params>` →
 * `{ facet, values: [{ key, count }, …] }`: the values one construction facet holds across the
 * rows the search matches, most common first. The search itself counts only the category,
 * colour and style facets; a shopper opening a rail row pays for that row's count here, once,
 * with the same rows-read cost as the search total (see `facetCountsSql` in the engine).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const facet = findSearchFacet(url.searchParams.get('facet') ?? '')
  const { errors } = (await getMessages()).ui
  if (!facet) return Response.json({ error: errors.invalidRequest }, { status: 400 })
  const raw: RawSearchParams = {}
  for (const key of new Set(url.searchParams.keys())) {
    if (key === 'facet') continue
    const values = url.searchParams.getAll(key)
    raw[key] = values.length > 1 ? values : values[0]
  }
  const query = parseProductSearch(raw)
  try {
    const values = await countFacet(getDb().db, query, facet.id)
    // A facet's counts are the catalogue's own, not the reader's: cacheable like the search.
    return Response.json(
      { facet: facet.id, values },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[api/articles/facets] countFacet failed', message)
    return Response.json(
      { error: errors.productsUnavailable },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
