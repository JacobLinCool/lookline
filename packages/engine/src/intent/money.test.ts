import { describe, expect, it } from 'vitest'
import { parseIntentOffline } from './lexicon-parser'
import { FIXTURE_CTX, withUser } from './fixtures'

const budget = (u: string, ctx = FIXTURE_CTX) => parseIntentOffline(u, ctx).budget

describe('budget qualifiers (§1.4.2)', () => {
  it('max / hard', () => {
    expect(budget('外套 3000 以內')).toMatchObject({ max: 3000, strictness: 'hard' })
    expect(budget('外套 不超過 3000')).toMatchObject({ max: 3000, strictness: 'hard' })
    expect(budget('外套最多兩千')).toMatchObject({ max: 2000, strictness: 'hard' })
    expect(budget('a coat under 3000')).toMatchObject({ max: 3000, strictness: 'hard' })
    expect(budget('a coat up to 3000')).toMatchObject({ max: 3000, strictness: 'hard' })
    expect(budget('a coat, 3000 max')).toMatchObject({ max: 3000, strictness: 'hard' })
  })
  it('soft budget word', () => {
    const r = parseIntentOffline('預算五千的外套', FIXTURE_CTX)
    expect(r.budget).toMatchObject({ max: 5000, strictness: 'soft', original: '預算五千' })
    expect(r.assumptions.some((a) => a.slot === 'budget.strictness' && a.confidence === 0.8)).toBe(
      true,
    )
    expect(budget('coat, budget 5000')).toMatchObject({ max: 5000, strictness: 'soft' })
  })
  it('around', () => {
    expect(budget('外套三千左右')).toMatchObject({ min: 2250, max: 3750, strictness: 'soft' })
    expect(budget('外套大概3000')).toMatchObject({ min: 2250, max: 3750 })
    expect(budget('coat around 3000')).toMatchObject({ min: 2250, max: 3750 })
    expect(budget('coat ~3000')).toMatchObject({ min: 2250, max: 3750 })
  })
  it('range', () => {
    expect(budget('外套 2000 到 4000')).toMatchObject({ min: 2000, max: 4000, strictness: 'hard' })
    expect(budget('外套 2000~4000')).toMatchObject({ min: 2000, max: 4000 })
    expect(budget('coat between 2000 and 4000')).toMatchObject({ min: 2000, max: 4000 })
    expect(budget('coat 2000-4000')).toMatchObject({ min: 2000, max: 4000 })
  })
  it('min', () => {
    expect(budget('外套 5000 以上')).toMatchObject({ min: 5000, strictness: 'hard' })
    expect(budget('coat at least 5000')).toMatchObject({ min: 5000, strictness: 'hard' })
    expect(budget('coat over 5000')).toMatchObject({ min: 5000 })
  })
  it('cheap / luxury words without a number', () => {
    const cheap = parseIntentOffline('cheap hoodie', FIXTURE_CTX)
    expect(cheap.budget).toMatchObject({ max: 1500, strictness: 'soft' })
    expect(cheap.axisTargets?.['price-tier']).toBe(0.2)
    expect(cheap.assumptions.find((a) => a.slot === 'budget')?.confidence).toBe(0.5)
    const lux = parseIntentOffline('高級一點的大衣', FIXTURE_CTX)
    expect(lux.budget).toMatchObject({ min: 8000 })
    expect(lux.axisTargets?.['price-tier']).toBe(0.85)
    const outfitCheap = parseIntentOffline('便宜的整套穿搭', FIXTURE_CTX)
    expect(outfitCheap.budget).toMatchObject({ max: 4000 })
  })
  it('flexible and per-item scope', () => {
    expect(budget('預算不限的大衣')).toMatchObject({ strictness: 'flexible' })
    expect(budget('每件 800 的T恤')).toMatchObject({ max: 800, scope: 'per_item' })
    expect(budget('tees under 800 each')).toMatchObject({ max: 800, scope: 'per_item' })
  })
})

describe('currency (§0.7)', () => {
  it('$100 in English → USD .70 with a clarification', () => {
    const r = parseIntentOffline('a hoodie under $100', FIXTURE_CTX)
    expect(r.budget).toMatchObject({ max: 3200, originalAmount: 100, originalCurrency: 'USD' })
    expect(r.assumptions.find((a) => a.slot === 'budget.currency')).toMatchObject({
      value: 'USD',
      confidence: 0.7,
    })
    expect(r.clarifications.map((c) => c.slot)).toContain('budget.currency')
  })
  it('$5000 in Chinese → TWD .85, no clarification', () => {
    const r = parseIntentOffline('帽T $5000以內', FIXTURE_CTX)
    expect(r.budget).toMatchObject({ max: 5000, originalCurrency: 'TWD' })
    expect(r.assumptions.find((a) => a.slot === 'budget.currency')?.confidence).toBe(0.85)
    expect(r.clarifications.map((c) => c.slot)).not.toContain('budget.currency')
  })
  it('explicit tokens convert at fixed rates with §0 rounding', () => {
    expect(budget('hoodie under NT$8000')).toMatchObject({ max: 8000, originalCurrency: 'TWD' })
    expect(budget('hoodie under 150 dollars')).toMatchObject({ max: 4800, originalCurrency: 'USD' })
    expect(budget('hoodie under €50')).toMatchObject({ max: 1750, originalCurrency: 'EUR' })
    expect(budget('hoodie under ¥30000')).toMatchObject({ max: 6300, originalCurrency: 'JPY' })
    expect(budget('帽T 3000 日幣以內')).toMatchObject({ max: 630, originalCurrency: 'JPY' })
    expect(budget('hoodie under 33 usd')).toMatchObject({ max: 1050 })
    expect(budget('hoodie under 3 usd')).toMatchObject({ max: 100 })
  })
  it('bare $ ≥ 1000 in English → TWD .60', () => {
    const r = parseIntentOffline('a coat under $3000', FIXTURE_CTX)
    expect(r.budget).toMatchObject({ max: 3000, originalCurrency: 'TWD' })
    expect(r.assumptions.find((a) => a.slot === 'budget.currency')?.confidence).toBe(0.6)
  })
  it('no budget at all leaves budget undefined and asks for outfits only', () => {
    expect(parseIntentOffline('a black hoodie', FIXTURE_CTX).budget).toBeUndefined()
    const outfit = parseIntentOffline('office outfit', withUser('women'))
    expect(outfit.budget).toBeUndefined()
    expect(outfit.clarifications.map((c) => c.slot)).toContain('budget.max')
  })
})
