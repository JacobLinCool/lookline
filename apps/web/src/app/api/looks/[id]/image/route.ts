import { getSessionUser } from '@/server/auth'
import { renderLookPosterSvg } from '@lookline/engine'
import { asc, eq, lookArticles, looks, articles, users } from '@lookline/db'
import { hashString } from '@/lib/hash'
import { getDb } from '@/server/db'
import { getStorage, isSafeKey } from '@/server/storage'
import { svgResponse } from '@/server/svg'

/**
 * `GET /api/looks/[id]/image` — the generated image from R2 when the Look has one, otherwise
 * the deterministic composition poster rendered from its articles.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  const { db } = getDb()
  const [row] = await db
    .select({ look: looks, ownerName: users.displayName })
    .from(looks)
    .innerJoin(users, eq(looks.ownerId, users.id))
    .where(eq(looks.id, id))
    .limit(1)
  if (!row) return new Response('Not found', { status: 404 })
  const { look, ownerName } = row
  if (look.visibility === 'private') {
    const viewer = await getSessionUser()
    if (viewer?.id !== look.ownerId) return new Response('Not found', { status: 404 })
  }

  if (look.imagePath && isSafeKey(look.imagePath)) {
    try {
      const object = await getStorage().get(look.imagePath)
      if (object) {
        if (request.headers.get('if-none-match') === object.etag)
          return new Response(null, { status: 304, headers: { ETag: object.etag } })
        return new Response(object.body, {
          headers: {
            'Content-Type': object.contentType,
            'Content-Length': String(object.size),
            ETag: object.etag,
            'Cache-Control': 'private, no-store',
          },
        })
      }
    } catch (error) {
      console.warn(`[lookline] could not read image ${look.imagePath} for look ${look.id}`, error)
    }
  }

  try {
    const items = await db
      .select({ product: articles })
      .from(lookArticles)
      .innerJoin(articles, eq(lookArticles.articleId, articles.id))
      .where(eq(lookArticles.lookId, look.id))
      .orderBy(asc(lookArticles.position))
    const svg = renderLookPosterSvg({
      title: look.title,
      ownerName,
      stylePreset: look.stylePreset,
      articles: items.map(({ product }) => product),
      palette: look.palette,
      aesthetics: look.aesthetics,
      seed: hashString(look.id),
      editionNumber: look.depth + 1,
    })
    return svgResponse(svg, { cacheControl: 'private, no-store' })
  } catch (error) {
    console.warn(`[lookline] renderLookPosterSvg failed for look ${look.id}`, error)
    return new Response('Composition could not be rendered', { status: 500 })
  }
}
