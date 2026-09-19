import { FILTER_HINTS } from '@lookline/engine/hints'
import { describe, expect, it } from 'vitest'
import { HINT_COPY, hintLocale, nextHint, withChoice } from './hints'

describe('shop hint copy', () => {
  it('has a question and 2–6 distinct bilingual choices for every engine hint', () => {
    expect(Object.keys(HINT_COPY).toSorted()).toEqual(FILTER_HINTS.map((h) => h.id).toSorted())
    for (const copy of Object.values(HINT_COPY)) {
      expect(copy.question.endsWith('?')).toBe(true)
      expect(copy.choices.length).toBeGreaterThanOrEqual(2)
      expect(copy.choices.length).toBeLessThanOrEqual(6)
      expect(new Set(copy.choices.map((c) => c.label)).size).toBe(copy.choices.length)
      for (const choice of copy.choices) {
        expect(choice.en.trim()).toBe(choice.en)
        expect(choice.zh.trim()).toBe(choice.zh)
        expect(choice.en).not.toBe('')
        expect(choice.zh).not.toBe('')
      }
    }
  })
  it('appends the answer as the next clause in the language of the sentence', () => {
    const wedding = HINT_COPY.occasion.choices[1]!
    expect(withChoice('', wedding)).toBe('for a wedding')
    expect(withChoice('black dress, ', wedding)).toBe('black dress, for a wedding')
    expect(withChoice('黑色洋裝', wedding)).toBe('黑色洋裝，參加婚禮')
    expect(withChoice('黑色洋裝，', wedding)).toBe('黑色洋裝，參加婚禮')
    expect(withChoice('navy 外套 三千以內', wedding)).toBe('navy 外套 三千以內，參加婚禮')
    expect(hintLocale('minimalist jacket 黑')).toBe('en')
  })
  it('skips hints the shopper passed on', () => {
    expect(nextHint(['recipient', 'occasion'], new Set(['recipient']))).toBe('occasion')
    expect(nextHint(['recipient'], new Set(['recipient']))).toBeUndefined()
  })
})
