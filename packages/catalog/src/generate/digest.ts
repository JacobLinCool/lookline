/**
 * Golden digest of a product list (CATALOG_SPEC §10.3): SHA-256 over the lines
 * `id|slug|price|dupKey|styleVector.join(',')`. Kept out of the package barrel because it needs
 * `node:crypto`; scripts and tests import it by path.
 */
import { createHash } from 'node:crypto'
import type { GeneratedProduct } from '../types'
import { duplicateKey } from './product'

export function digestLine(p: GeneratedProduct): string {
  return `${p.id}|${p.slug}|${p.price}|${duplicateKey(p)}|${p.styleVector.join(',')}`
}

export function catalogDigest(products: Iterable<GeneratedProduct>): string {
  const hash = createHash('sha256')
  for (const p of products) hash.update(digestLine(p) + '\n')
  return hash.digest('hex')
}
