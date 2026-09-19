import { describe, expect, it } from 'vitest'
import { previewHref } from './preview-url'

describe('previewHref', () => {
  it('keeps unique valid products in order and caps the preview', () => {
    expect(previewHref({ productIds: [4, 2, 4, -1, 8, 9, 10, 11, 12, 13, 14] })).toBe(
      '/previews/new?products=4%2C2%2C8%2C9%2C10%2C11%2C12%2C13',
    )
  })

  it('links an exact source Look separately from catalog products', () => {
    expect(previewHref({ sourceLookId: 'lk_shared' })).toBe('/previews/new?look=lk_shared')
  })
})
