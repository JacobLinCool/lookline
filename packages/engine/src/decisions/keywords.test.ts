import { describe, expect, it, vi } from 'vitest'
import type { LlmClient } from '../types'
import {
  extractSearchKeywords,
  formatKeyword,
  MAX_KEYWORD_CONCEPTS,
  parseKeywords,
  sanitizeKeywords,
} from './keywords'

const client = (concepts: unknown, provider: LlmClient['provider'] = 'gemini'): LlmClient => ({
  provider,
  textModel: provider === 'offline' ? null : 'test-model',
  imageModel: null,
  generateJson: vi.fn(async () => (concepts === null ? null : { concepts })) as never,
  generateImage: vi.fn(async () => null),
})

describe('sanitizeKeywords', () => {
  it('lower-cases, keeps index tokens only, drops catalog vocabulary and caps', () => {
    expect(
      sanitizeKeywords([
        ['Whale', 'orca', 'whale', 'humpback whale'],
        ['Hello Kitty!'],
        ['floral', 'black', 'hoodie'],
        ['鯨魚'],
        ['x'.repeat(40)],
        ['a', 'b', 'c'],
        ['too many'],
      ]),
    ).toEqual([['whale', 'orca', 'humpback whale'], ['hello kitty'], ['a', 'b', 'c'], ['too many']])
    expect(sanitizeKeywords(Array.from({ length: 9 }, (_, i) => [`k${i}`])).length).toBe(
      MAX_KEYWORD_CONCEPTS,
    )
  })

  it('round-trips through the URL form', () => {
    const concepts = [['whale', 'orca'], ['dinosaur']]
    expect(parseKeywords(concepts.map(formatKeyword))).toEqual(concepts)
    expect(parseKeywords(['floral|striped'])).toEqual([])
  })
})

describe('extractSearchKeywords', () => {
  it('asks the configured fast model once and sanitises what it says', async () => {
    const llm = client([{ terms: ['Whale', '鯨魚', 'orca'] }, { terms: ['black'] }])
    const result = await extractSearchKeywords('黑色鯨魚圖案的上衣', { llm })
    expect(result).toMatchObject({
      keywords: [['whale', 'orca']],
      provider: 'gemini',
      model: 'test-model',
      contractVersion: 'keywords-v1',
    })
    expect(llm.generateJson).toHaveBeenCalledOnce()
  })

  it('is null without a provider or when the call fails, and empty when nothing is named', async () => {
    expect(await extractSearchKeywords('whale top', { llm: client([], 'offline') })).toBeNull()
    expect(await extractSearchKeywords('whale top', { llm: client(null) })).toBeNull()
    expect((await extractSearchKeywords('black top', { llm: client([]) }))?.keywords).toEqual([])
  })

  it('rejects an empty or oversized sentence', async () => {
    await expect(extractSearchKeywords('  ', { llm: client([]) })).rejects.toThrow()
    await expect(extractSearchKeywords('x'.repeat(501), { llm: client([]) })).rejects.toThrow()
  })
})
