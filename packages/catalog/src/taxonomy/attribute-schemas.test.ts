import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_COLUMNS,
  ATTRIBUTE_SCHEMA_IDS,
  ATTRIBUTE_SCHEMAS,
  attributeOptions,
  extraOptions,
  parseWeighted,
  schemaColumns,
  schemaFor,
} from './attribute-schemas'
import { SUBCATEGORIES, findSubcategory } from './categories'
import { CLOSURES, FITS, LENGTHS, NECKLINES, SILHOUETTE_VALUES, SLEEVES } from './fits'

const VOCAB = {
  fit: FITS.map((v) => v.slug),
  silhouette: SILHOUETTE_VALUES.map((v) => v.slug),
  length: LENGTHS.map((v) => v.slug),
  neckline: NECKLINES.map((v) => v.slug),
  sleeve: SLEEVES.map((v) => v.slug),
  closure: CLOSURES.map((v) => v.slug),
}

describe('ATTRIBUTE_SCHEMAS', () => {
  it('has 46 schemas with unique ids and every subcategory references one', () => {
    expect(ATTRIBUTE_SCHEMA_IDS).toHaveLength(46)
    expect(new Set(ATTRIBUTE_SCHEMA_IDS).size).toBe(46)
    expect(Object.keys(ATTRIBUTE_SCHEMAS)).toHaveLength(46)
    const used = new Set(SUBCATEGORIES.map((s) => s.schema))
    for (const id of ATTRIBUTE_SCHEMA_IDS) expect(used.has(id), `schema ${id} unused`).toBe(true)
    expect(schemaFor('nope')).toBeUndefined()
  })

  it('column values come from the §2.5 vocabularies and weights are positive', () => {
    for (const schema of Object.values(ATTRIBUTE_SCHEMAS)) {
      for (const name of ATTRIBUTE_COLUMNS) {
        const col = schema.columns[name]
        if (!col) continue
        const lists = [col.default, ...Object.values(col.overrides)]
        for (const list of lists) {
          for (const [value, weight] of list) {
            expect(VOCAB[name], `${schema.id}.${name} = ${value}`).toContain(value)
            expect(weight).toBeGreaterThan(0)
          }
        }
        expect(col.default.length > 0 || Object.keys(col.overrides).length > 0).toBe(true)
      }
      for (const [key, col] of Object.entries(schema.extras)) {
        expect(key).toMatch(/^[a-z][a-z-]*$/)
        expect(col.default.length > 0 || Object.keys(col.overrides).length > 0).toBe(true)
      }
    }
  })

  it('every override names a subcategory that uses the schema', () => {
    for (const schema of Object.values(ATTRIBUTE_SCHEMAS)) {
      const cols = [...Object.values(schema.columns), ...Object.values(schema.extras)]
      for (const col of cols) {
        for (const sub of Object.keys(col.overrides)) {
          const def = findSubcategory(sub)
          expect(def, `${schema.id} override ${sub}`).toBeDefined()
          expect(def?.schema, `${schema.id} override ${sub}`).toBe(schema.id)
        }
      }
    }
  })

  it('every subcategory resolves a non-empty list for each of its attribute columns', () => {
    for (const s of SUBCATEGORIES) {
      const schema = ATTRIBUTE_SCHEMAS[s.schema]
      expect(schema).toBeDefined()
      if (!schema) continue
      for (const name of schemaColumns(schema)) {
        expect(attributeOptions(schema, name, s.slug).length, `${s.slug}.${name}`).toBeGreaterThan(
          0,
        )
      }
    }
  })

  it('transcribes spot-checked rows', () => {
    const tee = ATTRIBUTE_SCHEMAS.tee
    const skirt = ATTRIBUTE_SCHEMAS.skirt
    const shoe = ATTRIBUTE_SCHEMAS.shoe
    const jewel = ATTRIBUTE_SCHEMAS.jewel
    const sweat = ATTRIBUTE_SCHEMAS.sweat
    expect(tee && skirt && shoe && jewel && sweat).toBeTruthy()
    if (!tee || !skirt || !shoe || !jewel || !sweat) return
    expect(schemaColumns(tee)).toEqual(['fit', 'length', 'neckline', 'sleeve', 'closure'])
    expect(attributeOptions(tee, 'fit', 'tee')).toEqual([
      ['slim', 15],
      ['regular', 40],
      ['relaxed', 25],
      ['oversized', 15],
      ['boxy', 5],
    ])
    expect(attributeOptions(tee, 'silhouette', 'tee')).toEqual([])
    expect(attributeOptions(skirt, 'length', 'pencil-skirt')).toEqual([
      ['knee', 50],
      ['midi', 50],
    ])
    expect(attributeOptions(skirt, 'silhouette', 'midi-skirt')).toHaveLength(6)
    expect(attributeOptions(skirt, 'silhouette', 'pleated-skirt')).toEqual([['pleated', 100]])
    expect(extraOptions(shoe, 'heel', 'derby')).toEqual([['flat', 100]])
    expect(extraOptions(shoe, 'heel', 'pump')).toEqual([
      ['stiletto', 40],
      ['block', 35],
      ['kitten', 25],
    ])
    expect(extraOptions(shoe, 'heel', 'heeled-sandal')).toHaveLength(5)
    expect(extraOptions(jewel, 'type', 'ring')).toEqual([
      ['band', 50],
      ['signet', 30],
      ['stone', 20],
    ])
    expect(extraOptions(jewel, 'nope', 'ring')).toEqual([])
    expect(extraOptions(sweat, 'hood', 'hoodie')).toEqual([['fixed', 100]])
    expect(extraOptions(sweat, 'hood', 'sweatshirt')).toEqual([['none', 100]])
    expect(attributeOptions(sweat, 'neckline', 'hoodie')).toEqual([['hood', 100]])
    expect(extraOptions(ATTRIBUTE_SCHEMAS['rash-guard'] ?? sweat, 'upf', 'rash-guard')).toEqual([
      ['50', 100],
    ])
    expect(extraOptions(ATTRIBUTE_SCHEMAS.watch ?? sweat, 'case', 'watch')).toEqual([
      ['36mm', 35],
      ['40mm', 45],
      ['42mm', 20],
    ])
  })

  it('parseWeighted rejects malformed specs', () => {
    expect(parseWeighted('a 1 b 2')).toEqual([
      ['a', 1],
      ['b', 2],
    ])
    expect(() => parseWeighted('a 1 b')).toThrow()
    expect(() => parseWeighted('a x')).toThrow()
    expect(() => parseWeighted('a 0')).toThrow()
  })
})
