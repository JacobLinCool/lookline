/**
 * SVG product renderer (docs/specs/CATALOG_SPEC.md §9). Pure string templating: no DOM, no
 * library, deterministic for a given input, well under 1 ms per render.
 *
 * Layers (§9.1): background tint from the first aesthetic → defs (clip, shade
 * gradient, pattern tile) → drop shadow → body → pattern overlay → shade → accent / trim /
 * straps / hardware / detail / buttons → outline → kids confetti.
 */
import { hashSeed } from '../rng'
import type { ProductRenderInput } from '../types'
import {
  FALLBACK_BG,
  GOLD_HEX,
  GUNMETAL_HEX,
  LIGHT_OUTLINE,
  MULTICOLOUR_HEX,
  backgroundFor,
  darken,
  escapeXml,
  hardwareColorFor,
  lighten,
  lightness,
  normalizeHex,
  safeHex,
} from './palette'
import { patternDef, patternKind } from './patterns'
import { resolveSilhouette, type Silhouette } from './silhouettes'

export * from './palette'
export * from './patterns'
export * from './silhouettes'

/** `ProductRenderInput` plus the optional `department` of §9 (kids treatment). */
export type RenderInput = ProductRenderInput & { department?: string | null }

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">'
const SHADE_DEF =
  '<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>'
const MC_DEF =
  '<linearGradient id="mc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E93A8F"/><stop offset=".25" stop-color="#F28A2E"/><stop offset=".5" stop-color="#F3E7A9"/><stop offset=".75" stop-color="#128A5F"/><stop offset="1" stop-color="#2551C2"/></linearGradient>'
const CONFETTI =
  '<circle cx="90" cy="120" r="9" fill="#F07E26"/><circle cx="510" cy="140" r="9" fill="#2551C2"/><circle cx="470" cy="700" r="9" fill="#F3E2A0"/>'
const KIDS_TRANSFORM = 'translate(60 100) scale(.8)'
const SIDE_BLOCK_GROUPS = new Set(['bags', 'footwear'])
const METAL_GROUPS = new Set(['bags', 'accessories', 'jewelry'])

