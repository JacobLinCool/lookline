import { eq, articles } from '@lookline/db'
import { getDb } from '@/server/db'
import { getStorage, isSafeKey } from '@/server/storage'

const IMMUTABLE = 'public, max-age=31536000, immutable'

/**
 * `GET /api/articles/[id]/image` — the article's photograph out of R2, or 404.
 *
 * There is deliberately no drawn stand-in. One used to be rendered here whenever the bucket could
 * not produce the photograph, and it was served at the photograph's own URL with
 * `max-age=31536000, immutable`: a browser that had once run against the empty local bucket cached
 * a silhouette for a year, and pointing the dev server at the real bucket afterwards changed
 * nothing it would re-request. A catalogue of 105k photographs should never answer with a drawing.
 *
 * Callers know which articles have one — `articles.image_path` is null for the 440 that H&M never
 * photographed — so `ProductImage` renders its empty tonal ground instead of requesting this.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  // H&M article ids are ten digits with the leading zeros kept; parsing one as a number drops
  // them and the lookup silently misses.
  if (!/^\d{10}$/.test(id)) return new Response('Not found', { status: 404 })

  const [row] = await getDb()
    .db.select({ imagePath: articles.imagePath })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1)
  if (!row?.imagePath || !isSafeKey(row.imagePath))
    return new Response('Not found', { status: 404 })

  const object = await getStorage().get(row.imagePath)
  // A miss here is the bucket failing to serve something the catalogue says it holds. It must not
  // be cached: the next request is the one that might succeed.
  if (!object)
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })

  return new Response(object.body, {
    headers: {
      'content-type': object.contentType || 'image/webp',
      'cache-control': IMMUTABLE,
      etag: object.etag,
    },
  })
}
