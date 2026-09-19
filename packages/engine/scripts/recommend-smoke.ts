/**
 * Engine 02 smoke run against the seeded local catalog: recommend / searchProducts /
 * similarProducts / completeTheLook for 6 intents (3 中文, 3 English incl. a gift and an outfit),
 * printing timings and top results. Run: `pnpm --filter @lookline/engine exec tsx scripts/recommend-smoke.ts`.
 * When the articles table is empty it says so and exits 0.
 */
import { sql } from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'
import { parseIntentOffline } from '../src/intent'
import { completeTheLook, recommend, searchProducts, similarProducts } from '../src/recommend'
import type { EngineIntent } from '../src/recommend'
import type { RecommendResponse } from '../src/types'

loadEnv(process.cwd())
const handle = createLocalDb()
const { db } = handle

const base = (o: Partial<EngineIntent>): EngineIntent => ({
  utterance: '',
  locale: 'en',
  mode: 'single',
  categoryGroups: [],
  subcategories: [],
  colors: [],
  colorFamilies: [],
  aesthetics: [],
  materials: [],
  patterns: [],
  fits: [],
  recipient: { kind: 'self' },
  mustHave: [],
  mustAvoid: [],
  assumptions: [],
  clarifications: [],
  confidence: 1,
  ...o,
})

/** Hand-built intents (used when the offline parser is still a stub or disagrees). */
const INTENTS: Array<{ label: string; intent: EngineIntent }> = [
  {
    label: 'zh single: 黑色 oversize 帽T 三千以內',
    intent: base({
      utterance: '幫我找一件黑色的oversize帽T，三千以內',
      locale: 'mixed',
      department: 'women',
      categoryGroups: ['tops'],
      subcategories: ['hoodie'],
      colorFamilies: ['black'],
      fits: ['oversized'],
      budget: { max: 3000, currency: 'TWD', strictness: 'hard', scope: 'per_item' },
    }),
  },
  {
    label: 'zh outfit: 朋友婚禮 預算五千 不想太正式',
    intent: base({
      utterance: '下週要去朋友婚禮，預算五千，不想太正式',
      locale: 'zh-TW',
      mode: 'outfit',
      department: 'women',
      occasion: 'wedding-guest',
      season: 'autumn',
      aesthetics: ['quiet-luxury', 'romantic', 'glam', 'corporate-chic'],
      colorWeights: { neutral: 0.35, pink: 0.21, blue: 0.21 },
      mustAvoid: ['color:white'],
      axisTargets: { formality: 0.575, coverage: 0.6, boldness: 0.45, warmth: 0.6 },
      budget: { max: 5000, currency: 'TWD', strictness: 'soft', scope: 'total' },
    }),
  },
  {
    label: 'zh gift: 送女友 韓系簡約 三千左右 項鍊或耳環',
    intent: base({
      utterance: '送女友的生日禮物，她喜歡韓系簡約，三千左右，項鍊或耳環',
      locale: 'zh-TW',
      recipient: { kind: 'other', relation: 'partner', department: 'women', label: '女友' },
      department: 'women',
      categoryGroups: ['jewelry'],
      subcategories: ['necklace', 'earrings'],
      aesthetics: ['k-street', 'minimalist', 'clean-girl'],
      budget: { min: 2250, max: 3750, currency: 'TWD', strictness: 'soft', scope: 'per_item' },
    }),
  },
  {
    label: 'en gift: for my dad under $100, likes hiking',
    intent: base({
      utterance: 'gift for my dad under $100, he likes hiking',
      recipient: { kind: 'other', relation: 'father', department: 'men', label: 'my dad' },
      department: 'men',
      occasion: 'hiking',
      aesthetics: ['gorpcore', 'techwear', 'athleisure'],
      giftCategoryPrior: ['outerwear', 'footwear', 'accessories', 'activewear'],
      axisTargets: { formality: 0.1, coverage: 0.8, boldness: 0.4, warmth: 0.6 },
      budget: {
        max: 3200,
        currency: 'TWD',
        strictness: 'hard',
        scope: 'per_item',
        original: 'under $100',
      },
    }),
  },
  {
    label: 'en outfit: office outfit for summer, M, earth tones, no polyester',
    intent: base({
      utterance: 'office outfit for summer, medium, earth tones, no polyester',
      mode: 'outfit',
      department: 'women',
      occasion: 'office',
      season: 'summer',
      sizes: { alpha: 'M' },
      aesthetics: ['corporate-chic', 'minimalist', 'quiet-luxury', 'scandi'],
      colorWeights: {
        brown: 0.8,
        neutral: 0.8,
        green: 0.5,
        black: 0.28,
        white: 0.28,
        grey: 0.28,
        blue: 0.21,
      },
      mustAvoid: ['material:recycled-polyester', 'material:polyester'],
      axisTargets: { formality: 0.65, coverage: 0.7, boldness: 0.3, warmth: 0.15 },
      budget: { max: 8000, currency: 'TWD', strictness: 'soft', scope: 'total' },
    }),
  },
  {
    label: 'en single: warm coat for winter, camel or grey, around 6000',
    intent: base({
      utterance: 'I want a warm coat for winter, camel or grey, around 6000 NT',
      department: 'women',
      categoryGroups: ['outerwear'],
      subcategories: ['wool-coat', 'trench-coat', 'parka', 'puffer-jacket'],
      colors: ['camel', 'grey'],
      colorFamilies: ['brown', 'grey'],
      season: 'winter',
      axisTargets: { warmth: 1, coverage: 0.9 },
      budget: { min: 4500, max: 7500, currency: 'TWD', strictness: 'soft', scope: 'per_item' },
    }),
  },
]

