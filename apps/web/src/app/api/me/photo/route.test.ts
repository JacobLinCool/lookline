import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage, setStorage } from '@/server/storage'

const auth = vi.hoisted(() => ({ user: null as null | { id: string; photoPath: string | null } }))
vi.mock('@/server/auth', () => ({ getSessionUser: async () => auth.user }))

import { GET } from './route'

describe('GET /api/me/photo', () => {
  const storage = memoryStorage()

  beforeEach(() => setStorage(storage))
  afterEach(() => {
    auth.user = null
    setStorage(null)
  })

  it('requires a signed-in user', async () => {
    const response = await GET()
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('returns 404 when the user has no saved photo', async () => {
    auth.user = { id: 'user-1', photoPath: null }
    expect((await GET()).status).toBe(404)
  })

  it('streams only the signed-in user photo without caching it', async () => {
    await storage.put('photos/user-1.jpg', 'photo-bytes', 'image/jpeg')
    auth.user = { id: 'user-1', photoPath: 'photos/user-1.jpg' }

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('photo-bytes')
  })
})