const initialsOf = (brandName: string | undefined): string => {
  if (!brandName) return 'LL'
  const words = brandName
    .trim()
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
  const a = words[0]?.[0] ?? 'L'
  const b = words[1]?.[0] ?? words[0]?.[1] ?? 'L'
  return (a + b).toUpperCase()
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** Deterministic micro-variation from `imageSeed`: ±1.8° rotation and ±4 px offset. */
function variationTransform(imageSeed: number): string {
  const h = hashSeed(imageSeed >>> 0, 'var')
  const rot = ((h % 7) - 3) * 0.6
  const dx = ((h >>> 3) % 9) - 4
  const dy = ((h >>> 7) % 9) - 4
  return `rotate(${fmt(rot)} 300 400) translate(${dx} ${dy})`
}

/**
 * Complete 600×800 `<svg>` string drawn from silhouette + colour + pattern. Never throws: an
 * unknown silhouette id draws a neutral generic garment, an unknown pattern renders as solid.
 */
export function renderProductSvg(input: RenderInput): string {
  const sil: Silhouette = resolveSilhouette(input.silhouetteId)
  const primary = safeHex(input.colorHex, '#888888')
  const secondaryRaw = safeHex(input.secondaryColorHex, '')
  const secondary = secondaryRaw || null
  const isMulti = primary === MULTICOLOUR_HEX
  const light = lightness(primary)
  const veryDark = light < 0.18
  const group = input.categoryGroup
  const kids = input.department === 'kids'
  const seed = Number.isFinite(input.imageSeed) ? Math.trunc(input.imageSeed) : 0
  const offset = ((seed % 17) + 17) % 17

  const D = darken(primary, 0.3)
  const L = lighten(primary, 0.35)
  const S = secondary ?? D
  const detailStroke = veryDark ? lighten(primary, 0.32) : darken(primary, 0.35)
  const outlineStroke = light > 0.9 ? LIGHT_OUTLINE : veryDark ? lighten(primary, 0.22) : D
  const buttonFill = veryDark ? lighten(primary, 0.45) : darken(primary, 0.5)

  const pattern = input.pattern || 'solid'
  const kind = patternKind(pattern)
  const bodyFill = isMulti ? 'url(#mc)' : kind === 'gradient' ? 'url(#p)' : primary

  const parts: string[] = [SVG_OPEN]
  parts.push(`<rect width="600" height="800" fill="${backgroundFor(input.aesthetics)}"/>`)

  // defs
  parts.push(`<defs><clipPath id="c"><path d="${sil.body}"/></clipPath>`, SHADE_DEF)
  if (isMulti) parts.push(MC_DEF)
  if (kind === 'tile' || kind === 'gradient') {
    parts.push(
      patternDef(
        pattern,
        S,
        D,
        L,
        sil.patternScale,
        offset,
        escapeXml(initialsOf(input.brandName)),
        primary,
      ),
    )
  }
  parts.push('</defs>')

  // garment group (layers 3–8), with kids scaling and seed micro-variation
  const transform = kids
    ? `${KIDS_TRANSFORM} ${variationTransform(seed)}`
    : variationTransform(seed)
  parts.push(`<g transform="${transform}">`)
  parts.push(
    `<ellipse cx="300" cy="${sil.shadowY}" rx="${sil.shadowRx}" ry="14" fill="#000" opacity=".10"/>`,
  )
  // straps behind the body (handles, chains) — dark edge then primary
  if (sil.straps) {
    const w = sil.strapWidth ?? 10
    parts.push(
      `<path d="${sil.straps}" fill="none" stroke="${outlineStroke}" stroke-width="${w + 4}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="${sil.straps}" fill="none" stroke="${isMulti ? D : primary}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
  }
  parts.push(`<path d="${sil.body}" fill="${bodyFill}"/>`)
  if (kind === 'tile') {
    parts.push('<g clip-path="url(#c)"><rect width="600" height="800" fill="url(#p)"/></g>')
  } else if (kind === 'block') {
    const rect = SIDE_BLOCK_GROUPS.has(group)
      ? `<rect x="400" width="200" height="800" fill="${S}"/>`
      : `<rect y="400" width="600" height="400" fill="${S}"/>`
    parts.push(`<g clip-path="url(#c)">${rect}</g>`)
  }
  parts.push(`<path d="${sil.body}" fill="url(#sh)"/>`)

  // accents, trim, hardware, detail, buttons
  if (sil.accent) {
    parts.push(`<path d="${sil.accent}" fill="${S}" opacity="${secondary ? '.9' : '.55'}"/>`)
  }
  if (sil.trim) {
    const trimFill = secondary && kind === 'none' ? secondary : darken(primary, 0.45)
    parts.push(
      `<path d="${sil.trim}" fill="${trimFill}" stroke="${outlineStroke}" stroke-width="2.5" stroke-linejoin="round"/>`,
    )
  }
  if (sil.hardware) {
    const metal = METAL_GROUPS.has(group)
      ? hardwareColorFor(secondary, group === 'jewelry' ? GOLD_HEX : GUNMETAL_HEX)
      : hardwareColorFor(secondary, GUNMETAL_HEX)
    parts.push(sil.hardware.replaceAll('{H}', metal))
  }
  if (sil.detail) {
    parts.push(
      `<path d="${sil.detail}" fill="none" stroke="${detailStroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
  }
  if (sil.buttons && sil.buttons.length > 0) {
    let b = `<g fill="${buttonFill}">`
    for (const [x, y] of sil.buttons) b += `<circle cx="${x}" cy="${y}" r="5"/>`
    parts.push(b + '</g>')
  }
  parts.push(
    `<path d="${sil.body}" fill="none" stroke="${outlineStroke}" stroke-width="3" stroke-linejoin="round"/>`,
  )
  parts.push('</g>')
  if (kids) parts.push(CONFETTI)

  // No corner label, no swatch dot: the garment stands alone on its tonal ground; the name and
  // brand belong to the page, not the artwork.

  parts.push('</svg>')
  return parts.join('')
}

/**
 * 24×24 colour swatch. The second argument is either a secondary hex (split half/half, §9.4) or
 * a pattern slug (the tile is overlaid on the disc); `pattern` may also be given explicitly.
 */
export function renderSwatchSvg(
  hex: string,
  secondaryHexOrPattern?: string | null,
  pattern?: string | null,
): string {
  const primary = safeHex(hex, '#888888')
  let secondary: string | null = null
  let slug = pattern ?? null
  if (secondaryHexOrPattern) {
    if (secondaryHexOrPattern.startsWith('#'))
      secondary = safeHex(secondaryHexOrPattern, '') || null
    else slug ??= secondaryHexOrPattern
  }
  const kind = slug ? patternKind(slug) : 'none'
  const D = darken(primary, 0.3)
  const S = secondary ?? D
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">',
    '<defs><clipPath id="c"><circle cx="12" cy="12" r="11"/></clipPath>',
  ]
  if (slug && (kind === 'tile' || kind === 'gradient')) {
    parts.push(patternDef(slug, S, D, lighten(primary, 0.35), 0.25, 0, 'LL', primary))
  }
  parts.push('</defs>')
  const fill = primary === MULTICOLOUR_HEX ? '#A55BD4' : kind === 'gradient' ? 'url(#p)' : primary
  parts.push(`<circle cx="12" cy="12" r="11" fill="${fill}"/>`)
  if (secondary) {
    parts.push(
      `<g clip-path="url(#c)"><rect x="12" width="12" height="24" fill="${secondary}"/></g>`,
    )
  }
  if (kind === 'tile') {
    parts.push('<g clip-path="url(#c)"><rect width="24" height="24" fill="url(#p)"/></g>')
  } else if (kind === 'block') {
    parts.push(`<g clip-path="url(#c)"><rect y="12" width="24" height="12" fill="${S}"/></g>`)
  }
  parts.push(
    `<circle cx="12" cy="12" r="11" fill="none" stroke="${lightness(primary) > 0.9 ? LIGHT_OUTLINE : D}" stroke-width="1"/>`,
    '</svg>',
  )
  return parts.join('')
}

/**
 * Up to 5 articles side by side on a 1500×400 canvas, each product nested as a 300×400 `<svg>`
 * (§9.4). Nested ids are scoped by wrapping each product in its own `<svg>` element.
 */
export function renderOutfitSvg(inputs: readonly RenderInput[]): string {
  const items = inputs.slice(0, 5)
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 400" width="1500" height="400">',
    `<rect width="1500" height="400" fill="${FALLBACK_BG}"/>`,
  ]
  items.forEach((item, k) => {
    const inner = renderProductSvg(item).slice(SVG_OPEN.length, -'</svg>'.length)
    parts.push(
      `<svg x="${k * 300}" y="0" width="300" height="400" viewBox="0 0 600 800">${inner}</svg>`,
    )
  })
  parts.push('</svg>')
  return parts.join('')
}
