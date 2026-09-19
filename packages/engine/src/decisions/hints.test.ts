import { describe, expect, it } from 'vitest'
import {
  FILTER_HINTS,
  hintKey,
  hintQuestions,
  isFilterHintId,
  openingHints,
  reduceHints,
  type ChoiceAnswer,
} from './hints'

function answer(choice: string, confidence = 1): ChoiceAnswer {
  const keys = ['stated', 'missing', 'inapplicable']
  return {
    type: 'choice',
    choice,
    confidence,
    probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? 1 : 0])),
  }
}

describe('filter hints', () => {
  it('keeps 20–30 hints in strict priority order with unique ids', () => {
    expect(FILTER_HINTS.length).toBeGreaterThanOrEqual(20)
    expect(FILTER_HINTS.length).toBeLessThanOrEqual(30)
    expect(new Set(FILTER_HINTS.map((h) => h.id)).size).toBe(FILTER_HINTS.length)
    for (let i = 1; i < FILTER_HINTS.length; i++)
      expect(FILTER_HINTS[i]!.priority).toBeGreaterThan(FILTER_HINTS[i - 1]!.priority)
  })
  it('asks one bounded Choice per hint the filters cannot already answer', () => {
    const questions = hintQuestions({})
    expect(Object.keys(questions)).toHaveLength(FILTER_HINTS.length)
    expect(questions['hint:recipient']!.criteria).toEqual({
      stated: expect.stringContaining('who will wear it'),
      missing: expect.stringContaining('does not say'),
    })
    expect(Object.keys(questions['hint:length']!.criteria)).toEqual([
      'stated',
      'missing',
      'inapplicable',
    ])
    expect(questions['hint:length']!.instructions).toContain('dress')
    const answered = hintQuestions({
      department: 'women',
      categoryGroups: ['dresses'],
      colorFamilies: ['black'],
      excludedColorFamilies: ['red'],
      aesthetics: ['minimalist'],
      priceMax: 3000,
      sort: 'new',
    })
    for (const id of ['recipient', 'category', 'colour', 'avoid-colour', 'mood', 'budget', 'order'])
      expect(answered[`hint:${id}`]).toBeUndefined()
    expect(answered['hint:occasion']).toBeDefined()
  })
  it('reduces answers to the missing hints in priority order and drops unsure or absent ones', () => {
    const hints = reduceHints(
      {},
      {
        [hintKey('statement')]: answer('missing'),
        [hintKey('occasion')]: answer('missing'),
        [hintKey('recipient')]: answer('stated'),
        [hintKey('budget')]: answer('missing', 0.3),
        [hintKey('length')]: answer('inapplicable'),
        [hintKey('colour')]: { ...answer('missing'), choice: 'maybe' },
      },
    )
    expect(hints).toEqual(['occasion', 'statement'])
    expect(
      reduceHints({ department: 'men' }, { [hintKey('recipient')]: answer('missing') }),
    ).toEqual([])
  })
  it('opens with context-free hints the filters leave open', () => {
    expect(openingHints({}).slice(0, 4)).toEqual(['recipient', 'occasion', 'formality', 'category'])
    expect(openingHints({ department: 'kids', priceMax: 1000 })).not.toContain('recipient')
    expect(openingHints({})).not.toContain('wedding-role')
    expect(isFilterHintId('occasion')).toBe(true)
    expect(isFilterHintId('hint:occasion')).toBe(false)
  })
})
