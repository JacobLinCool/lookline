/**
 * Retrieval eval over the seeded local catalog, for both paths a shopper reaches: `searchProducts`
 * (the shop's query box) and `recommend` (the sentence/voice flow). A query set with a
 * machine-checkable notion of relevance, printed as hits / precision@24 / recall@24 against the
 * truth set, and for `recommend` whether the garment filter survived retrieval at all.
 * Run: `pnpm --filter @lookline/engine exec tsx scripts/search-eval.ts`
 */
import { sql } from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'
import type { Article } from '@lookline/db'
import { recommend } from '../src/recommend'
import type { EngineIntent } from '../src/recommend'
import { searchProducts } from '../src/recommend/search'

loadEnv(process.cwd())
const { db } = createLocalDb()

/** `relevant` is the SQL truth set; a result row is judged by the same predicate. */
interface Case {
  q: string
  where: string
}

const CASES: Case[] = [
  // --- garment word alone (the lexicon's bread and butter) ---
  { q: '牛仔褲', where: `product_type_name='Trousers' and material='denim'` },
  { q: '牛仔外套', where: `product_type_name='Jacket' and material='denim'` },
  { q: '亞麻襯衫', where: `product_type_name='Shirt' and material='linen'` },
  { q: '高領毛衣', where: `product_type_name='Sweater' and neckline in ('turtle','mock')` },
  { q: '短裙', where: `product_type_name='Skirt' and length='mini'` },
  { q: '寬褲', where: `product_type_name='Trousers' and fit='wide'` },
  { q: '衛衣', where: `product_type_name in ('Sweater','Hoodie') and category_group='tops'` },
  { q: '帽T', where: `product_type_name='Hoodie'` },
  { q: '洋裝', where: `category_group='dresses'` },
  { q: '裙子', where: `product_type_name='Skirt'` },
  { q: '襯衫', where: `product_type_name='Shirt'` },
  { q: '西裝外套', where: `product_type_name='Blazer'` },
  { q: '運動內衣', where: `product_type_name='Bra'` },
  { q: '工裝褲', where: `product_type_name='Trousers' and pocket_style='cargo'` },
  { q: '針織外套', where: `product_type_name='Cardigan'` },
  { q: '短褲', where: `product_type_name='Shorts'` },
  // --- colour + garment ---
  { q: '黑色洋裝', where: `category_group='dresses' and colour_family='black'` },
  {
    q: '白色蕾絲上衣',
    where: `category_group='tops' and colour_family='white' and material='lace'`,
  },
  { q: '米白色針織衫', where: `product_type_name='Sweater' and colour_family='white'` },
  // --- pattern / material + garment ---
  {
    q: '格紋襯衫',
    where: `product_type_name='Shirt' and pattern in ('plaid','gingham','houndstooth')`,
  },
  {
    q: '碎花洋裝',
    where: `category_group='dresses' and pattern in ('ditsy-floral','bold-floral')`,
  },
  { q: '燈芯絨褲子', where: `category_group='bottoms' and material='corduroy'` },
  // --- a described garment, no single lexicon word ---
  { q: '有口袋的工裝褲', where: `product_type_name='Trousers' and pocket_style='cargo'` },
  { q: '露肩上衣', where: `category_group='tops' and neckline='off-shoulder'` },
  { q: '高腰寬褲', where: `product_type_name='Trousers' and fit='wide' and rise='high'` },
  {
    q: '寬鬆牛仔褲',
    where: `product_type_name='Trousers' and material='denim' and fit in ('relaxed','wide','straight')`,
  },
  { q: '約會穿的裙子', where: `product_type_name='Skirt'` },
  { q: '面試穿的西裝外套', where: `product_type_name='Blazer'` },
  { q: '通勤襯衫', where: `product_type_name='Shirt'` },
  { q: '夏天海邊度假洋裝', where: `category_group='dresses'` },
  // --- English control ---
  { q: 'denim jacket', where: `product_type_name='Jacket' and material='denim'` },
  { q: 'linen shirt', where: `product_type_name='Shirt' and material='linen'` },
  { q: 'wide leg trousers', where: `product_type_name='Trousers' and fit='wide'` },
  { q: 'black dress', where: `category_group='dresses' and colour_family='black'` },
]

