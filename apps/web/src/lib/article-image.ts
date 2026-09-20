/**
 * The URL every surface requests an article's photograph from.
 *
 * The version is not decoration. `/api/articles/[id]/image` used to draw a garment silhouette
 * whenever R2 could not produce the photograph, and served it at the photograph's own URL with
 * `max-age=31536000, immutable`. Every browser that opened Lookline against an empty bucket —
 * every laptop this was developed on — holds that drawing for a year and will not revalidate it,
 * so removing the stand-in from the route changed nothing those browsers see: jeans, a strap top
 * and espadrilles all still render as the same black tee. A query string is a new cache key, so
 * bumping this is what actually retires the poisoned entry. Bump it again if the route ever
 * serves something it should not have.
 */
const VERSION = '2'

export function articleImageSrc(articleId: string): string {
  return `/api/articles/${articleId}/image?v=${VERSION}`
}
