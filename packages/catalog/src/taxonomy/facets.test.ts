import { describe, expect, it } from 'vitest'
import {
  SEARCH_FACETS,
  SEARCH_FACET_FIELDS,
  facetAppliesTo,
  isFacetValue,
  isSearchFacetField,
  searchFacetOfField,
} from './facets'

describe('SEARCH_FACETS', () => {
  it('names every field once and backs every value with a bilingual vocabulary entry', () => {
    expect(new Set(SEARCH_FACET_FIELDS).size).toBe(SEARCH_FACET_FIELDS.length)
    expect(new Set(SEARCH_FACETS.map((f) => f.id)).size).toBe(SEARCH_FACETS.length)
    for (const facet of SEARCH_FACETS) {
      expect(facet.values.length).toBeGreaterThan(0)
      expect(new Set(facet.values.map((v) => v.slug)).size).toBe(facet.values.length)
      for (const value of facet.values) {
        expect(value.name).not.toBe('')
        expect(value.labelZh).not.toBe('')
      }
    }
  })

  it('does not offer the unprinted print subject the column cannot distinguish from unknown', () => {
    const print = SEARCH_FACETS.find((f) => f.id === 'printSubject')!
    expect(isFacetValue(print, 'none')).toBe(false)
    expect(isFacetValue(print, 'character')).toBe(true)
  })

  it('resolves a field back to its facet for selections and exclusions alike', () => {
    expect(searchFacetOfField('excludedDetails')?.id).toBe('detail')
    expect(searchFacetOfField('sleeves')?.id).toBe('sleeve')
    expect(isSearchFacetField('priceMax')).toBe(false)
  })

  it('knows which category groups a construction facet can describe', () => {
    const sleeve = SEARCH_FACETS.find((f) => f.id === 'sleeve')!
    const detail = SEARCH_FACETS.find((f) => f.id === 'detail')!
    expect(facetAppliesTo(sleeve, ['bags'])).toBe(false)
    expect(facetAppliesTo(sleeve, ['bags', 'tops'])).toBe(true)
    expect(facetAppliesTo(sleeve, [])).toBe(true)
    expect(facetAppliesTo(detail, ['bags'])).toBe(true)
  })
})
