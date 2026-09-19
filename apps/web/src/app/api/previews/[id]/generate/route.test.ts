import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  read: vi.fn(),
  cancel: vi.fn(),
  queue: vi.fn(),
}))
vi.mock('@/server/auth', () => ({ getSessionUser: async () => mocks.user }))
vi.mock('@/server/preview-generation', () => ({
  readPreviewGeneration: mocks.read,
  cancelPreviewImage: mocks.cancel,
  queuePreviewImage: mocks.queue,
}))

import { DELETE, GET } from './route'

describe('private preview generation route', () => {
  const ctx = { params: Promise.resolve({ id: 'pv_test' }) }

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.user = null
  })

  it('does not read or clean up previews for anonymous requests', async () => {
    const response = await GET(new Request('http://localhost/api/previews/pv_test/generate'), ctx)
    expect(response.status).toBe(404)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('scopes reads to the signed-in user', async () => {
    mocks.user = { id: 'viewer' }
    mocks.read.mockResolvedValue({ preview: null, expired: false })
    const response = await GET(new Request('http://localhost/api/previews/pv_test/generate'), ctx)
    expect(mocks.read).toHaveBeenCalledWith('pv_test', 'viewer')
    expect(response.status).toBe(404)
  })

  it('returns a terminal expiry response with no private caching', async () => {
    mocks.user = { id: 'owner' }
    mocks.read.mockResolvedValue({ preview: null, expired: true })
    const response = await GET(new Request('http://localhost/api/previews/pv_test/generate'), ctx)
    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('returns 404 if the preview disappears during cancellation', async () => {
    mocks.user = { id: 'owner' }
    mocks.read.mockResolvedValue({ preview: { id: 'pv_test', ownerId: 'owner' }, expired: false })
    mocks.cancel.mockResolvedValue(null)
    const response = await DELETE(
      new Request('http://localhost/api/previews/pv_test/generate', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: 'generation' }),
      }),
      ctx,
    )
    expect(mocks.cancel).toHaveBeenCalledWith('pv_test', 'owner', 'generation')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Preview not found.' })
  })
})
