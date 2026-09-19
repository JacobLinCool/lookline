/**
 * `deriveLookStyle(products)`: the Look's aesthetics, palette and 64-d style vector derived from
 * its products (docs/CONTRACTS.md "createLook … computes aesthetics, palette, styleVector").
 */
import type { Product } from '@lookline/db'
import {
  AESTHETICS,
  aestheticIndex,
  blendVectors,
  normalizeVector,
  zeroVector,
} from '@lookline/catalog'
import type { LookStyle } from '../types'
import { luminance, normalizeHex } from './color'

const MAX_AESTHETICS = 5
/** Aesthetics below this fraction of the strongest one are dropped. */
const RELATIVE_FLOOR = 0.35

/**
 * Aesthetics: top tags of the mean aesthetic block (dims 0–31), at most 5, keeping only tags
 * with ≥ 35 % of the strongest weight; falls back to a vote over `product.aesthetics` when the
 * vectors carry no aesthetic mass. Palette: distinct product hexes ordered dark → light.
 * Style vector: L2-normalised mean of the product vectors.
 */
export function deriveLookStyle(
  products: ReadonlyArray<Pick<Product, 'styleVector' | 'aesthetics' | 'colorHex'>>,
): LookStyle {
  const vectors = products.map((p) => sanitizeVector(p.styleVector))
  const blend = vectors.length > 0 ? blendVectors(vectors) : zeroVector()

  const weights = AESTHETICS.map((a) => ({ slug: a.slug, weight: blend[a.index] ?? 0 }))
  const strongest = weights.reduce((m, a) => Math.max(m, a.weight), 0)
  let aesthetics: string[]
  if (strongest > 0) {
    aesthetics = weights
      .filter((a) => a.weight >= strongest * RELATIVE_FLOOR)
      .toSorted((x, y) => y.weight - x.weight || aestheticIndex(x.slug) - aestheticIndex(y.slug))
      .slice(0, MAX_AESTHETICS)
      .map((a) => a.slug)
  } else {
    const votes = new Map<string, number>()
    for (const p of products) {
      p.aesthetics.forEach((slug, i) => {
        if (aestheticIndex(slug) < 0) return
        votes.set(slug, (votes.get(slug) ?? 0) + (i === 0 ? 1 : 0.5))
      })
    }
    aesthetics = [...votes.entries()]
      .toSorted((x, y) => y[1] - x[1] || aestheticIndex(x[0]) - aestheticIndex(y[0]))
      .slice(0, MAX_AESTHETICS)
      .map(([slug]) => slug)
  }

  const seen = new Set<string>()
  const palette: string[] = []
  for (const p of products) {
    const hex = normalizeHex(p.colorHex)
    if (!hex || seen.has(hex)) continue
    seen.add(hex)
    palette.push(hex)
  }
  palette.sort((a, b) => luminance(a) - luminance(b) || a.localeCompare(b))

  return { aesthetics, palette, styleVector: normalizeVector(blend) }
}

function sanitizeVector(v: readonly number[] | null | undefined): number[] {
  const out = zeroVector()
  if (!v) return out
  for (let i = 0; i < out.length; i++) {
    const x = v[i]
    out[i] = typeof x === 'number' && Number.isFinite(x) ? x : 0
  }
  return out
}
