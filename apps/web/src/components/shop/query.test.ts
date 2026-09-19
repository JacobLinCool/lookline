import { expect, it } from 'vitest'
import { searchFromParams, searchToParams, shopHref } from './query'

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

it('round-trips every construction facet and the keywords, dropping what the vocabulary lacks', () => {
  const search = searchFromParams(
    new URLSearchParams(
      'silhouettes=a-line&silhouettes=wrap&excludedDetails=laceTrim&details=pockets&sleeves=long&sleeves=short&necklines=v-neck&printSubjects=character&printSubjects=none&materials=linen&excludedPatterns=leopard&fits=oversized&lengths=midi&closures=zip&details=hood&keywords=whale%7Corca%7C%E9%AF%A8%E9%AD%9A&keywords=hello+kitty&keywords=%22%3B+drop&keywords=floral',
    ),
  )
  expect(search).toMatchObject({
    silhouettes: ['a-line', 'wrap'],
    excludedDetails: ['laceTrim'],
    details: ['pockets'],
    sleeves: ['long', 'short'],
    necklines: ['v-neck'],
    printSubjects: ['character'],
    materials: ['linen'],
    excludedPatterns: ['leopard'],
    fits: ['oversized'],
    lengths: ['midi'],
    closures: ['zip'],
    // `floral` is a pattern the facets express, so it is never a keyword.
    keywords: ['whale|orca|鯨魚', 'hello kitty', 'drop'],
  })
  expect(search.excludedSleeves).toBeUndefined()
  const params = searchToParams(search)
  expect(params.getAll('keywords')).toEqual(['whale|orca|鯨魚', 'hello kitty', 'drop'])
  expect(params.getAll('silhouettes')).toEqual(['a-line', 'wrap'])
  expect(searchFromParams(params)).toEqual(search)
})

it('lets a selection win over the same value excluded, and removes a value through the href', () => {
  const search = searchFromParams(
    new URLSearchParams('sleeves=long&excludedSleeves=long&excludedSleeves=short'),
  )
  expect(search.sleeves).toEqual(['long'])
  expect(search.excludedSleeves).toEqual(['short'])
  expect(shopHref(search, { excludedSleeves: undefined, page: 3 })).toBe('/shop?sleeves=long')
  expect(shopHref(search, { keywords: ['whale'] })).toBe(
    '/shop?keywords=whale&sleeves=long&excludedSleeves=short',
  )
})
