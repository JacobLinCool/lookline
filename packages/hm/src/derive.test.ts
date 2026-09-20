import { describe, expect, it } from 'vitest'
import { COLOR_FAMILIES } from '@lookline/catalog'
import { categoryGroupFor, displayNameFor, slugFor } from './derive'
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

describe('colorFamilyOf', () => {
  it('maps H&M perceived masters as before', () => {
    expect(colorFamilyOf('Black')).toBe('black')
    expect(colorFamilyOf('Khaki green')).toBe('green')
  })

  it('falls back to the finer colour name when the master is blank', () => {
    // 789 articles ship with no `perceived_colour_master_name`; 657 of them do have this.
    expect(colorFamilyOf('', 'Dark Grey')).toBe('grey')
    expect(colorFamilyOf('', 'Off White')).toBe('white')
    expect(colorFamilyOf('', 'Dark Blue')).toBe('blue')
  })

  it('leaves a colour it cannot name empty rather than guessing', () => {
    expect(colorFamilyOf('', 'Other')).toBe('')
    expect(colorFamilyOf('', '')).toBe('')
    expect(colorFamilyOf('')).toBe('')
  })
})

describe('displayNameFor', () => {
  it('drops the version marker and the stray full stop', () => {
    expect(displayNameFor('Tilly (1)')).toBe('Tilly')
    expect(displayNameFor('Pluto RW slacks (1)')).toBe('Pluto RW slacks')
    expect(displayNameFor('Alex Trs (J)')).toBe('Alex Trs')
    expect(displayNameFor('Henry polo.')).toBe('Henry polo')
  })

  it('stops shouting, but leaves a code in its own case', () => {
    expect(displayNameFor('RICHIE HOOD')).toBe('Richie Hood')
    expect(displayNameFor('FLEECE PYJAMA')).toBe('Fleece Pyjama')
    // `OC` and `SS` are codes, not words; `Oc` and `Ss` would be wrong.
    expect(displayNameFor('SWEATSHIRT  OC')).toBe('Sweatshirt OC')
    expect(displayNameFor('6P SS BODY')).toBe('6P SS Body')
  })

  it('leaves a bracket holding a word, and a name that is already fine', () => {
    // `(Poppy)` is a print, not a version marker.
    expect(displayNameFor('Fiona Ch Hipster(Poppy)4pk')).toBe('Fiona Ch Hipster(Poppy)4pk')
    expect(displayNameFor('LOGG beanie LATE')).toBe('LOGG beanie LATE')
    expect(displayNameFor('Jade HW Skinny Denim TRS')).toBe('Jade HW Skinny Denim TRS')
  })

  it('never returns an empty name', () => {
    expect(displayNameFor('(1)')).toBe('(1)')
  })
})
