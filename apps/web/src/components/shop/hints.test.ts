import { FILTER_HINTS } from '@lookline/engine/hints'
import { describe, expect, it } from 'vitest'
import { shop as en } from '@/i18n/messages/en/shop'
import { shop as zhTW } from '@/i18n/messages/zh-TW/shop'
import { HINT_CHOICES, hintLocale, nextHint, withChoice } from './hints'

describe('shop hint copy', () => {
  it('has 2–6 distinct bilingual choices for every engine hint', () => {
    expect(Object.keys(HINT_CHOICES).toSorted()).toEqual(FILTER_HINTS.map((h) => h.id).toSorted())
    for (const choices of Object.values(HINT_CHOICES)) {
      expect(choices.length).toBeGreaterThanOrEqual(2)
      expect(choices.length).toBeLessThanOrEqual(6)
      expect(new Set(choices.map((c) => c.key)).size).toBe(choices.length)
      for (const choice of choices) {
        expect(choice.en.trim()).toBe(choice.en)
        expect(choice.zh.trim()).toBe(choice.zh)
        expect(choice.en).not.toBe('')
        expect(choice.zh).not.toBe('')
      }
    }
  })
  it('asks a question and labels every chip in both languages', () => {
    for (const catalog of [en, zhTW]) {
      for (const [id, choices] of Object.entries(HINT_CHOICES)) {
        const copy = catalog.hints[id as keyof typeof en.hints]
        const labels: Record<string, string> = copy.choices
        expect(copy.question.endsWith('?') || copy.question.endsWith('？')).toBe(true)
        for (const choice of choices) expect(labels[choice.key]).toBeTruthy()
        expect(new Set(choices.map((c) => labels[c.key])).size).toBe(choices.length)
      }
    }
  })
  it('appends the answer as the next clause in the language of the sentence', () => {
    const wedding = HINT_CHOICES.occasion[1]!
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
