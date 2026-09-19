import { describe, expect, it } from 'vitest'
import { generateBrands } from './brands'
import { DEFAULT_CATALOG_SEED } from './constants'
import { generateProduct } from './product'

const seed = DEFAULT_CATALOG_SEED

describe.skipIf(process.env.CI)('generation throughput', () => {
  it('generates ≥ 5 000 products/s (fresh plan and combo memo, 20 000 products)', () => {
    const brands = generateBrands(seed)
    const t = performance.now()
    for (let i = 1; i <= 20_000; i++) generateProduct(i, seed, brands)
    const cold = 20_000 / ((performance.now() - t) / 1000)
    const t2 = performance.now()
    for (let i = 1; i <= 20_000; i++) generateProduct(i, seed, brands)
    const warm = 20_000 / ((performance.now() - t2) / 1000)
    console.log(
      `generateProduct: ${Math.round(cold)}/s cold (incl. cell selection), ${Math.round(warm)}/s warm`,
    )
    expect(cold).toBeGreaterThanOrEqual(5000)
    expect(warm).toBeGreaterThanOrEqual(5000)
  })
})
