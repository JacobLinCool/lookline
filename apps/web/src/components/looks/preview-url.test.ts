import { describe, expect, it } from 'vitest'
import { previewHref } from './preview-url'

describe('previewHref', () => {
  it('keeps unique valid articles in order and caps the preview', () => {
    const ids = ['0000000004', '0000000002', '0000000004', '4', '0000000008', '0000000009']
    expect(previewHref({ articleIds: ids })).toBe(
      '/previews/new?articles=0000000004%2C0000000002%2C0000000008%2C0000000009',
    )
  })

  it('links an exact source Look separately from catalog articles', () => {
    expect(previewHref({ sourceLookId: 'lk_shared' })).toBe('/previews/new?look=lk_shared')
  })
})
