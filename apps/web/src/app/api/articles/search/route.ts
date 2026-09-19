import { searchProducts } from '@lookline/engine'
import { parseProductSearch, type RawSearchParams } from '@/components/shop/query'
import { getDb } from '@/server/db'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/articles/search?q=&department=&categoryGroups=&excludedCategoryGroups=&category=&subcategory=&aesthetics=&aesthetics=&colorFamilies=&excludedColorFamilies=&excludedAesthetics=&brandId=&priceMin=&priceMax=&sort=&page=&pageSize=`
 * → `{ items, total, page, pageSize, facets }` (the engine's `ProductSearchResult`).
 * Same URL contract as `/shop`, for curl demos and client components.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const raw: RawSearchParams = {}
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    raw[key] = values.length > 1 ? values : values[0]
  }
  const query = parseProductSearch(raw)

  try {
    const result = await searchProducts(getDb().db, query)
    return Response.json(
      {
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        facets: result.facets ?? null,
        query,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[api/articles/search] searchProducts failed', message)
    return Response.json(
      { error: 'Products could not be loaded. Please try again.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
