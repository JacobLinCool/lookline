import { createLocalDb } from '@lookline/db/node'
import { afterAll, describe, expect, it } from 'vitest'
import {
  MemoryRetriever,
  SqlRetriever,
  emptyParams,
  matchesParams,
  retrieveWithRelaxation,
} from './retrieve'
import type { RetrieveParams, Retriever } from './retrieve'
import { makeCatalog, makeIntent } from './testing/fixtures'
import { fallbackIntentVector } from './intent-vector'
import { RETRIEVAL_BLOCK_WEIGHTS, blockScale } from './vector'

const rows = makeCatalog(800, 42)
const retriever = new MemoryRetriever(rows)
const vector = blockScale(
  fallbackIntentVector(
    makeIntent({ aesthetics: ['minimalist'], colorFamilies: ['black'], categoryGroups: ['tops'] }),
  ),
  RETRIEVAL_BLOCK_WEIGHTS,
)

describe('MemoryRetriever', () => {
  it('applies every prefilter and orders by cosine', async () => {
    const params: RetrieveParams = emptyParams(vector, {
      departments: ['women', 'unisex'],
      categoryGroups: ['tops'],
      priceMin: 500,
      priceMax: 3000,
      excludeColorFamilies: ['red'],
      excludeMaterials: ['silk'],
      excludeSubcategories: ['blouse'],
      limit: 50,
    })
    const out = await retriever.retrieve(params)
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThanOrEqual(50)
    for (const c of out) {
      expect(['women', 'unisex']).toContain(c.product.department)
      expect(c.product.categoryGroup).toBe('tops')
      expect(c.product.price).toBeGreaterThanOrEqual(500)
      expect(c.product.price).toBeLessThanOrEqual(3000)
      expect(c.product.colorFamily).not.toBe('red')
      expect(c.product.material).not.toBe('silk')
      expect(c.product.subcategory).not.toBe('blouse')
      expect(c.product.stock).toBeGreaterThan(0)
      expect(c.channels.has('vector')).toBe(true)
      expect(c.brandName.length).toBeGreaterThan(0)
    }
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.cos).toBeGreaterThanOrEqual(out[i]!.cos)
    // brute-force equality
    const expected = rows.filter((r) => matchesParams(r, params)).length
    expect(out.length).toBe(Math.min(50, expected))
  })

  it('isolates kids and honours attribute have/avoid and product exclusions', async () => {
    const kids = await retriever.retrieve(
      emptyParams(vector, { departments: ['kids'], limit: 500 }),
    )
    expect(kids.length).toBeGreaterThan(0)
    for (const c of kids) expect(c.product.department).toBe('kids')
    const hooded = await retriever.retrieve(
      emptyParams(vector, { requireAttributes: { hood: true }, limit: 500 }),
    )
    expect(hooded.length).toBeGreaterThan(0)
    for (const c of hooded) expect(c.product.attributes.hood).toBe(true)
    const noHood = await retriever.retrieve(
      emptyParams(vector, { excludeAttributes: { hood: true }, limit: 500 }),
    )
    for (const c of noHood) expect(c.product.attributes.hood).not.toBe(true)
    const firstId = hooded[0]!.product.id
    const excluded = await retriever.retrieve(
      emptyParams(vector, {
        requireAttributes: { hood: true },
        excludeProductIds: [firstId],
        limit: 500,
      }),
    )
    expect(excluded.some((c) => c.product.id === firstId)).toBe(false)
  })

  it('unions the social and trend channels with evidence', async () => {
    const target = rows.find((r) => r.stock > 0 && r.department === 'women')!
    const social = new MemoryRetriever(rows, [
      {
        productId: target.id,
        userId: 'u_2',
        kind: 'look',
        lookId: 'lk_1',
        at: new Date(Date.UTC(2026, 8, 10)),
      },
    ])
    const out = await social.retrieve(
      emptyParams(vector, { departments: ['women'], limit: 5, categoryGroups: ['jewelry'] }),
      {
        social: { trusted: [{ userId: 'u_2', displayName: 'Alice', strength: 0.7 }] },
        trend: {
          aesthetics: [
            { dimension: 'aesthetic', key: target.aesthetics[0]!, momentum: 80, emerging: true },
          ],
          categories: [],
        },
      },
    )
    const hit = out.find((c) => c.product.id === target.id)
    // the jewelry group filter also applies to the channels
    if (target.categoryGroup === 'jewelry') {
      expect(hit).toBeDefined()
      expect(hit!.channels.has('social')).toBe(true)
      expect(hit!.socialEvidence[0]!.displayName).toBe('Alice')
    } else expect(hit).toBeUndefined()
    const open = await social.retrieve(emptyParams(vector, { departments: ['women'], limit: 5 }), {
      social: { trusted: [{ userId: 'u_2', displayName: 'Alice', strength: 0.7 }] },
      trend: {
        aesthetics: [
          { dimension: 'aesthetic', key: target.aesthetics[0]!, momentum: 80, emerging: true },
        ],
        categories: [],
      },
    })
    const found = open.find((c) => c.product.id === target.id)!
    expect(found.channels.has('social')).toBe(true)
    expect(found.channels.has('trend')).toBe(true)
    expect(found.trendEvidence?.momentum).toBe(80)
    expect(open.filter((c) => c.channels.has('trend')).length).toBeLessThanOrEqual(30 + 5)
  })
})

