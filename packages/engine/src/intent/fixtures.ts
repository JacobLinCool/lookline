/** Shared fixture context of ENGINE_SPEC §1.10 (test helper, not exported from the barrel). */
import type { IntentContextExt } from './schema'

export const FIXTURE_CTX: IntentContextExt = {
  now: new Date('2026-09-18T01:00:00.000Z'), // 09:00 Asia/Taipei
  user: { department: 'women', budgetHint: null, displayName: 'Demo' },
  contacts: [
    {
      userId: 'u_000002',
      displayName: 'Alice',
      handle: 'alice',
      department: 'women',
      latestCardId: 'lk_alice_01',
    },
    {
      userId: 'u_000003',
      displayName: 'Jacob',
      handle: 'jacob',
      department: 'men',
      latestCardId: 'lk_jacob_01',
    },
  ],
}

export const withUser = (
  department: 'women' | 'men' | 'unisex' | 'kids' | undefined,
): IntentContextExt => ({
  ...FIXTURE_CTX,
  user: department ? { department, budgetHint: null, displayName: 'Demo' } : undefined,
})
