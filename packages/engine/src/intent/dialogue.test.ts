import { describe, expect, it } from 'vitest'
import { applyClarification, detectFollowUp, isFollowUp, mergeIntent } from './dialogue'
import { isClarificationAnswer } from './clarify'
import { parseIntentOffline } from './lexicon-parser'
import { FIXTURE_CTX, withUser } from './fixtures'

const prevOutfit = () => parseIntentOffline('下週要去朋友婚禮，預算五千，不想太正式', FIXTURE_CTX)
const prevSingle = () => parseIntentOffline('幫我找一件黑色的oversize帽T，三千以內', FIXTURE_CTX)
const follow = (prev: ReturnType<typeof parseIntentOffline>, u: string, ctx = FIXTURE_CTX) =>
  mergeIntent(prev, parseIntentOffline(u, { ...ctx, previousIntent: prev }), ctx)

describe('follow-ups (§1.8)', () => {
  it('detects phrases and recolours', () => {
    expect(isFollowUp('再便宜一點', prevSingle())).toBe(true)
    expect(isFollowUp('cheaper please', prevSingle())).toBe(true)
    expect(isFollowUp('in black instead', prevSingle())).toBe(true)
    expect(detectFollowUp('換成藍色').colorFamily).toBe('blue')
    expect(detectFollowUp('make it navy').colorFamily).toBe('blue')
    expect(isFollowUp('a warm coat for winter', prevSingle())).toBe(false)
    expect(isFollowUp('再便宜一點', null)).toBe(false)
  })

  it('cheaper / pricier scale the ceiling; without a budget they move the price-tier target', () => {
    expect(follow(prevSingle(), '再便宜一點').budget?.max).toBe(2400)
    expect(follow(prevSingle(), 'can go higher').budget?.max).toBe(3900)
    const noBudget = parseIntentOffline('黑色帽T', FIXTURE_CTX)
    expect(noBudget.budget).toBeUndefined()
    expect(follow(noBudget, 'cheaper').axisTargets?.['price-tier']).toBeCloseTo(0.25, 6)
  })

  it('recolour replaces colour families and drops conflicting avoids', () => {
    const r = follow(prevSingle(), 'in white instead')
    expect(r.colorFamilies).toEqual(['white'])
    expect(r.colorWeights).toEqual({ white: 1 })
    const wedding = follow(prevOutfit(), '換成白色')
    expect(wedding.colorFamilies).toEqual(['white'])
    expect(wedding.mustAvoid).not.toContain('color:white')
  })

  it('more formal / more casual nudge formality by 0.15', () => {
    const prev = prevOutfit()
    expect(follow(prev, '正式一點').axisTargets?.formality).toBeCloseTo(0.725, 3)
    expect(follow(prev, 'more casual').axisTargets?.formality).toBeCloseTo(0.425, 3)
  })

  it('just the top / whole outfit / for me instead', () => {
    const only = follow(prevOutfit(), 'just the top')
    expect(only.mode).toBe('single')
    expect(only.categoryGroups).toEqual(['tops'])
    expect(only.occasion).toBe('wedding-guest')
    const zh = follow(prevOutfit(), '只要上衣')
    expect(zh.categoryGroups).toEqual(['tops'])
    expect(follow(prevSingle(), '整套').mode).toBe('outfit')
    const gift = parseIntentOffline('gift for my dad under $100', FIXTURE_CTX)
    const me = follow(gift, 'for me instead', withUser('women'))
    expect(me.recipient).toEqual({ kind: 'self' })
    expect(me.department).toBe('women')
    expect(me.giftCategoryPrior).toBeUndefined()
  })

  it('explicit slots of the follow-up replace, unspecified slots are kept', () => {
    const r = follow(prevSingle(), '改成毛衣')
    expect(r.subcategories).toEqual(['crewneck-sweater'])
    expect(r.colorFamilies).toEqual(['black'])
    expect(r.budget?.max).toBe(3000)
    expect(r.utterance).toBe('改成毛衣')
    expect(r.previousUtterance).toBe(prevSingle().utterance)
  })
})

describe('clarifications', () => {
  it('applyClarification removes the question and sets confidence 1', () => {
    const r = parseIntentOffline('running shoes size 42, not Nike', withUser(undefined))
    expect(r.clarifications.map((c) => c.slot)).toEqual(['department'])
    const answered = applyClarification(r, 'department', 'men')
    expect(answered.department).toBe('men')
    expect(answered.clarifications).toEqual([])
    expect(answered.assumptions.find((a) => a.slot === 'department')).toMatchObject({
      value: 'men',
      confidence: 1,
    })
    expect(answered.confidence).toBeGreaterThan(r.confidence)
  })

  it('answering the gift category and the budget question', () => {
    const gift = parseIntentOffline('gift for my dad under $100, he likes hiking', FIXTURE_CTX)
    const a = applyClarification(gift, 'categoryGroups', 'footwear')
    expect(a.categoryGroups).toEqual(['footwear'])
    expect(a.giftCategoryPrior).toBeUndefined()
    const outfit = parseIntentOffline('office outfit', FIXTURE_CTX)
    const b = applyClarification(outfit, 'budget.max', '6000')
    expect(b.budget).toMatchObject({ max: 6000, scope: 'total' })
    expect(b.clarifications.map((c) => c.slot)).not.toContain('budget.max')
  })

  it('isClarificationAnswer matches options and labels', () => {
    const r = parseIntentOffline('running shoes size 42', withUser(undefined))
    expect(isClarificationAnswer('men', r)).toBe(true)
    expect(isClarificationAnswer('男裝', r)).toBe(true)
    expect(isClarificationAnswer('是男生的', r)).toBe(true)
    expect(isClarificationAnswer('a warm coat for winter please', r)).toBe(false)
    expect(isFollowUp('women', r)).toBe(true)
  })
})
