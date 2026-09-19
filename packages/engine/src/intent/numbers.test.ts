import { describe, expect, it } from 'vitest'
import { cjkToNumber, findNumbers } from './numbers'
import { parseIntentOffline } from './lexicon-parser'
import { FIXTURE_CTX } from './fixtures'

describe('numbers', () => {
  it('parses CJK numerals', () => {
    const cases: Array<[string, number]> = [
      ['五千', 5000],
      ['三千五', 3500],
      ['一萬二', 12000],
      ['兩千', 2000],
      ['一千五', 1500],
      ['五百', 500],
      ['十五', 15],
      ['一百零五', 105],
      ['十', 10],
      ['二十', 20],
      ['三萬五', 35000],
      ['一萬', 10000],
    ]
    for (const [s, n] of cases) expect(cjkToNumber(s), s).toBe(n)
  })

  it('finds Arabic numbers with multipliers and commas', () => {
    expect(findNumbers('3k 或 1,200 或 1.5萬 或 3千').map((n) => n.value)).toEqual([
      3000, 1200, 15000, 3000,
    ])
    expect(findNumbers('3km away').map((n) => n.value)).toEqual([3])
  })

  it('60歲 is age, 2 件 is quantity, never budget', () => {
    const age = parseIntentOffline('送60歲的爸爸一件外套', FIXTURE_CTX)
    expect(age.budget).toBeUndefined()
    expect(age.signals?.ageHint).toBe(60)
    expect(age.department).toBe('men')
    const qty = parseIntentOffline('我要 2 件 T恤', FIXTURE_CTX)
    expect(qty.quantity).toBe(2)
    expect(qty.budget).toBeUndefined()
    expect(qty.subcategories).toEqual(['tee'])
  })

  it('sizes: waist 28, EU 42 with shoes, alpha M / medium / 中號', () => {
    expect(parseIntentOffline('jeans waist 28', FIXTURE_CTX).sizes).toEqual({
      'numeric-waist': '28',
    })
    expect(parseIntentOffline('sneakers eu 42', FIXTURE_CTX).sizes).toEqual({ 'eu-shoe': '42' })
    expect(parseIntentOffline('a hoodie size m', FIXTURE_CTX).sizes).toEqual({ alpha: 'M' })
    expect(parseIntentOffline('a hoodie in medium', FIXTURE_CTX).sizes).toEqual({ alpha: 'M' })
    expect(parseIntentOffline('中號的帽T', FIXTURE_CTX).sizes).toEqual({ alpha: 'M' })
    // no size system for bags
    expect(parseIntentOffline('a tote bag, size m', FIXTURE_CTX).sizes).toBeUndefined()
  })

  it('170cm stays in vibe, not a slot', () => {
    const r = parseIntentOffline('我170cm，想找大衣', FIXTURE_CTX)
    expect(r.budget).toBeUndefined()
    expect(r.sizes).toBeUndefined()
    expect(r.vibe).toContain('170cm')
  })
})
