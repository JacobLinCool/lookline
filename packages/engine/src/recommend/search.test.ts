import { createLocalDb } from '@lookline/db/node'
import { afterAll, describe, expect, it } from 'vitest'
import { aggregateFacets, buildSearchQuery, planSearch, scanQuery } from './search'

describe('scanQuery', () => {
  it('maps 中文 and English taxonomy terms to filters and keeps the residual text', () => {
    const zh = scanQuery('黑色帽T')
    expect(zh.subcategories).toEqual(['hoodie'])
    expect(zh.colorFamilies).toEqual(['black'])
    expect(zh.residual).toBe('')
    const en = scanQuery('minimalist black hoodie nike')
    expect(en.aesthetics).toEqual(['minimalist'])
    expect(en.colorFamilies).toEqual(['black'])
    expect(en.subcategories).toEqual(['hoodie'])
    expect(en.residual).toBe('nike')
    const longest = scanQuery('crop top linen')
    expect(longest.subcategories).toEqual(['crop-top'])
    expect(longest.materials).toEqual(['linen'])
    expect(scanQuery('linen shirt').subcategories).toEqual(['linen-shirt'])
    expect(longest.groups).toEqual([])
    expect(scanQuery('camel wool coat').colorFamilies).toEqual(['brown'])
    expect(scanQuery('camel wool coat').subcategories).toEqual(['wool-coat'])
  })
})

describe('buildSearchQuery', () => {
  const handle = createLocalDb(':memory:')
  afterAll(async () => {
    await handle.close()
  })

  it('uses OR within a facet, AND between facets and explicit exclusions in rows and counts', () => {
    const query = buildSearchQuery(handle.db, {
      categoryGroups: ['tops', 'outerwear'],
      colorFamilies: ['black', 'blue'],
      excludedColorFamilies: ['red'],
      excludedCategoryGroups: ['footwear'],
      excludedAesthetics: ['glam'],
      priceMax: 3000,
    })
    for (const statement of [query.page, query.total]) {
      const { sql, params } = statement.toSQL()
      expect(sql).toContain('"articles"."category_group" in (')
      expect(sql).toContain('"articles"."perceived_colour_master_name" in (')
      expect(sql).toContain('"articles"."perceived_colour_master_name" not in (')
      expect(params).toEqual(
        expect.arrayContaining(['tops', 'outerwear', 'black', 'blue', 'red', 'footwear', 3000]),
      )
    }
  })

  it('renders filters, the FTS5 text predicate, sort and pagination', () => {
    const { page, total, plan } = buildSearchQuery(handle.db, {
      q: 'nike hoodie',
      department: 'men',
      priceMin: 500,
      priceMax: 2000,
      brandId: 7,
      sort: 'price_asc',
      page: 2,
      pageSize: 24,
    })
    const { sql, params } = page.toSQL()
    expect(plan.text).toBe('nike')
    expect(plan.ftsExpr).toBe('"nike"*')
    expect(sql).toContain(
      'articles.rowid in (select rowid from articles_fts where articles_fts match ?)',
    )
    expect(sql).toContain('"articles"."department" =')
    expect(sql).toContain('"articles"."product_type_name" in (')
    expect(sql).toContain('"articles"."price" >=')
    expect(sql).toContain('"articles"."price" <=')
    expect(sql).toContain('"articles"."brand_id" =')
    expect(sql).toContain('order by "articles"."price" asc, "articles"."article_id" asc')
    expect(sql).toMatch(/limit \? offset \?$/)
    expect(sql).toContain('inner join "brands"')
    expect(sql).not.toContain('inner join "articles_fts"')
    expect(params).toContain('"nike"*')
    expect(params).toContain('men')
    expect(params).toContain('hoodie')
    expect(params).toContain(24)
    expect(params[params.length - 1]).toBe(24)
    expect(total.toSQL().sql).toContain('count(*)')
    expect(total.toSQL().sql).not.toContain('order by')
  })

  it('uses bm25 + cosine for relevance when text and a style vector exist, and each other sort', () => {
    const rel = buildSearchQuery(handle.db, { q: 'minimalist tote zephyr' }).page.toSQL().sql
    expect(rel).toContain('bm25(articles_fts)')
    expect(rel).toContain('articles_fts match')
    expect(rel).toContain('"article_vectors"."v')
    const vecOnly = buildSearchQuery(handle.db, { q: '極簡' }).page.toSQL().sql
    expect(vecOnly).not.toContain('bm25(')
    expect(vecOnly).toMatch(
      /order by \("article_vectors"\."v\d+"\*.*\) desc, "articles"\."article_id" asc/,
    )
    const pop = buildSearchQuery(handle.db, { sort: 'popular' }).page.toSQL().sql
    expect(pop).toContain('order by "articles"."popularity" desc')
    expect(buildSearchQuery(handle.db, { sort: 'trending' }).page.toSQL().sql).toContain(
      '"articles"."trend_score" desc',
    )
    expect(buildSearchQuery(handle.db, { sort: 'new' }).page.toSQL().sql).toContain(
      '"articles"."created_at" desc',
    )
    expect(buildSearchQuery(handle.db, { sort: 'price_desc' }).page.toSQL().sql).toContain(
      '"articles"."price" desc',
    )
    const facets = buildSearchQuery(handle.db, { categoryGroups: ['tops'] }).facets
    expect(facets.queryChunks.length).toBeGreaterThan(0)
  })

  it('clamps pagination and can drop the text predicate for the retry', () => {
    const plan = planSearch({ q: 'zzzz hoodie', pageSize: 5000, page: 0 })
    expect(plan.pageSize).toBe(100)
    expect(plan.page).toBe(1)
    expect(plan.lexiconFilters).toBe(true)
    const retry = planSearch({ q: 'zzzz hoodie' }, { withText: false })
    expect(retry.text).toBeNull()
    expect(retry.where.length).toBe(plan.where.length - 1)
  })
})

describe('aggregateFacets', () => {
  it('groups by dimension, sorts by count and caps at 12', () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => ({ dim: 'aesthetic', key: `a${i}`, n: i })),
      { dim: 'group', key: 'tops', n: 5 },
      { dim: 'group', key: 'bottoms', n: 9 },
      { dim: 'color', key: 'black', n: 3 },
      { dim: 'color', key: '', n: 3 },
    ]
    const f = aggregateFacets(rows)
    expect(f.aesthetics.length).toBe(12)
    expect(f.aesthetics[0]!.key).toBe('a14')
    expect(f.categoryGroups.map((x) => x.key)).toEqual(['bottoms', 'tops'])
    expect(f.colorFamilies).toEqual([{ key: 'black', count: 3 }])
  })
})
