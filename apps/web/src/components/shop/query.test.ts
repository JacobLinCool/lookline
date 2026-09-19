import { expect, it } from 'vitest'
import { searchFromParams, searchToParams } from './query'

it('round-trips multi-value and excluded filters and rejects unknown taxonomy values', () => {
  const search = searchFromParams(
    new URLSearchParams(
      'categoryGroups=tops&categoryGroups=outerwear&colorFamilies=black&colorFamilies=blue&excludedColorFamilies=red&excludedAesthetics=glam&colorFamilies=alien&priceMax=3000',
    ),
  )
  expect(search).toMatchObject({
    categoryGroups: ['tops', 'outerwear'],
    colorFamilies: ['black', 'blue'],
    excludedColorFamilies: ['red'],
    excludedAesthetics: ['glam'],
    priceMax: 3000,
  })
  expect(searchFromParams(searchToParams(search))).toEqual(search)
})
