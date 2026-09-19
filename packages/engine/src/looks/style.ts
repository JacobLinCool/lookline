/**
 * `deriveLookStyle(articles)`: the Look's aesthetics, palette and 64-d style vector derived from
 * its articles (docs/CONTRACTS.md "createLook … computes aesthetics, palette, styleVector").
 */
import type { Article } from '@lookline/db'
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
 * with ≥ 35 % of the strongest weight. Empty while the catalogue tags nothing — the articles
 * carry no aesthetic column and those dimensions of the style vector stay zero, so there is
 * nothing to average and nothing to fall back on. Palette: distinct product hexes, dark → light.
 * Style vector: L2-normalised mean of the product vectors.
 */
export function deriveLookStyle(
  articles: ReadonlyArray<Pick<Article, 'styleVector' | 'colorHex'>>,
): LookStyle {
  const vectors = articles.map((p) => sanitizeVector(p.styleVector))
  const blend = vectors.length > 0 ? blendVectors(vectors) : zeroVector()

  const weights = AESTHETICS.map((a) => ({ slug: a.slug, weight: blend[a.index] ?? 0 }))
  const strongest = weights.reduce((m, a) => Math.max(m, a.weight), 0)
  const aesthetics =
    strongest > 0
      ? weights
          .filter((a) => a.weight >= strongest * RELATIVE_FLOOR)
          .toSorted(
            (x, y) => y.weight - x.weight || aestheticIndex(x.slug) - aestheticIndex(y.slug),
          )
          .slice(0, MAX_AESTHETICS)
          .map((a) => a.slug)
      : []

  const seen = new Set<string>()
  const palette: string[] = []
  for (const p of articles) {
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