describe('relaxation ladder', () => {
  it('drops subcategories, widens price, adds unisex, drops colour exclusions in order', async () => {
    const params = emptyParams(vector, {
      departments: ['men'],
      categoryGroups: ['tops'],
      subcategories: ['evening-gown'],
      priceMax: 200,
      excludeColorFamilies: ['black'],
      limit: 100,
    })
    const result = await retrieveWithRelaxation(retriever, params, {}, { allowDropGroups: false })
    expect(result.relaxed[0]).toBe('subcategories')
    expect(result.relaxed).toEqual(
      result.relaxed.toSorted(
        (a, b) =>
          ['subcategories', 'price', 'unisex', 'color', 'groups'].indexOf(a) -
          ['subcategories', 'price', 'unisex', 'color', 'groups'].indexOf(b),
      ),
    )
    expect(result.params.subcategories).toBeNull()
    expect(result.relaxed).not.toContain('groups')
    if (result.relaxed.includes('price')) expect(result.params.priceMax).toBe(250)
    if (result.relaxed.includes('unisex')) expect(result.params.departments).toContain('unisex')
  })
  it('records each step once and drops groups only when allowed', async () => {
    const calls: RetrieveParams[] = []
    const stub: Retriever = {
      retrieve: (p) => {
        calls.push(p)
        return Promise.resolve([])
      },
    }
    const params = emptyParams(vector, {
      departments: ['kids'],
      categoryGroups: ['tops'],
      subcategories: ['tee'],
      priceMax: 1000,
      excludeColorFamilies: ['red'],
    })
    const r = await retrieveWithRelaxation(stub, params, {}, { allowDropGroups: true })
    expect(r.relaxed).toEqual(['subcategories', 'price', 'color', 'groups'])
    expect(calls.length).toBe(5)
    expect(calls[4]!.categoryGroups).toBeNull()
    expect(calls.every((c) => !c.departments.includes('unisex'))).toBe(true)
  })
})

describe('SqlRetriever.buildQuery', () => {
  const handle = createLocalDb(':memory:')
  afterAll(async () => {
    await handle.close()
  })
  it('renders the expected predicates, the cosine ORDER BY and the limit', () => {
    const pg = new SqlRetriever(handle.db)
    const params = emptyParams(vector, {
      departments: ['women', 'unisex'],
      categoryGroups: ['tops'],
      subcategories: ['hoodie'],
      priceMax: 3000,
      excludeColorFamilies: ['red'],
      excludeBrandIds: [3],
      excludeProductIds: [11],
      requireAttributes: { hood: true },
      limit: 300,
    })
    const { sql, params: values } = pg.buildQuery(params).toSQL()
    expect(sql).toContain('"products"."stock" >')
    expect(sql).toContain('"products"."department" in (')
    expect(sql).toContain('"products"."category_group" in (')
    expect(sql).toContain('"products"."subcategory" in (')
    expect(sql).toContain('"products"."price" <=')
    expect(sql).toContain('"products"."color_family" not in (')
    expect(sql).toContain('"products"."brand_id" not in (')
    expect(sql).toContain('"products"."id" not in (')
    expect(sql).toContain('json_type("products"."attributes", ?) = \'true\'')
    expect(sql).toMatch(
      /order by \("product_vectors"\."v\d+"\*-?[\d.]+.*\) desc, "products"\."id" asc/,
    )
    expect(sql).toContain('inner join "brands"')
    expect(sql).toContain('inner join "product_vectors"')
    expect(sql).toMatch(/limit \?$/)
    expect(values).toContain('women')
    expect(values).toContain('hoodie')
    expect(values).toContain(3000)
    expect(values).toContain(300)
    expect(values).toContain('$."hood"')
  })
  it('omits unused predicates', () => {
    const pg = new SqlRetriever(handle.db)
    const { sql } = pg.buildQuery(emptyParams(vector)).toSQL()
    expect(sql).not.toContain('"products"."category_group" in (')
    expect(sql).not.toContain('not in')
    expect(sql).not.toContain('json_type')
  })
})
