import { describe, expect, it } from 'vitest'
import { AESTHETICS } from './aesthetics'
import { SUBCATEGORIES } from './categories'
import { COLORS } from './colors'
import {
  AXIS_HINTS,
  DEPARTMENT_DEFS,
  LEXICON,
  LEXICON_SECTIONS,
  findDepartment,
  lookupLexicon,
  resolveTerm,
  toLexEntry,
} from './lexicon'

describe('LEXICON', () => {
  it('has every section; all but aesthetics are non-empty (aesthetics may be filled later)', () => {
    for (const section of LEXICON_SECTIONS) {
      expect(Array.isArray(LEXICON[section])).toBe(true)
      if (section !== 'aesthetics') expect(LEXICON[section].length, section).toBeGreaterThan(0)
    }
    expect(LEXICON.aesthetics).toHaveLength(AESTHETICS.length)
    expect(LEXICON.subcategories).toHaveLength(SUBCATEGORIES.length)
    expect(LEXICON.colors).toHaveLength(COLORS.length)
    expect(LEXICON.departments).toHaveLength(4)
    expect(LEXICON.categoryGroups).toHaveLength(12)
    expect(LEXICON.colorFamilies).toHaveLength(12)
    expect(LEXICON.materials).toHaveLength(37)
    expect(LEXICON.patterns).toHaveLength(15)
    expect(LEXICON.occasions).toHaveLength(12)
    expect(LEXICON.seasons).toHaveLength(5)
    expect(LEXICON.fits).toHaveLength(22)
  })

  it('every term is lower-case, trimmed, non-empty and unique within its entry', () => {
    for (const section of LEXICON_SECTIONS) {
      for (const entry of LEXICON[section]) {
        expect(entry.value.length).toBeGreaterThan(0)
        expect(entry.terms.length).toBeGreaterThan(0)
        expect(new Set(entry.terms).size).toBe(entry.terms.length)
        for (const term of entry.terms) {
          expect(term.length).toBeGreaterThan(0)
          expect(term).toBe(term.toLowerCase())
          expect(term).toBe(term.trim())
        }
      }
    }
  })

  it('values are unique within a section and follow table order', () => {
    for (const section of LEXICON_SECTIONS) {
      const values = LEXICON[section].map((e) => e.value)
      expect(new Set(values).size).toBe(values.length)
    }
    expect(LEXICON.subcategories.map((e) => e.value)).toEqual(SUBCATEGORIES.map((s) => s.slug))
    expect(LEXICON.colors.map((e) => e.value)).toEqual(COLORS.map((c) => c.slug))
  })

  it('entries carry slug, spaced slug, name and labelZh', () => {
    const tee = LEXICON.subcategories.find((e) => e.value === 'tee')
    expect(tee?.terms).toContain('t-shirt')
    expect(tee?.terms).toContain('t恤')
    expect(tee?.terms).toContain('短t')
    const wide = LEXICON.subcategories.find((e) => e.value === 'wide-leg-trousers')
    expect(wide?.terms).toContain('wide leg trousers')
    expect(wide?.terms).toContain('寬褲')
  })

  it('resolves the spec examples', () => {
    expect(resolveTerm('colors', '黑')).toBe('jet-black')
    expect(resolveTerm('colorFamilies', '黑')).toBe('black')
    expect(resolveTerm('materials', '亞麻')).toBe('linen')
    expect(resolveTerm('subcategories', '牛仔褲')).toBe('jeans')
    expect(resolveTerm('occasions', '婚禮')).toBe('wedding-guest')
    expect(resolveTerm('departments', '女生')).toBe('women')
    expect(resolveTerm('seasons', 'fall')).toBe('autumn')
    expect(resolveTerm('categoryGroups', '外套')).toBe('outerwear')
    expect(resolveTerm('fits', 'oversize')).toBe('oversized')
    expect(resolveTerm('fits', 'bodycon')).toBe('bodycon')
    expect(resolveTerm('patterns', 'floral')).toBe('bold-floral')
    expect(resolveTerm('colors', 'no-such-colour')).toBeUndefined()
    expect(lookupLexicon('colors', 'BLACK').map((e) => e.value)).toEqual(['jet-black'])
    if (AESTHETICS.length > 0) {
      expect(resolveTerm('aesthetics', '極簡')).toBe('minimalist')
      expect(resolveTerm('aesthetics', '韓系')).toBe('k-street')
    }
  })
})

describe('departments and axis hints', () => {
  it('DEPARTMENT_DEFS carry the §12 terms', () => {
    expect(DEPARTMENT_DEFS.map((d) => d.slug)).toEqual(['women', 'men', 'unisex', 'kids'])
    expect(findDepartment('kids')?.labelZh).toBe('童裝')
    expect(findDepartment('men')?.synonyms).toContain('mens')
    expect(findDepartment('nope')).toBeUndefined()
  })

  it('AXIS_HINTS are lower-case and target valid axes in [0, 1]', () => {
    expect(AXIS_HINTS).toHaveLength(10)
    for (const hint of AXIS_HINTS) {
      for (const t of hint.terms) expect(t).toBe(t.toLowerCase())
      for (const v of Object.values(hint.axes)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
    expect(AXIS_HINTS.find((h) => h.value === 'soft')?.axes).toEqual({
      texture: 0.6,
      structure: 0.3,
    })
  })

  it('toLexEntry lower-cases, dedupes and keeps order', () => {
    expect(
      toLexEntry({ slug: 'a-b', name: 'A B', labelZh: '甲', synonyms: ['X', ' a b ', ''] }),
    ).toEqual({
      value: 'a-b',
      terms: ['a-b', 'a b', '甲', 'x'],
    })
  })
})
