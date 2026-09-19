import { searchProducts } from '@lookline/engine'
import { parseProductSearch, type RawSearchParams } from '@/components/shop/query'
import { getMessages } from '@/i18n/server'
import { getDb } from '@/server/db'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/articles/search?q=&keywords=&department=&category=&subcategory=&brandId=&priceMin=&priceMax=&sort=&page=&pageSize=`
 * plus every `SEARCH_FACETS` pair (`categoryGroups=&excludedCategoryGroups=&sleeves=&excludedSleeves=&details=…`,
 * repeatable) → `{ items, total, page, pageSize, facets }` (the engine's `ProductSearchResult`).
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
      { error: (await getMessages()).ui.errors.productsUnavailable },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
