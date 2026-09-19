import { ATTRIBUTE_COLUMNS, ATTRIBUTE_SCHEMAS, SUBCATEGORIES } from '@lookline/catalog'
import { describe, expect, it, vi } from 'vitest'
import {
  buildSearchIntentQuestions,
  compileSearchIntent,
  extractSearchCandidates,
  SEARCH_INTENT_ONTOLOGY,
  type SearchIntentQuestion,
} from './search-intent'

type MockAnswer =
  | { type: 'noul'; noul: number }
  | {
      type: 'choice'
      choice: string
      confidence: number
      probabilities: Record<string, number>
    }
  | {
      type: 'score'
      score: number
      confidence: number
      legend: Record<string, string>
      probabilities: Record<string, number>
    }

function answerFor(question: SearchIntentQuestion): MockAnswer {
  if (question.type === 'noul') return { type: 'noul', noul: 0.02 }
  if (question.type === 'choice') {
    const keys = Object.keys(question.criteria)
    const choice = keys[0]!
    return {
      type: 'choice',
      choice,
      confidence: 1,
      probabilities: Object.fromEntries(keys.map((key) => [key, key === choice ? 1 : 0])),
    }
  }
  const middle = Math.floor(question.criteria.length / 2)
  return {
    type: 'score',
    score: middle,
    confidence: 1,
    legend: Object.fromEntries(question.criteria.map((label, index) => [String(index), label])),
    probabilities: Object.fromEntries(
      question.criteria.map((_, index) => [String(index), index === middle ? 1 : 0]),
    ),
  }
}

function responseFor(query: string) {
  const plan = buildSearchIntentQuestions(query)
  return {
    plan,
    response: {
      model: 'jev-test',
      answers: Object.fromEntries(
        Object.entries(plan.questions).map(([id, question]) => [id, answerFor(question)]),
      ) as Record<string, MockAnswer>,
    },
  }
}

function choose(answer: MockAnswer, choice: string, probabilities?: Record<string, number>): void {
  if (answer.type !== 'choice') throw new Error('Expected a choice answer.')
  answer.choice = choice
  answer.probabilities =
    probabilities ??
    Object.fromEntries(
      Object.keys(answer.probabilities).map((key) => [key, key === choice ? 1 : 0]),
    )
}

function noul(answer: MockAnswer, value: number): void {
  if (answer.type !== 'noul') throw new Error('Expected a noul answer.')
  answer.noul = value
}

function score(answer: MockAnswer, probabilities: number[]): void {
  if (answer.type !== 'score') throw new Error('Expected a score answer.')
  answer.probabilities = Object.fromEntries(
    probabilities.map((value, index) => [String(index), value]),
  )
  answer.score = probabilities.reduce((sum, value, index) => sum + index * value, 0)
}

const values = (query: string): string[] =>
  extractSearchCandidates(query).map((candidate) => `${candidate.attribute}:${candidate.value}`)

