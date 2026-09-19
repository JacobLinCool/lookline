/**
 * `deriveLookStyle(articles)`: the Look's aesthetics, palette and 64-d style vector derived from
 * its articles (docs/CONTRACTS.md "createLook … computes aesthetics, palette, styleVector").
 */
import type { Article } from '@lookline/db'
import { blendVectors, normalizeVector, zeroVector } from '@lookline/catalog'
import type { LookStyle } from '../types'
import { luminance, normalizeHex } from './color'

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

  // The aesthetic dimensions are gone, so a Look reports no aesthetics. Reading them off the
  // first 32 dimensions would name colours as styles, which is what it did until this changed.
  const aesthetics: string[] = []

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
