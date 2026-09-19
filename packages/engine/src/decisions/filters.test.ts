import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FilterState } from './filters'
import { budgetCandidates, filterQuestions, resolveFilters } from './filters'

afterEach(() => vi.useRealTimers())
function responseFor(
  utterance: string,
  choices: Record<string, string> = {},
  base: FilterState = {},
) {
  return {
    model: 'jev-1.13.0',
    answers: Object.fromEntries(
      Object.entries(filterQuestions(utterance, base).questions).map(([key, question]) => {
        const choice =
          choices[key] ?? (key.includes(':') && !key.endsWith(':operation') ? 'neutral' : 'keep')
        return [
          key,
          {
            type: 'choice',
            choice,
            confidence: 1,
            probabilities: Object.fromEntries(
              Object.keys(question.criteria).map((value) => [value, value === choice ? 1 : 0]),
            ),
          },
        ]
      }),
    ),
  }
}
const utterance = 'black or navy outerwear under TWD 3000, no red'

describe('bounded filter decisions', () => {
  it('preserves OR selections, exclusions and exact numeric candidates through the HTTP contract', async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      expect(request.model).toBe('jev-1.13.0')
      expect(request.questions['colorFamilies:black'].instructions.toLowerCase()).toContain('black')
      expect(request.questions.budget.criteria.budget_0).toContain('TWD 3000')
      return Response.json(
        responseFor(utterance, {
          'colorFamilies:operation': 'replace',
          'categoryGroups:operation': 'replace',
          'colorFamilies:black': 'include',
          'colorFamilies:blue': 'include',
          'colorFamilies:red': 'exclude',
          'categoryGroups:outerwear': 'include',
          budget: 'budget_0',
        }),
      )
    }) satisfies typeof fetch
    const result = await resolveFilters(utterance, {}, { apiKey: 'test', fetch: fetcher })
    expect(result.filters).toMatchObject({
      categoryGroups: ['outerwear'],
      colorFamilies: ['black', 'blue'],
      excludedColorFamilies: ['red'],
      priceMax: 3000,
    })
    expect(result.unresolved).toEqual([])
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('retains a whole uncertain facet instead of applying an arbitrary partial decision', async () => {
    const response = responseFor(
      utterance,
      { 'colorFamilies:blue': 'include', 'colorFamilies:operation': 'replace' },
      { colorFamilies: ['black'] },
    )
    response.answers['colorFamilies:blue']!.confidence = 0.4
    const result = await resolveFilters(
      utterance,
      { colorFamilies: ['black'] },
      { apiKey: 'test', fetch: async () => Response.json(response) },
    )
    expect(result.filters.colorFamilies).toEqual(['black'])
    expect(result.unresolved).toEqual(['colours'])
  })
  it('reconciles additions, replacements, exclusions and clearing without losing unrelated filters', async () => {
    const base: FilterState = {
      colorFamilies: ['black', 'white'],
      excludedColorFamilies: ['red'],
      priceMax: 3000,
    }
    for (const [operation, selections, expected] of [
      [
        'add',
        { 'colorFamilies:blue': 'include' },
        {
          colorFamilies: ['black', 'white', 'blue'],
          excludedColorFamilies: ['red'],
          priceMax: 3000,
        },
      ],
      [
        'replace',
        { 'colorFamilies:red': 'include' },
        { colorFamilies: ['red'], excludedColorFamilies: undefined, priceMax: 3000 },
      ],
      [
        'add',
        { 'colorFamilies:black': 'exclude' },
        { colorFamilies: ['white'], excludedColorFamilies: ['red', 'black'], priceMax: 3000 },
      ],
      ['clear', {}, { priceMax: 3000 }],
    ] as const) {
      const response = responseFor(
        'fixture',
        { 'colorFamilies:operation': operation, ...selections },
        base,
      )
      // An unconfident add/replace distinction cannot obscure a certain exclusion-only request.
      if ('colorFamilies:black' in selections)
        response.answers['colorFamilies:operation']!.confidence = 0.2
      const result = await resolveFilters('fixture', base, {
        apiKey: 'test',
        fetch: async () => Response.json(response),
      })
      expect(result.filters).toEqual(expected)
      expect(result.unresolved).toEqual([])
    }
  })
  it('rejects contradictory base constraints before contacting the provider', async () => {
    const fetcher = vi.fn()
    for (const base of [
      { priceMin: 5000, priceMax: 3000 },
      { colorFamilies: ['black'], excludedColorFamilies: ['black'] },
    ] as FilterState[])
      await expect(
        resolveFilters('black', base, { apiKey: 'test', fetch: fetcher }),
      ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects hallucinated options, missing answers and invalid probability distributions', async () => {
    for (const corrupt of [
      (r: ReturnType<typeof responseFor>) => {
        r.answers.department!.choice = 'alien'
      },
      (r: ReturnType<typeof responseFor>) => {
        delete r.answers.budget
      },
      (r: ReturnType<typeof responseFor>) => {
        r.answers.department!.probabilities.keep = 0.2
      },
    ]) {
      const response = responseFor(utterance)
      corrupt(response)
      await expect(
        resolveFilters(
          utterance,
          {},
          { apiKey: 'test', fetch: async () => Response.json(response) },
        ),
      ).rejects.toThrow(/invalid/)
    }
  })
  it('propagates cancellation and exposes rate limits without calling another provider', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 429 }))
    await expect(resolveFilters(utterance, {}, { apiKey: 'test', fetch: fetcher })).rejects.toThrow(
      '429',
    )
    expect(fetcher).toHaveBeenCalledOnce()
    const cancelled = vi.fn()
    await expect(
      resolveFilters(
        utterance,
        {},
        { apiKey: 'test', fetch: cancelled, signal: AbortSignal.abort() },
      ),
    ).rejects.toThrow()
    expect(cancelled).not.toHaveBeenCalled()
  })
  it('parses bilingual corrections and ranges without discretizing price amounts', () => {
    expect(budgetCandidates('黑色外套，三千以內')).toEqual([{ max: 3000 }])
    expect(budgetCandidates('under NT$5000, actually under NT$3000')).toEqual([
      { max: 5000 },
      { max: 3000 },
    ])
    expect(budgetCandidates('between NT$1250 and NT$2890')).toEqual([{ min: 1250, max: 2890 }])
    expect(budgetCandidates('navy please')).toEqual([])
  })
})
