import { describe, expect, it } from 'vitest'
import { inferRole, inferRoles } from './roles'

describe('role inference from category groups', () => {
  it('maps every group to a slot role', () => {
    const cases: Array<[string, string, string]> = [
      ['tops', 'tee', 'top'],
      ['bottoms', 'jeans', 'bottom'],
      ['dresses', 'midi-dress', 'one-piece'],
      ['outerwear', 'trench-coat', 'outer'],
      ['footwear', 'sneaker', 'shoes'],
      ['bags', 'tote', 'bag'],
      ['accessories', 'belt', 'accessory'],
      ['jewelry', 'necklace', 'jewelry'],
      ['activewear', 'sports-bra', 'top'],
      ['activewear', 'training-tights', 'bottom'],
      ['activewear', 'track-jacket', 'outer'],
      ['swimwear', 'swim-trunks', 'bottom'],
      ['swimwear', 'one-piece', 'one-piece'],
      ['swimwear', 'cover-up', 'outer'],
      ['loungewear', 'sweatpants', 'bottom'],
      ['loungewear', 'robe', 'outer'],
      ['loungewear', 'pajama-set', 'one-piece'],
      ['tailoring', 'blazer', 'outer'],
      ['tailoring', 'dress-shirt', 'top'],
      ['tailoring', 'tailored-trousers', 'bottom'],
      ['tailoring', 'two-piece-suit', 'one-piece'],
      ['loungewear', 'mystery-slippers', 'top'],
      ['made-up-group', 'thing', 'accessory'],
    ]
    for (const [categoryGroup, subcategory, role] of cases) {
      expect(inferRole({ categoryGroup, subcategory }), `${categoryGroup}/${subcategory}`).toBe(
        role,
      )
    }
  })

  it('numbers repeated roles in input order', () => {
    const roles = inferRoles([
      { categoryGroup: 'tops', subcategory: 'tee' },
      { categoryGroup: 'tops', subcategory: 'cardigan' },
      { categoryGroup: 'bottoms', subcategory: 'jeans' },
      { categoryGroup: 'tops', subcategory: 'blouse' },
    ])
    expect(roles).toEqual(['top', 'top-2', 'bottom', 'top-3'])
  })
})
