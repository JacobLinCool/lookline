import { describe, expect, it } from 'vitest'
import { planAcceptedFriendships } from './simulate'

describe('canonical social simulation', () => {
  it('creates only explicit accepted friendships with ordered unique endpoints', () => {
    const at = new Date('2026-09-20T00:00:00Z')
    const rows = planAcceptedFriendships(['sim_u_3', 'sim_u_1', 'sim_u_2', 'sim_u_4'], at)
    expect(rows).toHaveLength(6)
    expect(new Set(rows.map((row) => `${row.lowUserId}:${row.highUserId}`))).toHaveLength(6)
    for (const row of rows) {
      expect(row.lowUserId < row.highUserId).toBe(true)
      expect(row.state).toBe('accepted')
      expect(row.updatedAt).toBe(at)
    }
  })

  it('does not invent self edges for a two-person network', () => {
    const rows = planAcceptedFriendships(['sim_u_1', 'sim_u_2'], new Date())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ lowUserId: 'sim_u_1', highUserId: 'sim_u_2' })
  })
})
