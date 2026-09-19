import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  record: vi.fn(),
  interaction: vi.fn(),
  rows: [{ id: '0000000001' }] as { id: string }[],
}))
vi.mock('@/server/auth', () => ({ getSessionUser: async () => mocks.user }))
vi.mock('@lookline/engine', () => ({ recordInteraction: mocks.interaction }))
vi.mock('@lookline/engine/discovery', () => ({ recordArticleView: mocks.record }))
vi.mock('@/server/db', () => ({
  getDb: () => ({
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.rows }) }) }) },
  }),
}))
import { POST } from './route'
const request = (origin = 'https://lookline.test') =>
  new Request('https://lookline.test/api/articles/0000000001/view', {
    method: 'POST',
    headers: { origin },
  })
const params = { params: Promise.resolve({ id: '0000000001' }) }
beforeEach(() => {
  mocks.user = null
  mocks.record.mockClear()
  mocks.interaction.mockClear()
  mocks.rows = [{ id: '0000000001' }]
})
it('does not log anonymous or cross-origin visits', async () => {
  expect((await POST(request(), params)).status).toBe(401)
  mocks.user = { id: 'alice' }
  expect((await POST(request('https://elsewhere.test'), params)).status).toBe(403)
  expect(mocks.record).not.toHaveBeenCalled()
})
it('logs direct detail-page visits for the authenticated viewer only', async () => {
  mocks.user = { id: 'alice' }
  expect((await POST(request(), params)).status).toBe(204)
  expect(mocks.record).toHaveBeenCalledWith(expect.anything(), 'alice', '0000000001')
  expect(mocks.interaction).toHaveBeenCalledWith(expect.anything(), {
    actorUserId: 'alice',
    articleId: '0000000001',
    type: 'VIEW',
  })
})
it('never inserts a missing article into history', async () => {
  mocks.user = { id: 'alice' }
  mocks.rows = []
  expect((await POST(request(), params)).status).toBe(404)
  expect(mocks.record).not.toHaveBeenCalled()
})

it('preserves recommendation attribution on a mounted product visit', async () => {
  mocks.user = { id: 'alice' }
  const req = new Request(
    'https://lookline.test/api/articles/0000000001/view?from=intent-1&pos=2',
    {
      method: 'POST',
      headers: { origin: 'https://lookline.test' },
    },
  )
  expect((await POST(req, params)).status).toBe(204)
  expect(mocks.interaction).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      payload: { intentSessionId: 'intent-1', position: 2 },
    }),
  )
})
