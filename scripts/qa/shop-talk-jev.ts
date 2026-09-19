import assert from 'node:assert/strict'
import { loadEnv } from '@lookline/db/node'
import {
  resolveConversationFilters,
  type ConversationEvent,
} from '../../packages/engine/src/decisions/conversation'

loadEnv()
const m = (id: string, role: 'user' | 'assistant', text: string): ConversationEvent => ({
  kind: 'message',
  id,
  role,
  text,
  status: 'complete',
})
const cases = [
  {
    id: 'assistant-recommendation',
    events: [
      m('1', 'user', 'I need a jacket'),
      m('2', 'assistant', 'I recommend a black wool jacket.'),
    ],
    check: (f: Awaited<ReturnType<typeof resolveConversationFilters>>['filters']) => {
      assert.ok(f.colorFamilies?.includes('black'))
      assert.ok(f.materials?.includes('wool'))
    },
  },
  {
    id: 'user-rejection',
    events: [
      m('1', 'user', '我要外套，但是不要黑色'),
      m('2', 'assistant', 'I recommend a black jacket.'),
    ],
    check: (f: Awaited<ReturnType<typeof resolveConversationFilters>>['filters']) => {
      assert.ok(f.excludedColorFamilies?.includes('black'))
      assert.ok(!f.colorFamilies?.includes('black'))
    },
  },
  {
    id: 'question-is-not-recommendation',
    events: [
      m('1', 'user', 'I need a jacket'),
      m('2', 'assistant', 'Would you prefer black or white?'),
    ],
    check: (f: Awaited<ReturnType<typeof resolveConversationFilters>>['filters']) =>
      assert.ok(!f.colorFamilies?.length),
  },
  {
    id: 'referential-answer',
    events: [
      m('1', 'user', 'I need a jacket'),
      m('2', 'assistant', 'Would you prefer black or white?'),
      m('3', 'user', 'the second one'),
    ],
    check: (f: Awaited<ReturnType<typeof resolveConversationFilters>>['filters']) =>
      assert.deepEqual(f.colorFamilies, ['white']),
  },
  {
    id: 'manual-then-correction',
    events: [
      m('1', 'user', '黑色外套，三千以下'),
      {
        kind: 'filters',
        id: '2',
        values: { colorFamilies: ['blue'] },
        cleared: [],
      } as ConversationEvent,
      m('3', 'user', '改白色，兩千以下'),
    ],
    check: (f: Awaited<ReturnType<typeof resolveConversationFilters>>['filters']) => {
      assert.deepEqual(f.colorFamilies, ['white'])
      assert.equal(f.priceMax, 2000)
    },
  },
]
let failures = 0
for (const fixture of cases) {
  try {
    const result = await resolveConversationFilters({}, fixture.events, {
      fetch: async (...args) => {
        const response = await fetch(...args)
        if (process.env.QA_DEBUG) {
          const data = (await response.clone().json()) as { answers?: Record<string, unknown> }
          console.log(
            JSON.stringify({
              id: fixture.id,
              answers: Object.fromEntries(
                Object.entries(data.answers ?? {}).filter(([key]) =>
                  [
                    'colorFamilies:black',
                    'colorFamilies:white',
                    'materials:wool',
                    'categoryGroups:outerwear',
                  ].includes(key),
                ),
              ),
            }),
          )
        }
        return response
      },
    })
    if (process.env.QA_DEBUG) console.log(JSON.stringify({ id: fixture.id, result }))
    fixture.check(result.filters)
    console.log(
      JSON.stringify({
        id: fixture.id,
        passed: true,
        ms: result.latencyMs,
        filters: result.filters,
        unresolved: result.unresolved,
      }),
    )
  } catch (error) {
    failures++
    console.log(
      JSON.stringify({
        id: fixture.id,
        passed: false,
        error: error instanceof Error ? error.message : 'failed',
      }),
    )
  }
}
if (failures) process.exitCode = 1
