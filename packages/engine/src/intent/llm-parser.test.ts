import { afterEach, describe, expect, it } from 'vitest'
import type { LlmClient } from '../types'
import { setLlm } from '../llm'
import { parseIntent } from './index'
import { parseIntentOffline } from './lexicon-parser'
import { fuzzySlug, intentPromptV1, mergeLlm, userMessage } from './llm-parser'
import { LlmIntentOutput, type LlmIntentOutputT } from './schema'
import { FIXTURE_CTX } from './fixtures'
import { LEXICON } from '@lookline/catalog'

const base = (over: Partial<LlmIntentOutputT> = {}): LlmIntentOutputT => ({
  mode: 'single',
  categoryGroups: [],
  subcategories: [],
  colors: [],
  colorFamilies: [],
  aesthetics: [],
  materials: [],
  patterns: [],
  fits: [],
  sizes: [],
  occasion: null,
  season: null,
  recipient: { kind: 'self', relation: null, department: null, label: null },
  mustHave: [],
  mustAvoid: [],
  vibe: null,
  referenceHandle: null,
  referenceRole: null,
  quantity: null,
  budgetRaw: { amount: null, amount2: null, currency: null, kind: null, scope: null },
  assumptions: [],
  clarifications: [],
  rawMentions: [],
  ...over,
})

const mockLlm = (impl: () => Promise<unknown>): LlmClient => ({
  provider: 'openai',
  textModel: 'mock-model',
  imageModel: null,
  generateJson: async <T>() => (await impl()) as T | null,
  generateImage: async () => null,
})

afterEach(() => setLlm(null))

describe('prompt', () => {
  it('INTENT_PROMPT_V1 lists the catalog slugs and four few-shot pairs', () => {
    const p = intentPromptV1()
    expect(p).toContain('quiet-luxury')
    expect(p).toContain('wedding-guest')
    expect((p.match(/^Sentence: /gm) ?? []).length).toBe(4)
    expect(intentPromptV1()).toBe(p)
    expect(userMessage('hi', FIXTURE_CTX)).toContain('Contacts: Alice, Jacob')
  })
  it('fuzzySlug maps typos and terms', () => {
    expect(fuzzySlug('hoodies', LEXICON.subcategories)).toBe('hoodie')
    expect(fuzzySlug('hodie', LEXICON.subcategories)).toBe('hoodie')
    expect(fuzzySlug('帽t', LEXICON.subcategories)).toBe('hoodie')
    expect(fuzzySlug('spaceship', LEXICON.subcategories)).toBeUndefined()
  })
})

describe('mergeLlm (§1.6)', () => {
  it('lexicon budget overrides the LLM budget; LLM wins on aesthetics and occasion', () => {
    const lex = parseIntentOffline('幫我找一件黑色的oversize帽T，三千以內', FIXTURE_CTX)
    const llm = base({
      aesthetics: ['streetwear', 'korean-minimal'],
      occasion: 'office',
      budgetRaw: { amount: 9999, amount2: null, currency: 'USD', kind: 'max', scope: null },
      mode: 'single',
      colorFamilies: ['black'],
      subcategories: ['hoodie'],
    })
    const r = mergeLlm(lex, llm, FIXTURE_CTX)
    expect(r.budget?.max).toBe(3000)
    expect(r.aesthetics.slice(0, 2)).toEqual(['streetwear', 'k-street'])
    expect(r.occasion).toBe('office')
    expect(r.parser).toBe('merged')
    expect(r.department).toBe('women')
  })

  it('OOV aesthetic is dropped into vibe with a .3 assumption; unknown enums are fuzzy-mapped', () => {
    const lex = parseIntentOffline('a hoodie', FIXTURE_CTX)
    const r = mergeLlm(
      lex,
      base({ aesthetics: ['space-cowboy', 'minimalst'], subcategories: ['hodie'] }),
      FIXTURE_CTX,
    )
    expect(r.aesthetics).toEqual(['minimalist'])
    expect(r.vibe).toContain('space-cowboy')
    expect(r.assumptions.find((a) => a.slot === 'vibe')?.confidence).toBe(0.3)
    expect(r.subcategories).toEqual(['hoodie'])
  })

  it('LLM budget is used when the lexicon found no number; department from lexicon at ≥ .9 wins', () => {
    const lex = parseIntentOffline('a hoodie for my dad', FIXTURE_CTX)
    const r = mergeLlm(
      lex,
      base({
        budgetRaw: {
          amount: 100,
          amount2: null,
          currency: 'usd',
          kind: 'around',
          scope: 'per_item',
        },
        recipient: { kind: 'other', relation: 'father', department: 'women', label: 'my dad' },
      }),
      FIXTURE_CTX,
    )
    expect(r.budget).toMatchObject({ min: 2400, max: 4000, strictness: 'soft', scope: 'per_item' })
    expect(r.department).toBe('men')
    expect(r.recipient.relation).toBe('father')
  })

  it('LLM output schema validates a full example', () => {
    expect(LlmIntentOutput.safeParse(base()).success).toBe(true)
  })
})

describe('parseIntent', () => {
  it('offline ctx or offline provider → lexicon result with provider offline', async () => {
    setLlm(mockLlm(async () => base({ mode: 'browse' })))
    const r = await parseIntent('黑色帽T', { ...FIXTURE_CTX, offline: true })
    expect(r.provider).toBe('offline')
    expect(r.intent.parser).toBe('lexicon')
    expect(r.vector).toHaveLength(64)
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('invalid JSON / null from the provider → provider offline, parser lexicon', async () => {
    setLlm(mockLlm(async () => null))
    const r = await parseIntent('黑色帽T', FIXTURE_CTX)
    expect(r.provider).toBe('offline')
    expect(r.intent.parser).toBe('lexicon')
  })

  it('merges a valid LLM output and reports the provider/model', async () => {
    setLlm(
      mockLlm(async () =>
        base({ aesthetics: ['grunge'], mode: 'single', subcategories: ['hoodie'] }),
      ),
    )
    const r = await parseIntent('黑色帽T', FIXTURE_CTX)
    expect(r.provider).toBe('openai')
    expect(r.model).toBe('mock-model')
    expect(r.intent.parser).toBe('merged')
    expect(r.intent.aesthetics).toContain('grunge')
  })

  it('follow-ups merge onto the previous intent', async () => {
    const prev = parseIntentOffline('幫我找一件黑色的oversize帽T，三千以內', FIXTURE_CTX)
    const r = await parseIntent('再便宜一點', {
      ...FIXTURE_CTX,
      previousIntent: prev,
      offline: true,
    })
    expect(r.intent.budget?.max).toBe(2400)
    expect(r.intent.subcategories).toEqual(['hoodie'])
  })
})
