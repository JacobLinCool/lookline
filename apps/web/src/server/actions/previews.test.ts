import { beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'

const mocks = vi.hoisted(() => ({ savePhoto: vi.fn(), createDraft: vi.fn(), update: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(path)
  },
}))
vi.mock('@/i18n/server', () => ({ getI18n: async () => ({ t: en }) }))
vi.mock('@/server/auth', () => ({
  requireUser: async () => ({ id: 'owner', photoPath: null }),
  safeNextPath: () => '/previews/new',
}))
vi.mock('@/server/db', () => ({
  getDb: () => ({
    db: {
      select: () => ({ from: () => ({ where: async () => [{ id: 1 }] }) }),
      update: mocks.update,
    },
  }),
}))
vi.mock('@/server/looks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/looks')>()),
  savePhoto: mocks.savePhoto,
}))
vi.mock('@/server/preview-generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/preview-generation')>()),
  createPreviewDraft: mocks.createDraft,
}))

import { createPreviewAction } from './previews'

describe('preview reference validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['image/gif', 'image/avif', 'image/svg+xml'])(
    'rejects %s before remembering a photo',
    async (type) => {
      const form = new FormData()
      form.set('articleId', '0108775015')
      form.set('photo', new File(['unsupported'], 'photo', { type }))
      form.set('rememberPhoto', 'on')

      const query = new URLSearchParams({ error: en.previews.errors.photoType })
      await expect(createPreviewAction(form)).rejects.toThrow(`/previews/new?${query}`)
      expect(mocks.savePhoto).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.createDraft).not.toHaveBeenCalled()
    },
  )
})