describe('natural-language search-space compiler', () => {
  it('retrieves explicit bilingual candidates without collapsing family colours to one swatch', () => {
    const candidates = values('我想找冬天通勤穿的，紅色或藍色，不要太厚，看起來俐落一點。')
    expect(candidates).toEqual(
      expect.arrayContaining([
        'season:winter',
        'occasion:work',
        'colorFamily:red',
        'colorFamily:blue',
        'attributes.weight:heavyweight',
      ]),
    )
    expect(candidates).not.toContain('color:crimson')
    expect(values('navy coat')).toEqual(
      expect.arrayContaining(['color:navy', 'colorFamily:blue', 'categoryGroup:outerwear']),
    )
  })

  it('covers every catalog garment type, column value and long-tail schema value', () => {
    expect(SEARCH_INTENT_ONTOLOGY.garmentTypes).toEqual(SUBCATEGORIES.map((row) => row.slug))
    for (const schema of Object.values(ATTRIBUTE_SCHEMAS)) {
      for (const column of ATTRIBUTE_COLUMNS) {
        const definition = schema.columns[column]
        if (!definition) continue
        const expected = [
          ...definition.default.map(([value]) => value),
          ...Object.values(definition.overrides).flatMap((options) =>
            options.map(([value]) => value),
          ),
        ]
        expect(SEARCH_INTENT_ONTOLOGY.predicateValues[column]).toEqual(
          expect.arrayContaining(expected),
        )
      }
      for (const [key, definition] of Object.entries(schema.extras)) {
        const expected = [
          ...definition.default.map(([value]) => value),
          ...Object.values(definition.overrides).flatMap((options) =>
            options.map(([value]) => value),
          ),
        ]
        expect(SEARCH_INTENT_ONTOLOGY.predicateValues[`attributes.${key}`]).toEqual(
          expect.arrayContaining(expected),
        )
      }
    }
  })

  it('compiles distributions, relevance, ordinal operators, predicates and exact price in one call', async () => {
    const query = '我想找冬天通勤穿的，紅色或藍色，不要太厚，看起來俐落一點，預算三千以內。'
    const { plan, response } = responseFor(query)
    choose(response.answers.type_prior!, 'trench-coat')
    noul(response.answers.type_relevance!, 0.25)
    choose(response.answers.categorical_season!, 'winter')
    noul(response.answers.categorical_season_relevance!, 0.97)
    choose(response.answers.categorical_occasion!, 'work')
    noul(response.answers.categorical_occasion_relevance!, 0.91)
    const colourFamily = response.answers.categorical_colorFamily!
    if (colourFamily.type !== 'choice') throw new Error('Expected a choice answer.')
    choose(
      colourFamily,
      'red',
      Object.fromEntries(
        Object.keys(colourFamily.probabilities).map((key) => [
          key,
          key === 'red' || key === 'blue' ? 0.5 : 0,
        ]),
      ),
    )
    noul(response.answers.categorical_colorFamily_relevance!, 0.99)
    score(response.answers.ordinal_warmth!, [0, 0, 0, 1, 0])
    choose(response.answers.ordinal_warmth_relation!, 'at_least')
    score(response.answers.ordinal_structure!, [0, 0, 0, 0.5, 0.5])
    choose(response.answers.ordinal_structure_relation!, 'around')
    choose(response.answers.price!, 'budget_0')

    plan.candidates.forEach((candidate, index) => {
      const polarity =
        candidate.attribute === 'colorFamily' && ['red', 'blue'].includes(candidate.value)
          ? 'positive'
          : candidate.attribute === 'attributes.weight' && candidate.value === 'heavyweight'
            ? 'negative'
            : 'irrelevant'
      choose(response.answers[`predicate_${index}`]!, polarity)
    })
    for (const combinationKey of Object.keys(response.answers).filter((answerKey) =>
      answerKey.startsWith('combination_'),
    ))
      choose(response.answers[combinationKey]!, 'one_of')

    let sentQuestionCount = 0
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const init = args[1]
      sentQuestionCount = Object.keys(JSON.parse(String(init?.body)).questions).length
      return Response.json(response)
    }) satisfies typeof fetch
    const result = await compileSearchIntent(query, { apiKey: 'test', fetch: fetcher })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(sentQuestionCount).toBe(result.questionCount)
    expect(Object.keys(result.typePrior)).toHaveLength(SUBCATEGORIES.length)
    expect(result.typeRelevance).toBe(0.25)
    expect(result.typeExplicitness).toBe(0)
    expect(result.categorical.season).toMatchObject({ relevance: 0.97, explicitness: 1 })
    expect(result.categorical.colorFamily).toMatchObject({
      relevance: 0.99,
      explicitness: 1,
      combination: 'one_of',
    })
    expect(result.categorical.colorFamily!.probabilities).toMatchObject({ red: 0.5, blue: 0.5 })
    expect(result.ordinal.warmth).toMatchObject({
      relevance: 1,
      target: 0.75,
      relation: 'at_least',
      explicitness: 0,
    })
    expect(result.ordinal.structure).toMatchObject({
      relevance: 1,
      target: 0.875,
      relation: 'around',
      explicitness: 1,
    })
    expect(result.predicates).toEqual(
      expect.arrayContaining([
        { attribute: 'colorFamily', value: 'red', polarity: 'positive', probability: 1 },
        { attribute: 'colorFamily', value: 'blue', polarity: 'positive', probability: 1 },
        {
          attribute: 'attributes.weight',
          value: 'heavyweight',
          polarity: 'negative',
          probability: 1,
        },
      ]),
    )
    expect(result.numeric.price).toMatchObject({ currency: 'TWD', max: 3000, explicitness: 1 })
    expect(result.unresolved).toEqual([])
  })

  it('rejects incomplete and internally inconsistent provider output', async () => {
    const query = 'summer beach clothes'
    const missing = responseFor(query).response
    delete missing.answers.type_relevance
    await expect(
      compileSearchIntent(query, {
        apiKey: 'test',
        fetch: async () => Response.json(missing),
      }),
    ).rejects.toThrow('incomplete answer set')

    const invalid = responseFor(query).response
    const type = invalid.answers.type_prior!
    if (type.type !== 'choice') throw new Error('Expected a choice answer.')
    type.probabilities[type.choice] = 0.2
    await expect(
      compileSearchIntent(query, {
        apiKey: 'test',
        fetch: async () => Response.json(invalid),
      }),
    ).rejects.toThrow('invalid choice distribution')
  })
})
