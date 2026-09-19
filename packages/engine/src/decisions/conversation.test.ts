import { describe, expect, it, vi } from 'vitest'
import { SEARCH_FACETS } from '@lookline/catalog'
import {
  conversationBaseline,
  conversationPlan,
  conversationSchema,
  resolveConversationFilters,
  type ConversationEvent,
} from './conversation'
import { filterQuestions } from './filters'

const message = (id: string, role: 'user' | 'assistant', text: string): ConversationEvent => ({
  kind: 'message',
  id,
  role,
  text,
  status: 'complete',
})
describe('conversation filter contract', () => {
  it('preserves roles, corrections and manual events in one request without hint questions', async () => {
    const events: ConversationEvent[] = [
      message('1', 'user', '外套，三千以下'),
      message('2', 'assistant', '推薦黑色羊毛外套。'),
      { kind: 'filters', id: '3', values: { colorFamilies: ['blue'] }, cleared: [] },
      message('4', 'user', '不要羊毛，改亞麻的，兩千以下'),
    ]
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      expect(request.state.events).toEqual(events)
      expect(Object.keys(request.questions).some((key) => key.startsWith('hint:'))).toBe(false)
      expect(request.questions['materials:linen'].instructions).toContain(
        'Concrete assistant recommendations',
      )
      const selections: Record<string, string> = {
        'categoryGroups:outerwear': 'include',
        'materials:linen': 'include',
        'materials:wool': 'exclude',
        'colorFamilies:blue': 'include',
        'colorFamilies:operation': 'replace',
        budget: 'budget_1',
      }
      return Response.json({
        model: 'jev-test',
        answers: Object.fromEntries(
          Object.entries(request.questions).map(([key, question]) => {
            const q = question as { type: string; criteria: Record<string, string> }
            if (q.type === 'noul') return [key, { type: 'noul', noul: 0 }]
            const choice =
              selections[key] ??
              (key.includes(':') && !key.endsWith(':operation') ? 'neutral' : 'keep')
            return [
              key,
              {
                type: 'choice',
                choice,
                confidence: 1,
                probabilities: Object.fromEntries(
                  Object.keys(q.criteria).map((v) => [v, v === choice ? 1 : 0]),
                ),
              },
            ]
          }),
        ),
      })
    })
    const result = await resolveConversationFilters({}, events, { apiKey: 'test', fetch: fetcher })
    expect(result.filters).toMatchObject({
      categoryGroups: ['outerwear'],
      materials: ['linen'],
      excludedMaterials: ['wool'],
      colorFamilies: ['blue'],
      priceMax: 2000,
    })
    expect(result.hints).toEqual([])
    expect(result.unresolved).toEqual([])
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('replays only changed manual fields, including explicit clears', () => {
    expect(
      conversationBaseline({ priceMax: 3000, colorFamilies: ['black'] }, [
        { kind: 'filters', id: 'm', values: { materials: ['linen'] }, cleared: ['colorFamilies'] },
      ]),
    ).toEqual({ priceMax: 3000, materials: ['linen'] })
  })
  it('includes later lexical attributes beyond the old single-sentence cap', () => {
    const values = SEARCH_FACETS.filter((f) => f.decision === 'lexical')
      .flatMap((f) => f.values.map((v) => ({ key: f.key, value: v.slug })))
      .slice(0, 24)
    const events = values.map((v, i) => message(String(i), 'user', v.value))
    const { plan } = conversationPlan({}, events)
    expect(plan.candidates.length).toBeGreaterThan(16)
    expect(plan.questions[`${values[23]!.key}:${values[23]!.value}`]).toBeDefined()
  })
  it('retains current lexical values so referential rejection is decidable', () => {
    const { plan } = conversationPlan({ materials: ['wool'] }, [
      message('1', 'user', '不要這種材質'),
    ])
    expect(plan.questions['materials:wool']).toBeDefined()
    expect(filterQuestions('不要這種材質').candidates).toEqual([])
  })
  it('rejects oversized history, duplicated identities and contradictory edits explicitly', () => {
    expect(conversationSchema.safeParse([message('1', 'user', '衣'.repeat(9000))]).success).toBe(
      false,
    )
    expect(
      conversationSchema.safeParse([message('1', 'user', 'a'), message('1', 'assistant', 'b')])
        .success,
    ).toBe(false)
    expect(
      conversationSchema.safeParse([
        { kind: 'filters', id: '1', values: { priceMax: 3000 }, cleared: ['priceMax'] },
      ]).success,
    ).toBe(false)
    const text = SEARCH_FACETS.filter((f) => f.decision === 'lexical')
      .flatMap((f) => f.values.map((v) => v.slug))
      .join(', ')
    expect(() => conversationPlan({}, [message('1', 'user', text)])).toThrow('too many')
  })
})
