import { asc, eq, previewArticles, articles, users } from '@lookline/db'
import { renderLookPosterSvg } from '@lookline/engine'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { hashString } from '@/lib/hash'
import { getPreviewGeneration } from '@/server/preview-generation'
import { getStorage, isSafeKey } from '@/server/storage'
import { svgResponse } from '@/server/svg'

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const [{ id }, user] = await Promise.all([ctx.params, getSessionUser()])
  const preview = user ? await getPreviewGeneration(id, user.id) : null
  if (!preview) return new Response('Not found', { status: 404 })

  if (preview.imagePath && isSafeKey(preview.imagePath)) {
    const object = await getStorage()
      .get(preview.imagePath)
      .catch(() => null)
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
  }

  const { db } = getDb()
  const [items, owners] = await Promise.all([
    db
      .select({ product: articles })
      .from(previewArticles)
      .innerJoin(articles, eq(previewArticles.articleId, articles.id))
      .where(eq(previewArticles.previewId, preview.id))
      .orderBy(asc(previewArticles.position)),
    db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, preview.ownerId))
      .limit(1),
  ])
  if (!owners[0] || items.length === 0) return new Response('Not found', { status: 404 })
  return svgResponse(
    renderLookPosterSvg({
      title: preview.title,
      ownerName: owners[0].displayName,
      stylePreset: preview.stylePreset,
      articles: items.map(({ product }) => product),
      palette: [],
      aesthetics: [],
      seed: hashString(preview.id),
      editionNumber: 1,
    }),
    { cacheControl: 'private, no-store' },
  )
}
