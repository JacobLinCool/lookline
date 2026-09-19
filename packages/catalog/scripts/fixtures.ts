/**
 * Regenerates the golden fixtures under `test-fixtures/`: the first 50 products of the default
 * catalog (`first50.json`) and `digest.txt` with the digests of the first 50 and of the full
 * 100k catalog at `CATALOG_VERSION`. Run after any table or draw-order change (bump the version).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateBrands } from '../src/generate/brands'
import { generateCatalog } from '../src/generate/catalog'
import {
  CATALOG_VERSION,
  DEFAULT_CATALOG_SEED,
  DEFAULT_CATALOG_SIZE,
} from '../src/generate/constants'
import { catalogDigest } from '../src/generate/digest'
import { generateProduct } from '../src/generate/product'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(here, '../test-fixtures')
mkdirSync(dir, { recursive: true })

const brands = generateBrands(DEFAULT_CATALOG_SEED)
const first50 = Array.from({ length: 50 }, (_, i) =>
  generateProduct(i + 1, DEFAULT_CATALOG_SEED, brands),
)
writeFileSync(path.join(dir, 'first50.json'), JSON.stringify(first50, null, 2) + '\n')
const digest50 = catalogDigest(first50)

const t = performance.now()
const digestFull = catalogDigest(
  generateCatalog({ seed: DEFAULT_CATALOG_SEED, size: DEFAULT_CATALOG_SIZE, brands }),
)
const secs = ((performance.now() - t) / 1000).toFixed(1)

writeFileSync(
  path.join(dir, 'digest.txt'),
  `version ${CATALOG_VERSION}\nseed ${DEFAULT_CATALOG_SEED}\nfirst50 ${digest50}\nfull${DEFAULT_CATALOG_SIZE} ${digestFull}\n`,
)
console.log(`wrote ${dir}/first50.json and digest.txt (full catalog generated in ${secs}s)`)
console.log(`first50 ${digest50}\nfull ${digestFull}`)
