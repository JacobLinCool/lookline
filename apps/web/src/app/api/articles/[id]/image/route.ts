import { renderProductSvg } from '@lookline/catalog'
import { brands, eq, articles } from '@lookline/db'
import { getDb } from '@/server/db'
import { getStorage, isSafeKey } from '@/server/storage'
import { escapeXml, svgResponse } from '@/server/svg'

const IMMUTABLE = 'public, max-age=31536000, immutable'

function placeholderSvg(name: string, brandName: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="#edeae3"/>
  <rect x="150" y="200" width="300" height="400" fill="none" stroke="#141311" stroke-width="1.5"/>
  <text x="300" y="640" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#141311">${escapeXml(name)}</text>
  <text x="300" y="672" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="3" fill="#6f6b63">${escapeXml(brandName.toUpperCase())}</text>
</svg>`
}

/** `GET /api/articles/[id]/image` — deterministic product artwork, cached forever. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  // H&M article ids are ten digits with the leading zeros kept; parsing one as a number drops
  // them and the lookup silently misses.
  if (!/^\d{10}$/.test(id)) return new Response('Not found', { status: 404 })

  const [row] = await getDb()
    .db.select({ product: articles, brandName: brands.name })
    .from(articles)
    .innerJoin(brands, eq(articles.brandId, brands.id))
    .where(eq(articles.id, id))
    .limit(1)
  if (!row) return new Response('Not found', { status: 404 })

  const { product, brandName } = row

  // The real photograph when the catalogue has one (105 100 of 105 542 articles do); the drawn
  // silhouette is the fallback for the rest.
  if (product.imagePath && isSafeKey(product.imagePath)) {
    const object = await getStorage().get(product.imagePath)
    if (object) {
      return new Response(object.body, {
        headers: {
          'content-type': object.contentType || 'image/webp',
          'cache-control': IMMUTABLE,
          etag: object.etag,
        },
      })
    }
  }

  try {
    const svg = renderProductSvg({
      silhouetteId: product.silhouetteId,
      colorHex: product.colorHex,
      secondaryColorHex: product.secondaryColorHex,
      pattern: product.pattern,
      aesthetics: product.aesthetics,
      imageSeed: product.imageSeed,
      categoryGroup: product.categoryGroup,
      name: product.name,
      brandName,
    })
    return svgResponse(svg, { cacheControl: IMMUTABLE })
  } catch (error) {
    console.warn(`[lookline] renderProductSvg failed for article ${id}`, error)
    return svgResponse(placeholderSvg(product.name, brandName), {
      status: 500,
      cacheControl: 'no-store',
    })
  }
}
