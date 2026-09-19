/**
 * Read `data/hm/articles.csv`, map it to the fields the recommender uses, and write
 * `data/hm/articles.jsonl`. Prints the distributions worth eyeballing before the schema is fixed.
 *
 *   HM_DIR   directory holding the Kaggle csv files (default <repo>/data/hm)
 */
import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COLOUR_HEX, STYLEABLE_ROLES, type Article, loadArticles } from '../src/index'

const dir = process.env.HM_DIR ?? fileURLToPath(new URL('../../../data/hm', import.meta.url))
const started = performance.now()
const articles = loadArticles(`${dir}/articles.csv`)
console.log(
  `read ${articles.length} articles in ${((performance.now() - started) / 1000).toFixed(1)}s\n`,
)

const tally = <K extends keyof Article>(key: K): [string, number][] => {
  const counts = new Map<string, number>()
  for (const a of articles) {
    const v = String(a[key] ?? '∅')
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts].toSorted((x, y) => y[1] - x[1])
}

const show = (label: string, rows: [string, number][], limit = 40): void => {
  console.log(`=== ${label} (${rows.length}) ===`)
  for (const [v, n] of rows.slice(0, limit)) {
    const pct = ((n / articles.length) * 100).toFixed(1)
    console.log(`  ${String(n).padStart(7)}  ${pct.padStart(5)}%  ${v}`)
  }
  console.log()
}

show('outfitRole', tally('outfitRole'))
show('department', tally('department'))
show('indexName', tally('indexName'))

console.log('=== null rate ===')
for (const key of [
  'description',
  'garmentGroup',
  'section',
  'colourName',
  'colourFamily',
  'colourValue',
  'pattern',
  'colourHex',
] as const) {
  const n = articles.filter((a) => a[key] === null).length
  console.log(
    `  ${key.padEnd(14)} ${String(n).padStart(6)}  ${((n / articles.length) * 100).toFixed(2)}%`,
  )
}

// A colour name with no swatch would render as a blank chip, so fail loudly instead.
const unmapped = [
  ...new Set(
    articles.map((a) => a.colourName).filter((c): c is string => c !== null && !(c in COLOUR_HEX)),
  ),
]
console.log(`\ncolour names without a hex: ${unmapped.length === 0 ? 'none' : unmapped.join(', ')}`)

// Underwear, swimwear, socks, nightwear and ready-made sets are sold but never styled into a look.
const roles = new Set<string>(STYLEABLE_ROLES)
const styleable = articles.filter((a) => roles.has(a.outfitRole))
const codes = new Set(articles.map((a) => a.productCode))
console.log(
  `\nstyleable ${styleable.length} · not styled ${articles.length - styleable.length} · distinct garments ${codes.size}`,
)

const out = createWriteStream(`${dir}/articles.jsonl`)
for (const a of articles) out.write(`${JSON.stringify(a)}\n`)
out.end(() => console.log(`\nwrote ${dir}/articles.jsonl`))
