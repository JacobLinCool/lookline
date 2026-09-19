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

describe('scanQuery in Chinese', () => {
  it('does not read a one-character term out of the middle of a word', () => {
    // `麻` is linen and `麻花` is a cable knit. Matching the one inside the other turned a search
    // for cable knits into a search for linen, and consumed the query so nothing else ran.
    const cable = scanQuery('麻花')
    expect(cable.materials).toEqual([])
    expect(cable.residual).toBe('麻花')
    // Standing on its own it is still linen, and a longer term still wins.
    expect(scanQuery('麻').materials).toEqual(['linen'])
    expect(scanQuery('亞麻襯衫').subcategories).toEqual(['linen-shirt'])
  })

  it('keeps a Chinese residual, which the ASCII-only check threw away', () => {
    // With no residual there is no text predicate, so `荷葉邊` filtered on nothing at all.
    expect(scanQuery('荷葉邊').residual).toBe('荷葉邊')
    expect(scanQuery('落肩').residual).toBe('落肩')
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
      expect(sql).toContain('"articles"."colour_family" in (')
      expect(sql).toContain('"articles"."colour_family" not in (')
      expect(params).toEqual(
        expect.arrayContaining(['tops', 'outerwear', 'black', 'blue', 'red', 'footwear', 3000]),
      )
    }
  })

  it('filters on the aesthetics column and counts it as a facet', () => {
    const query = buildSearchQuery(handle.db, {
      aesthetics: ['quiet-luxury', 'minimalist'],
      excludedAesthetics: ['glam'],
    })
    const { sql, params } = query.page.toSQL()
    // A JSON array column, so membership is json_each rather than IN.
    expect(sql).toContain('json_each("articles"."aesthetics")')
    expect(sql).toContain('not exists')
    expect(params).toEqual(expect.arrayContaining(['quiet-luxury', 'minimalist', 'glam']))
  })

  it('emits the aesthetic facet dimension that aggregateFacets reads', () => {
    const { facets } = buildSearchQuery(handle.db, { categoryGroups: ['tops'] })
    const rendered = (
      handle.db as unknown as { dialect: { sqlToQuery: (q: typeof facets) => { sql: string } } }
    ).dialect.sqlToQuery(facets).sql
    expect(rendered).toContain("'aesthetic'")
    expect(rendered).toContain('json_each(sample.aesthetics)')
  })

  it('counts facets over every matching row, never a slice of the planner scan order', () => {
    // A `limit` here samples whatever index the planner picks. Under `category_group IN (…)` that
    // is the category index, so the slice is all one group and every other group counts zero.
    // Rendered through the dialect because a raw `sql` chunk keeps its text in `value[]`.
    const { facets } = buildSearchQuery(handle.db, { categoryGroups: ['bottoms', 'dresses'] })
    const rendered = (
      handle.db as unknown as { dialect: { sqlToQuery: (q: typeof facets) => { sql: string } } }
    ).dialect.sqlToQuery(facets).sql
    expect(rendered).toContain('group by')
    expect(rendered.toLowerCase()).not.toContain('limit')
  })

  it('narrows on an aesthetic named in free text, not only in the style vector', () => {
    expect(planSearch({ q: 'minimalist black hoodie' }).lexiconFilters).toBe(true)
    const { sql, params } = buildSearchQuery(handle.db, {
      q: 'minimalist black hoodie',
    }).page.toSQL()
    expect(sql).toContain('json_each("articles"."aesthetics")')
    expect(params).toEqual(expect.arrayContaining(['minimalist', 'black', 'hoodie']))
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

  // Counts are exact: the facet query groups the whole filtered set rather than a capped head
  // of it, so there is no sample to scale back up.
  it('counts are the exact row counts', () => {
    const rows = [{ dim: 'group', key: 'tops', n: 1130 }]
    expect(aggregateFacets(rows).categoryGroups[0]!.count).toBe(1130)
  })
})
