import { describe, expect, it } from 'vitest'
import type { Intent } from '../types'
import { IntentSchema } from './schema'

describe('IntentSchema', () => {
  it('round-trips a contract Intent and applies defaults', () => {
    const intent: Intent = {
      utterance: 'x',
      locale: 'en',
      mode: 'single',
      categoryGroups: ['tops'],
      subcategories: [],
      colors: [],
      colorFamilies: ['black'],
      aesthetics: ['minimalist'],
      materials: [],
      patterns: [],
      fits: [],
      recipient: { kind: 'self' },
      mustHave: [],
      mustAvoid: [],
      assumptions: [{ slot: 'department', value: 'women', confidence: 0.9, reason: 'profile' }],
      clarifications: [{ slot: 'budget.max', question: 'Budget?', options: ['3000', '6000'] }],
      confidence: 0.8,
    }
    const parsed = IntentSchema.parse(intent)
    expect(parsed).toEqual(intent)
    const minimal = IntentSchema.parse({
      utterance: 'y',
      locale: 'zh-TW',
      mode: 'browse',
      recipient: { kind: 'self' },
      assumptions: [],
      clarifications: [],
      confidence: 0.5,
    })
    expect(minimal.categoryGroups).toEqual([])
    expect(minimal.mustAvoid).toEqual([])
  })

  it('rejects bad enums and out-of-range numbers', () => {
    expect(
      IntentSchema.safeParse({
        utterance: 'y',
        locale: 'fr',
        mode: 'browse',
        recipient: { kind: 'self' },
        assumptions: [],
        clarifications: [],
        confidence: 0.5,
      }).success,
    ).toBe(false)
    expect(
      IntentSchema.safeParse({
        utterance: 'y',
        locale: 'en',
        mode: 'browse',
        recipient: { kind: 'self' },
        assumptions: [],
        clarifications: [],
        confidence: 1.5,
      }).success,
    ).toBe(false)
    expect(
      IntentSchema.safeParse({
        utterance: 'y',
        locale: 'en',
        mode: 'single',
        colorFamilies: ['teal'],
        recipient: { kind: 'self' },
        assumptions: [],
        clarifications: [],
        confidence: 0.5,
      }).success,
    ).toBe(false)
  })
})
