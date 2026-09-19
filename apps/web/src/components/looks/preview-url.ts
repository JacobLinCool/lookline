const MAX_PREVIEW_PRODUCTS = 8

export function previewHref(input: {
  productIds?: readonly number[]
  sourceLookId?: string | null
}): string {
  const params = new URLSearchParams()
  const ids = [...new Set(input.productIds ?? [])]
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_PREVIEW_PRODUCTS)
  if (ids.length > 0) params.set('products', ids.join(','))
  if (input.sourceLookId) params.set('look', input.sourceLookId)
  const query = params.toString()
  return `/previews/new${query ? `?${query}` : ''}`
}
