import { describe, expect, it } from 'vitest'
import type { RankedItem } from '../types'
import { assertGrounded, polishWithLlm, renderSummary, sumContributions } from './explain'
import type { DetailedFactor } from './explain'
import { makeCatalog } from './testing/fixtures'

const f = (
  factor: DetailedFactor['factor'],
  weight: number,
  value: number,
  evidence: string,
): DetailedFactor => ({
  factor,
  weight,
  value,
  contribution: weight * value,
  evidence,
  applicable: weight > 0,
})

const factors = [
  f('style_similarity', 0.3, 0.82, 'matches quiet-luxury (0.82), minimalist (0.61); colour black'),
  f('attribute_match', 0.15, 0.9, 'checks: hoodie, black'),
  f('budget_fit', 0.1, 1, 'NT$2,180, within NT$3,000'),
  f('popularity_prior', 0.03, 0.9, 'a frequent pick lately'), // 0.027 < 0.04: never mentioned
  f('trend_momentum', 0.07, 0.3, 'no trend signal for this style yet'), // value < .5: never mentioned
  f('social_signal', 0.1, 0.6, 'Alice wore this in a Look last week'),
  f('diversity', 0.15, -0.3, 'similar to #2 (0.30)'),
  f('compatibility', 0, 0, 'not part of an outfit'),
]

describe('renderSummary', () => {
  it('joins the top ≤ 3 qualifying factors in English with the caps applied', () => {
    const s = renderSummary(factors, 'en')
    expect(s).toBe(
      'matches quiet-luxury (0.82), minimalist (0.61); colour black; checks: hoodie, black; NT$2,180, within NT$3,000',
    )
    expect(s.length).toBeLessThanOrEqual(140)
    expect(s).not.toContain('frequent pick')
    expect(s).not.toContain('trend signal')
    expect(s).not.toContain('Alice')
  })
  it('renders zh with the full-width joiner and the 60-char cap', () => {
    const zh = [
      f('style_similarity', 0.3, 0.82, '風格對到靜奢 (0.82)、極簡 (0.61)；黑色也符合'),
      f('attribute_match', 0.15, 0.9, '符合：帽T、黑色、寬鬆'),
      f('budget_fit', 0.1, 1, 'NT$2,180，在預算 3,000 內'),
    ]
    const s = renderSummary(zh, 'zh')
    expect(
      s.startsWith('風格對到靜奢 (0.82)、極簡 (0.61)；黑色也符合；符合：帽T、黑色、寬鬆'),
    ).toBe(true)
    expect(s.length).toBeLessThanOrEqual(60)
    expect(s).not.toContain('; ')
  })
  it('adds the over-budget and relaxation caveats and falls back when nothing qualifies', () => {
    const over = [
      f('style_similarity', 0.3, 0.8, 'matches scandi (0.8)'),
      f('budget_fit', 0.1, 0.6, 'NT$3,300, 10% over budget'),
    ]
    expect(renderSummary(over, 'en', { relaxed: ['subcategories'] })).toBe(
      'matches scandi (0.8) (10% over budget; subcategory filter relaxed)',
    )
    expect(renderSummary(over, 'zh')).toContain('（超出預算 10%）')
    expect(renderSummary([f('style_similarity', 0.3, 0.1, 'weak')], 'en')).toBe(
      'best overall fit for your request',
    )
    expect(renderSummary([f('style_similarity', 0.3, 0.1, 'weak')], 'zh')).toBe(
      '與你的需求整體最相符',
    )
  })
  it('sums contributions', () => {
    expect(sumContributions(factors)).toBeCloseTo(
      0.3 * 0.82 + 0.15 * 0.9 + 0.1 + 0.027 + 0.021 + 0.06 - 0.045,
      12,
    )
  })
})

describe('assertGrounded', () => {
  const evidence = [
    'matches quiet-luxury (0.82); colour black',
    'NT$2,180, within NT$3,000',
    'Wold Supply',
    'Alice wore this in a Look',
  ]
  it('accepts grounded text and rejects foreign numbers and names', () => {
    expect(
      assertGrounded('Wold Supply hoodie at NT$2,180, a quiet-luxury match Alice wore.', evidence),
    ).toBe(true)
    expect(assertGrounded('Only NT$1,999 today', evidence)).toBe(false)
    expect(assertGrounded('Nike made this one', evidence)).toBe(false)
  })
})

describe('polishWithLlm', () => {
  const rows = makeCatalog(3, 42)
  const items: RankedItem[] = rows.map((r) => ({
    product: r,
    brandName: r.brandName,
    score: 0.5,
    explanation: {
      summary: `matches minimalist (0.8); NT$${r.price.toLocaleString('en-US')}, within NT$5,000`,
      factors: [],
    },
  }))
  it('adds prose only for grounded sentences and never throws', async () => {
    const polished = await polishWithLlm(items, 'en', {
      generateJson: async () =>
        ({
          sentences: [
            {
              productId: rows[0]!.id,
              text: `A minimalist ${rows[0]!.brandName} piece at NT$${rows[0]!.price.toLocaleString('en-US')}.`,
            },
            { productId: rows[1]!.id, text: 'Only NT$99 and made by Gucci.' },
          ],
        }) as never,
    })
    expect(polished[0]!.explanation.prose).toBeDefined()
    expect(polished[1]!.explanation.prose).toBeUndefined()
    expect(polished[2]!.explanation.prose).toBeUndefined()
    const failed = await polishWithLlm(items.slice(2), 'en', {
      generateJson: () => Promise.reject(new Error('boom')),
    })
    expect(failed[0]!.explanation.prose).toBeUndefined()
    const timedOut = await polishWithLlm(items.slice(2), 'en', {
      generateJson: () => new Promise(() => {}),
      timeoutMs: 5,
    })
    expect(timedOut[0]!.explanation.prose).toBeUndefined()
  })
})
