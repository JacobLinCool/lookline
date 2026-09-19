/**
 * Catalog iteration (CATALOG_SPEC §10.2): `generateCatalog` stays a generator (contract stub);
 * `iterateCatalog` yields chunks of `{ product, createdAt }` rows for the seed script.
 */
import type { CatalogGenOptions, GeneratedProduct } from '../types'
import { generateBrands } from './brands'
import { generateProduct, generateProductRow, type ProductRow } from './product'

export function* generateCatalog(
  options: CatalogGenOptions,
): Generator<GeneratedProduct, void, undefined> {
  const brands = options.brands ?? generateBrands(options.seed)
  for (let i = 1; i <= options.size; i++)
    yield generateProduct(i, options.seed, brands, options.size)
}

export interface IterateOptions extends CatalogGenOptions {
  /** Rows per chunk (default 2000). */
  chunk?: number
  /** 1-based first index (default 1) — lets a resumed seed skip ahead. */
  from?: number
}

export function* iterateCatalog(options: IterateOptions): Generator<ProductRow[], void, undefined> {
  const brands = options.brands ?? generateBrands(options.seed)
  const chunk = Math.max(1, options.chunk ?? 2000)
  let batch: ProductRow[] = []
  for (let i = options.from ?? 1; i <= options.size; i++) {
    batch.push(generateProductRow(i, options.seed, brands, options.size))
    if (batch.length >= chunk) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) yield batch
}
