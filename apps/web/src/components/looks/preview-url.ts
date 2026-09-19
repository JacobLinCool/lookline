const MAX_PREVIEW_ARTICLES = 8

export function previewHref(input: {
  articleIds?: readonly string[]
  sourceLookId?: string | null
}): string {
  const params = new URLSearchParams()
  const ids = [...new Set(input.articleIds ?? [])]
    .filter((id) => /^\d{10}$/.test(id))
    .slice(0, MAX_PREVIEW_ARTICLES)
  if (ids.length > 0) params.set('articles', ids.join(','))
  if (input.sourceLookId) params.set('look', input.sourceLookId)
  const query = params.toString()
  return `/previews/new${query ? `?${query}` : ''}`
}
