import { describe, expect, it } from 'vitest'
import { canReadPreviewSourceCard } from './preview-source'

const card = {
  visibility: 'private' as const,
  authorUserId: 'author',
  holderUserId: 'holder',
}

describe('Card preview source permissions', () => {
  it('allows the author and current holder to use a private Card snapshot', () => {
    expect(canReadPreviewSourceCard(card, 'author')).toBe(true)
    expect(canReadPreviewSourceCard(card, 'holder')).toBe(true)
  })

  it('allows link/public Cards and rejects unrelated viewers of private Cards', () => {
    expect(canReadPreviewSourceCard(card, 'stranger')).toBe(false)
    expect(canReadPreviewSourceCard({ ...card, visibility: 'link' }, 'stranger')).toBe(true)
    expect(canReadPreviewSourceCard({ ...card, visibility: 'public' }, 'stranger')).toBe(true)
  })
})