const relevantIds = async (where: string): Promise<Set<string>> => {
  const rows = (await db.all<any>(
    sql.raw(`select article_id from articles where ${where}`),
  )) as any[]
  return new Set(rows.map((r) => String(r.article_id ?? r[0])))
}

const K = 24
let sumP = 0
let sumR = 0
let zeros = 0
console.log('query              hits   |truth|   P@24   R@24  top types in page 1')
for (const c of CASES) {
  const truth = await relevantIds(c.where)
  const res = await searchProducts(db, { q: c.q, pageSize: K })
  const items = res.items as Article[]
  const hitsInTop = items.filter((a) => truth.has(a.id)).length
  const p = items.length === 0 ? 0 : hitsInTop / items.length
  // Recall of page one. Counting the whole result set against the truth would need the plan the
  // retry ladder settled on; what a shopper sees is the first page, and a large total full of
  // the wrong garment is not recall.
  const r = truth.size === 0 ? 0 : hitsInTop / Math.min(K, truth.size)
  if (res.total === 0) zeros++
  sumP += p
  sumR += r
  const byType = new Map<string, number>()
  for (const a of items) byType.set(a.subcategory, (byType.get(a.subcategory) ?? 0) + 1)
  const top = [...byType]
    .toSorted((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([t, n]) => `${t}×${n}`)
    .join(' ')
  console.log(
    c.q.padEnd(18),
    String(res.total).padStart(6),
    String(truth.size).padStart(8),
    p.toFixed(2).padStart(7),
    r.toFixed(2).padStart(7),
    ' ' + top,
  )
}
const n = CASES.length
console.log(
  `\nmean P@${K} ${(sumP / n).toFixed(3)}   mean R@${K} ${(sumR / n).toFixed(3)}   zero-result ${zeros}/${n}`,
)

// ---------------------------------------------------------------------------
// `recommend` — the same garments, asked for as an intent rather than a query.
// ---------------------------------------------------------------------------

const intent = (o: Partial<EngineIntent>): EngineIntent =>
  ({
    utterance: '',
    locale: 'zh-TW',
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
    sizes: {},
    mustHave: [],
    mustAvoid: [],
    assumptions: [],
    clarifications: [],
    confidence: 1,
    axisTargets: {},
    colorWeights: {},
    ...o,
  }) as EngineIntent

const INTENTS: Array<{ label: string; subs: string[]; groups: string[]; where: string }> = [
  {
    label: '牛仔外套',
    subs: ['denim-jacket'],
    groups: ['outerwear'],
    where: `product_type_name='Jacket' and material='denim'`,
  },
  {
    label: '高領毛衣',
    subs: ['turtleneck'],
    groups: ['tops'],
    where: `product_type_name='Sweater' and neckline in ('turtle','mock')`,
  },
  {
    label: '寬褲',
    subs: ['wide-leg-trousers'],
    groups: ['bottoms'],
    where: `product_type_name='Trousers' and fit='wide'`,
  },
  {
    label: '西裝外套',
    subs: ['blazer'],
    groups: ['tailoring'],
    where: `product_type_name='Blazer'`,
  },
  {
    label: '短裙',
    subs: ['mini-skirt'],
    groups: ['bottoms'],
    where: `product_type_name='Skirt' and length='mini'`,
  },
  {
    label: '運動內衣',
    subs: ['sports-bra'],
    groups: ['activewear'],
    where: `product_type_name='Bra'`,
  },
]

console.log('\nrecommend()      P@8   relaxed        top types')
let sumRp = 0
for (const c of INTENTS) {
  const truth = await relevantIds(c.where)
  const res = await recommend(db, {
    intent: intent({
      utterance: c.label,
      subcategories: c.subs,
      categoryGroups: c.groups as never,
    }),
    limit: 8,
  })
  const hit = res.items.filter((it) => truth.has(it.product.id)).length
  const p = res.items.length === 0 ? 0 : hit / res.items.length
  sumRp += p
  const relaxed = Object.keys(res.timings)
    .filter((k) => k.startsWith('relaxed:'))
    .map((k) => k.slice('relaxed:'.length))
    .join(',')
  const types = [...new Set(res.items.map((it) => it.product.subcategory))].join(', ')
  console.log(c.label.padEnd(14), p.toFixed(2).padStart(5), (relaxed || '-').padEnd(14), types)
}
console.log(`\nmean P@8 ${(sumRp / INTENTS.length).toFixed(3)}`)
