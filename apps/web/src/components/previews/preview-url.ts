const MAX_PREVIEW_ARTICLES = 8

export function parsePreviewArticleIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '')
  return [...new Set(raw.split(/[,\s]+/).filter((id) => /^\d{10}$/.test(id)))]
}

export function previewHref(input: {
  articleIds?: readonly string[]
  sourceCardId?: string | null
}): string {
  const params = new URLSearchParams()
  const ids = [...new Set(input.articleIds ?? [])]
    .filter((id) => /^\d{10}$/.test(id))
    .slice(0, MAX_PREVIEW_ARTICLES)
  if (ids.length > 0) params.set('articles', ids.join(','))
  if (input.sourceCardId) params.set('card', input.sourceCardId)
  const query = params.toString()
  return `/previews/new${query ? `?${query}` : ''}`
}