const ms = (x: number): string => `${x.toFixed(1)} ms`
const fmt = (o: Record<string, number>): string =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${Number.isInteger(v) ? v : v.toFixed(1)}`)
    .join(' ')

function printResponse(res: RecommendResponse): void {
  console.log(`   candidates=${res.candidates} timings: ${fmt(res.timings)}`)
  for (const it of res.items.slice(0, 5)) {
    console.log(
      `   ${it.score.toFixed(3)}  #${it.product.id} ${it.brandName} · ${it.product.name} · NT$${it.product.price}`,
    )
    console.log(`          ${it.explanation.summary}`)
  }
  for (const o of res.outfits) {
    console.log(
      `   outfit ${o.id} total=${o.total} budget=${o.budget ?? '-'} compat=${o.compatibility.toFixed(2)}`,
    )
    console.log(`          ${o.explanation.summary}`)
    for (const it of o.items)
      console.log(
        `          [${it.role}] ${it.score.toFixed(3)} #${it.product.id} ${it.brandName} · ${it.product.name} · NT$${it.product.price}`,
      )
  }
}

async function main(): Promise<void> {
  const count = Number(
    (await db.all<{ c: number }>(sql`select count(*) as c from articles`))[0]?.c ?? 0,
  )
  const vectors = Number(
    (await db.all<{ c: number }>(sql`select count(*) as c from product_vectors`))[0]?.c ?? 0,
  )
  console.log(`articles=${count} product_vectors=${vectors}`)
  if (count === 0) {
    console.log('articles table is empty — nothing to smoke-test (run pnpm seed:catalog first)')
    return
  }
  const persona = (
    await db.all<{ id: string }>(sql`select id from users where is_persona = 1 order by id limit 1`)
  )[0]?.id
  console.log(`persona user: ${persona ?? 'none (guest context)'}`)

  let parserWorks = false
  try {
    const parsed = parseIntentOffline(INTENTS[0]!.intent.utterance)
    parserWorks = parsed.subcategories.includes('hoodie')
  } catch {
    parserWorks = false
  }
  console.log(`offline intent parser available: ${parserWorks}`)

  const summary: string[] = []
  for (const { label, intent } of INTENTS) {
    console.log(`\n== ${label}`)
    const req = { intent, userId: persona, limit: 10, outfitCount: 3 }
    await recommend(db, req) // warm-up (plan cache)
    const t0 = performance.now()
    const res = await recommend(db, req)
    const total = performance.now() - t0
    console.log(`   warm recommend: ${ms(total)}`)
    summary.push(
      `${label}: ${ms(total)} (candidates ${res.candidates}, items ${res.items.length}, outfits ${res.outfits.length})`,
    )
    printResponse(res)
  }

  console.log('\n== searchProducts')
  const queries = [
    { q: '黑色帽T' },
    { q: 'linen shirt', department: 'men' as const },
    { q: 'minimalist tote', sort: 'popular' as const },
    { q: 'camel wool coat', priceMax: 8000 },
    { categoryGroup: 'footwear' as const, sort: 'trending' as const, page: 2 },
  ]
  for (const q of queries) {
    await searchProducts(db, q)
    const t0 = performance.now()
    const r = await searchProducts(db, q)
    const total = performance.now() - t0
    console.log(
      `   ${JSON.stringify(q)} → total=${r.total} page=${r.page}/${r.pageSize} facets(g/c/a)=${r.facets?.categoryGroups.length}/${r.facets?.colorFamilies.length}/${r.facets?.aesthetics.length} ${ms(total)}`,
    )
    for (const it of r.items.slice(0, 3))
      console.log(`      #${it.id} ${it.brandName} · ${it.name} · NT$${it.price}`)
    summary.push(`search ${JSON.stringify(q)}: ${ms(total)} (total ${r.total})`)
  }

  const anchor = (
    await db.all<{ id: string }>(
      sql`select article_id as id from articles where category_group = 'tops' and department = 'women' order by popularity desc limit 1`,
    )
  )[0]?.id
  if (anchor) {
    console.log(`\n== similarProducts(#${anchor})`)
    await similarProducts(db, anchor, { limit: 6 })
    let t0 = performance.now()
    const sim = await similarProducts(db, anchor, { limit: 6, userId: persona })
    let total = performance.now() - t0
    console.log(`   ${ms(total)}`)
    for (const it of sim)
      console.log(
        `   ${it.score.toFixed(3)} #${it.product.id} ${it.brandName} · ${it.product.name} · NT$${it.product.price} — ${it.explanation.summary}`,
      )
    summary.push(`similarProducts: ${ms(total)} (${sim.length} items)`)

    console.log(`\n== completeTheLook(#${anchor}, budget 8000)`)
    await completeTheLook(db, anchor, { budget: 8000, count: 2 })
    t0 = performance.now()
    const outfits = await completeTheLook(db, anchor, { budget: 8000, count: 2, userId: persona })
    total = performance.now() - t0
    console.log(`   ${ms(total)}`)
    for (const o of outfits) {
      console.log(
        `   outfit ${o.id} total=${o.total} compat=${o.compatibility.toFixed(2)} — ${o.explanation.summary}`,
      )
      for (const it of o.items)
        console.log(
          `      [${it.role}] #${it.product.id} ${it.brandName} · ${it.product.name} · NT$${it.product.price}`,
        )
    }
    summary.push(`completeTheLook: ${ms(total)} (${outfits.length} outfits)`)
  }

  console.log('\n== timing summary')
  for (const line of summary) console.log(`   ${line}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => handle.close())
