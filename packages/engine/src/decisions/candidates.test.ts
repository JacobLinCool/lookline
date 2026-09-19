import { describe, expect, it } from 'vitest'
import { extractFacetCandidates, MAX_FILTER_CANDIDATES } from './candidates'

const pairs = (text: string) => extractFacetCandidates(text).map((c) => `${c.key}:${c.value}`)

describe('extractFacetCandidates', () => {
  it('names the construction values a Chinese sentence contains, spaces beside CJK ignored', () => {
    expect(pairs('A 字裙')).toEqual(['silhouettes:a-line'])
    expect(pairs('有口袋、不要蕾絲邊')).toEqual(['details:pockets', 'details:laceTrim'])
    expect(pairs('卡通印花上衣')).toEqual(['printSubjects:character'])
    expect(pairs('長袖高領毛衣')).toEqual(
      expect.arrayContaining(['sleeves:long', 'necklines:turtle']),
    )
  })

  it('names the same values in English, on word boundaries', () => {
    expect(pairs('an a-line skirt with pockets, no lace trim')).toEqual([
      'silhouettes:a-line',
      'details:pockets',
      'details:laceTrim',
    ])
    expect(pairs('cartoon print top')).toEqual(['printSubjects:character'])
    // `silk` is not inside `silky`, `long` is not inside `longline`.
    expect(pairs('silky longline coat')).toEqual(['lengths:longline'])
    expect(pairs('a silk long coat')).toEqual(['materials:silk', 'sleeves:long'])
  })

  it('leaves the semantic facets (categories, colours, styles) to the decision model', () => {
    expect(pairs('black minimalist outerwear')).toEqual([])
  })

  it('keeps the earliest mention first, prefers the longest term and caps the list', () => {
    const many = pairs(
      'ruffle pleats cutout slit belt embroidery sequin distressed ribbed cable knit lace trim asymmetric sheer tie bow fringe button front logo pockets',
    )
    expect(many.length).toBe(MAX_FILTER_CANDIDATES)
    expect(many[0]).toBe('details:ruffle')
    expect(pairs('crew neck')).toEqual(['necklines:crew'])
    expect(pairs('crew socks')).toEqual(expect.arrayContaining(['lengths:crew']))
  })

  it('returns nothing for an empty or all-punctuation sentence', () => {
    expect(pairs('')).toEqual([])
    expect(pairs('…！？')).toEqual([])
  })
})
