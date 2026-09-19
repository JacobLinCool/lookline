import { describe, expect, it } from 'vitest'
import { parseTokens } from '../recommend/intent-view'
import {
  SEARCH_INTENT_CONTRACT_VERSION,
  type SearchIntent,
  type SearchPredicate,
} from '../decisions/search-intent'
import { mergeJev, routeIntent } from './jev-parser'
import { parseIntentOffline } from './lexicon-parser'
import type { IntentExt } from './schema'

const lex = (utterance: string): IntentExt => parseIntentOffline(utterance, {})

function decision(over: Partial<SearchIntent> = {}): SearchIntent {
  return {
    query: '',
    typePrior: {},
    typeRelevance: 0.9,
    typeExplicitness: 1,
    categorical: {},
    ordinal: {},
    predicates: [],
    numeric: {},
    unresolved: [],
    model: 'jev-1.13.0',
    contractVersion: SEARCH_INTENT_CONTRACT_VERSION,
    latencyMs: 300,
    questionCount: 52,
    candidateCount: 2,
    ...over,
  }
}

const positive = (attribute: string, value: string, probability = 0.99): SearchPredicate => ({
  attribute,
  value,
  polarity: 'positive',
  probability,
})

const negative = (attribute: string, value: string): SearchPredicate => ({
  attribute,
  value,
  polarity: 'negative',
  probability: 0.99,
})

describe('routeIntent', () => {
  it('escalates when the decision did not run', () => {
    expect(routeIntent(lex('黑色帽T'), null)).toEqual({
      escalate: true,
      reason: 'decision-failed',
    })
  })

  it('escalates a reference, which is not a catalog attribute', () => {
    const base = lex('黑色帽T')
    const withReference: IntentExt = { ...base, referenceHandle: 'jacob' }
    expect(routeIntent(withReference, decision()).reason).toBe('reference')
  })

  it('escalates a recipient, which is not a catalog attribute either', () => {
    const base = lex('黑色帽T')
    const gift: IntentExt = { ...base, recipient: { kind: 'other', relation: 'father' } }
    expect(routeIntent(gift, decision()).reason).toBe('recipient')
  })

  it('escalates when no garment type is recognised', () => {
    expect(routeIntent(lex('我不知道'), decision({ typeRelevance: 0.07 })).reason).toBe(
      'type-unclear',
    )
  })

  it('escalates when no literal catalog term appears', () => {
    expect(routeIntent(lex('隨便看看'), decision({ candidateCount: 0 })).reason).toBe(
      'no-catalog-term',
    )
  })

  it('keeps a plain attribute sentence out of the generative parser', () => {
    expect(routeIntent(lex('黑色帽T'), decision())).toEqual({ escalate: false, reason: null })
  })
})

describe('mergeJev', () => {
  it('fills categories, colours and fit from positive predicates', () => {
    const merged = mergeJev(
      lex('想找一件外套'),
      decision({
        predicates: [
          positive('subcategory', 'windbreaker'),
          positive('colorFamily', 'blue'),
          positive('color', 'navy'),
          positive('fit', 'relaxed'),
        ],
      }),
    )
    expect(merged.subcategories).toContain('windbreaker')
    expect(merged.colorFamilies).toContain('blue')
    expect(merged.colors).toContain('navy')
    expect(merged.fits).toContain('relaxed')
    // The subcategory carries its own group in, so retrieval does not have to guess it.
    expect(merged.categoryGroups).toContain('outerwear')
  })

  it('ignores a predicate the decision is not confident about', () => {
    const merged = mergeJev(
      lex('想找一件外套'),
      decision({ predicates: [positive('colorFamily', 'red', 0.2)] }),
    )
    expect(merged.colorFamilies).not.toContain('red')
  })

  it('writes negatives as tokens the recommender understands', () => {
    const merged = mergeJev(
      lex('想找一件外套'),
      decision({
        predicates: [negative('colorFamily', 'white'), negative('material', 'polyester')],
      }),
    )
    const parsed = parseTokens(merged.mustAvoid)
    expect(parsed.colorFamilies).toContain('white')
    expect(parsed.materials).toContain('polyester')
    expect(parsed.text).toHaveLength(0)
  })

  it('drops a negative whose attribute has no constraint slot, rather than degrading it', () => {
    const merged = mergeJev(
      lex('想找一件外套'),
      decision({ predicates: [negative('neckline', 'turtleneck')] }),
    )
    expect(merged.mustAvoid.some((token) => token.includes('turtleneck'))).toBe(false)
  })

  it('takes the garment type from the prior only when the sentence names none', () => {
    const merged = mergeJev(
      lex('想找一件寬鬆的米色的'),
      decision({ typePrior: { 'crewneck-sweater': 0.94, cardigan: 0.05 } }),
    )
    expect(merged.subcategories).toContain('crewneck-sweater')
    expect(merged.subcategories).not.toContain('cardigan')
  })

  it('leaves the deterministic budget alone — the decision never invents numbers', () => {
    const base = lex('黑色帽T，三千以內')
    expect(base.budget?.max).toBe(3000)
    const merged = mergeJev(
      base,
      decision({
        numeric: { price: { relevance: 0.9, explicitness: 1, currency: 'TWD', max: 9000 } },
      }),
    )
    expect(merged.budget?.max).toBe(3000)
  })

  it('accepts the decision budget when the sentence gave the lexicon nothing', () => {
    const merged = mergeJev(
      lex('黑色帽T'),
      decision({
        numeric: { price: { relevance: 0.9, explicitness: 1, currency: 'TWD', max: 3000 } },
      }),
    )
    expect(merged.budget?.max).toBe(3000)
  })

  it('turns a relevant ordinal constraint into an axis hint, and ignores an irrelevant one', () => {
    const merged = mergeJev(
      lex('想找一件外套'),
      decision({
        ordinal: {
          formality: {
            relevance: 0.9,
            target: 0.2,
            relation: 'at_most',
            relationProbabilities: {
              unconstrained: 0,
              around: 0.1,
              at_least: 0,
              at_most: 0.9,
            },
            explicitness: 0.8,
          },
          warmth: {
            relevance: 0.1,
            target: 0.9,
            relation: 'around',
            relationProbabilities: {
              unconstrained: 0.5,
              around: 0.5,
              at_least: 0,
              at_most: 0,
            },
            explicitness: 0.1,
          },
        },
      }),
    )
    // target .2 sits below the neutral midpoint, so it enters as a negative modifier.
    expect(merged.signals?.axisHints?.['formality']).toBeCloseTo(-0.6)
    expect(merged.signals?.axisHints?.['warmth']).toBeUndefined()
  })

  it('records which parser spoke', () => {
    expect(mergeJev(lex('黑色帽T'), decision()).parser).toBe('jev')
  })
})
