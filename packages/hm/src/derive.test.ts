import { describe, expect, it } from 'vitest'
import { COLOR_FAMILIES } from '@lookline/catalog'
import { categoryGroupFor, slugFor } from './derive'
import { colorFamilyOf } from './enrich'

describe('categoryGroupFor', () => {
  it('recovers the two groups H&M files under a body part', () => {
    expect(categoryGroupFor('top', 'Sport', 'T-shirt')).toBe('activewear')
    expect(categoryGroupFor('outer', 'Ladieswear', 'Blazer')).toBe('tailoring')
    expect(categoryGroupFor('outer', 'Ladieswear', 'Coat')).toBe('outerwear')
  })

  it('leaves a running shoe as footwear, or an outfit could never be given shoes', () => {
    expect(categoryGroupFor('shoes', 'Sport', 'Sneakers')).toBe('footwear')
    expect(categoryGroupFor('bag', 'Sport', 'Bag')).toBe('bags')
  })

  it('folds the roles the intent vocabulary has no word for', () => {
    expect(categoryGroupFor('socks', 'Ladieswear', 'Socks')).toBe('accessories')
    expect(categoryGroupFor('set', 'Ladieswear', 'Garment Set')).toBe('dresses')
    expect(categoryGroupFor('underwear', 'Ladieswear', 'Bra')).toBe('loungewear')
    expect(categoryGroupFor('nightwear', 'Ladieswear', 'Pyjama set')).toBe('loungewear')
  })

  it('keeps non-apparel out of the catalogue entirely', () => {
    expect(categoryGroupFor('non-apparel', 'Ladieswear', 'Side table')).toBeNull()
  })
})

describe('derived columns', () => {
  it('builds a slug that is unique because the article id is', () => {
    expect(slugFor('Strap top', '0108775015')).toBe('strap-top-0108775015')
    expect(slugFor('V. 5 LINEN T-SHIRT', '0515189003')).toBe('v-5-linen-t-shirt-0515189003')
  })
})

describe('colorFamilyOf', () => {
  /**
   * `articles.colour_family` is what every filter, facet and intent constraint compares against,
   * and they all speak the catalog's twelve. The import once stored H&M's master there instead:
   * `Black` where the shop asked for `black`, so every colour swatch matched nothing and said so
   * with an empty grid rather than an error.
   */
  it('answers in the catalog vocabulary, never H&M’s', () => {
    const families = new Set<string>(COLOR_FAMILIES)
    for (const master of ['Black', 'Khaki green', 'Mole', 'Metal', 'Turquoise', 'Lilac Purple']) {
      const family = colorFamilyOf(master)
      expect(family).not.toBe(master)
      expect(families.has(family)).toBe(true)
    }
  })

  it('leaves the colour empty rather than guessing when H&M recorded none', () => {
    expect(colorFamilyOf('Unknown')).toBe('')
    expect(colorFamilyOf('undefined')).toBe('')
    expect(colorFamilyOf('')).toBe('')
  })
})
