import { renderProductSvg } from '@lookline/catalog'
import { brands, eq, products } from '@lookline/db'
import { getDb } from '@/server/db'
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

/** `GET /api/products/[id]/image` — deterministic product artwork, cached forever. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  const productId = Number(id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return new Response('Not found', { status: 404 })
  }

  const [row] = await getDb()
    .db.select({ product: products, brandName: brands.name })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .where(eq(products.id, productId))
    .limit(1)
  if (!row) return new Response('Not found', { status: 404 })

  const { product, brandName } = row
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
    console.warn(`[lookline] renderProductSvg failed for product ${productId}`, error)
    return svgResponse(placeholderSvg(product.name, brandName), {
      status: 500,
      cacheControl: 'no-store',
    })
  }
}
