import { describe, expect, it } from 'vitest'
import { imagePath, toArticle } from './articles'
import { outfitRole } from './taxonomy'

const row = (over: Partial<Record<string, string>> = {}): Record<string, string> => ({
  article_id: '0108775015',
  product_code: '0108775',
  prod_name: 'Strap top',
  product_type_name: 'Vest top',
  product_group_name: 'Garment Upper body',
  graphical_appearance_name: 'Solid',
  colour_group_name: 'Black',
  perceived_colour_value_name: 'Dark',
  perceived_colour_master_name: 'Black',
  index_name: 'Ladieswear',
  index_group_name: 'Ladieswear',
  section_name: 'Womens Everyday Basics',
  garment_group_name: 'Jersey Basic',
  detail_desc: 'Jersey top with narrow shoulder straps.',
  ...over,
})

describe('outfitRole', () => {
  it('splits the upper body into the layer worn over and the one underneath', () => {
    expect(outfitRole('Garment Upper body', 'T-shirt')).toBe('top')
    expect(outfitRole('Garment Upper body', 'Cardigan')).toBe('top')
    expect(outfitRole('Garment Upper body', 'Jacket')).toBe('outer')
    expect(outfitRole('Garment Upper body', 'Blazer')).toBe('outer')
    expect(outfitRole('Garment Upper body', 'Tailored Waistcoat')).toBe('outer')
  })

  it('finds bags under Accessories, where 1280 of the 1305 live', () => {
    expect(outfitRole('Accessories', 'Bag')).toBe('bag')
    expect(outfitRole('Bags', 'Backpack')).toBe('bag')
    expect(outfitRole('Accessories', 'Scarf')).toBe('accessory')
  })

  it('pulls jewelry out of Accessories, but leaves sportswear and tailoring in their slot', () => {
    expect(outfitRole('Accessories', 'Earring')).toBe('jewelry')
    expect(outfitRole('Accessories', 'Necklace')).toBe('jewelry')
    // A running top still occupies the top slot; a blazer still occupies outer.
    expect(outfitRole('Garment Upper body', 'T-shirt')).toBe('top')
    expect(outfitRole('Garment Upper body', 'Blazer')).toBe('outer')
  })

  it('keeps a Garment Set out of the styling pool', () => {
    expect(outfitRole('Garment Full body', 'Dress')).toBe('full-body')
    expect(outfitRole('Garment Full body', 'Jumpsuit/Playsuit')).toBe('full-body')
    expect(outfitRole('Garment Full body', 'Garment Set')).toBe('set')
    expect(outfitRole('Garment Full body', 'Outdoor overall')).toBe('outer')
  })

  it('rejects everything that is not clothing, including unmapped groups', () => {
    expect(outfitRole('Furniture', 'Side table')).toBe('non-apparel')
    expect(outfitRole('Unknown', 'Unknown')).toBe('non-apparel')
    expect(outfitRole('Accessories', 'Soft Toys')).toBe('non-apparel')
    expect(outfitRole('Nonsense group', 'Nonsense type')).toBe('non-apparel')
  })
})

describe('toArticle', () => {
  it('keeps the leading zeros that the image path depends on', () => {
    const a = toArticle(row())
    expect(a.articleId).toBe('0108775015')
    expect(imagePath(a.articleId)).toBe('images/010/0108775015.jpg')
  })

  it('turns every spelling of missing into null', () => {
    const a = toArticle(
      row({
        detail_desc: '',
        garment_group_name: 'Unknown',
        perceived_colour_master_name: 'undefined',
        perceived_colour_value_name: 'Undefined',
      }),
    )
    expect(a.description).toBeNull()
    expect(a.garmentGroup).toBeNull()
    expect(a.colourFamily).toBeNull()
    expect(a.colourValue).toBeNull()
  })

  it('merges the spelling variants and resolves a swatch', () => {
    const a = toArticle(row({ product_type_name: 'Earrings', product_group_name: 'Accessories' }))
    expect(a.productType).toBe('Earring')
    expect(a.colourHex).toBe('#1C1C1C')
  })

  it('reads gender from index_group_name, not from department_name', () => {
    expect(toArticle(row({ index_group_name: 'Divided' })).department).toBe('women')
    expect(toArticle(row({ index_group_name: 'Baby/Children' })).department).toBe('kids')
    expect(toArticle(row({ index_group_name: 'Sport' })).department).toBe('unisex')
  })
})
