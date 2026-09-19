import { describe, expect, it } from 'vitest'
import { ftsQuery, spaceCjk } from './fts'

describe('ftsQuery', () => {
  it('makes a Latin word a prefix term, as it always did', () => {
    expect(ftsQuery('black hoodie')).toBe('"black"* "hoodie"*')
    expect(ftsQuery('  ')).toBeNull()
  })

  it('makes a run of Chinese a phrase over its characters', () => {
    // `unicode61` has nothing to split a run of Han on, so the index holds the whole run and a
    // two-character query never equals it. Spaced at both ends, `麻花` finds its 679 articles.
    expect(ftsQuery('麻花')).toBe('"麻 花"')
    expect(ftsQuery('荷葉邊')).toBe('"荷 葉 邊"')
  })

  it('keeps each language in its own form when a query mixes them', () => {
    expect(ftsQuery('black 針織')).toBe('"black"* "針 織"')
  })

  it('never puts a prefix star on a phrase', () => {
    // `"麻 花"*` asks for a character beginning with 花, which is not a thing.
    expect(ftsQuery('麻花')).not.toContain('*')
  })

  it('spaceCjk leaves everything that is not CJK alone', () => {
    expect(spaceCjk('black hoodie')).toBe('black hoodie')
    expect(spaceCjk('針織')).toBe('針 織')
  })
})
