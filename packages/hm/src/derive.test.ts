import { describe, expect, it } from 'vitest'
import { categoryGroupFor, sizeSystemFor, slugFor } from './derive'

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
  it('picks the size chart from the slot the article occupies', () => {
    expect(sizeSystemFor('shoes')).toBe('eu-shoe')
    expect(sizeSystemFor('jewelry')).toBe('one-size')
    expect(sizeSystemFor('top')).toBe('alpha')
  })

  it('builds a slug that is unique because the article id is', () => {
    expect(slugFor('Strap top', '0108775015')).toBe('strap-top-0108775015')
    expect(slugFor('V. 5 LINEN T-SHIRT', '0515189003')).toBe('v-5-linen-t-shirt-0515189003')
  })
})
