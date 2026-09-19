/**
 * `renderLookPosterSvg`: a deterministic 900×1200 poster used when no image model is configured
 * (docs/ARCHITECTURE.md "poster SVG fallback"). It is a Look, not a product ad: the preset's ground
 * colour, the garment silhouettes laid out like a flat lay, the title in a plain grotesque, the
 * owner's name, a thin palette bar and a small edition number. Pure string templating; identical
 * input ⇒ identical output.
 */
import { createRng, findAesthetic, hashSeed, type Rng } from '@lookline/catalog'
import type { LookPosterInput, StylePreset } from '../types'
import { darken, lighten, luminance, mixHex, normalizeHex } from './color'
import { findStylePreset } from './presets'
import { SHAPES, shapeFamilyFor } from './shapes'

export const POSTER_WIDTH = 900
export const POSTER_HEIGHT = 1200

const SANS = "'Helvetica Neue', Helvetica, Arial, ui-sans-serif, system-ui, sans-serif"
const MAX_SHAPES = 8
const MARGIN = 64

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString()
const pad = (n: number): string => String(Math.max(1, Math.round(n))).padStart(3, '0')

type Theme = StylePreset['theme']

/** Preset theme by slug; otherwise a theme derived from the palette (light ground, dark ink). */
function resolveTheme(slug: string, palette: readonly string[]): Theme & { name: string } {
  const preset = findStylePreset(slug)
  if (preset) return { ...preset.theme, name: preset.name }
  const hexes = palette.map(normalizeHex).filter((h): h is string => h !== null)
  const sorted = hexes.toSorted((a, b) => luminance(a) - luminance(b))
  const darkest = sorted[0] ?? '#171717'
  const lightest = sorted[sorted.length - 1] ?? '#F7F6F3'
  const mid = sorted[Math.floor(sorted.length / 2)] ?? '#C8321E'
  return {
    background: lighten(lightest, 0.72),
    foreground: darken(darkest, 0.55),
    accent: mid,
    mood: 'editorial',
    name: humanize(slug || 'editorial'),
  }
}

function humanize(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function aestheticLabel(slug: string): string {
  return findAesthetic(slug)?.name ?? humanize(slug)
}

/** Greedy word wrap into at most `maxLines` lines of roughly `maxChars` characters. */
function wrapTitle(title: string, maxChars: number, maxLines: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, Math.max(1, maxChars - 1))}…`
    return kept
  }
  return lines.length > 0 ? lines : ['Untitled Look']
}

function titleFontSize(title: string): { size: number; maxChars: number } {
  const n = title.trim().length
  if (n <= 14) return { size: 96, maxChars: 14 }
  if (n <= 24) return { size: 76, maxChars: 18 }
  if (n <= 40) return { size: 60, maxChars: 23 }
  return { size: 52, maxChars: 28 }
}

interface Placed {
  d: string
  fill: string
  secondary: string | null
  x: number
  y: number
  scale: number
  rotate: number
  pattern: string
}

/**
 * Lay the garments out like a flat lay: a loose grid inside the stage, big pieces first, a little
 * seeded drift and a few degrees of tilt so the pieces read as placed by hand, never scattered.
 */
interface Area {
  top: number
  bottom: number
  left: number
  right: number
}

const FULL_STAGE: Area = { top: 190, bottom: 780, left: 90, right: POSTER_WIDTH - 90 }

function composeShapes(
  articles: LookPosterInput['articles'],
  rng: Rng,
  ink: string,
  area: Area = FULL_STAGE,
): Placed[] {
  const items = articles.slice(0, MAX_SHAPES)
  const { top: areaTop, bottom: areaBottom, left: areaLeft, right: areaRight } = area
  const placed: Placed[] = []
  const withShape = items
    .map((p, i) => ({ p, i, shape: SHAPES[shapeFamilyFor(p.subcategory, p.categoryGroup)] }))
    .toSorted((a, b) => b.shape.weight - a.shape.weight || a.i - b.i)
  const n = withShape.length
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3
  const rows = Math.max(1, Math.ceil(n / Math.max(1, cols)))
  const cellW = (areaRight - areaLeft) / Math.max(1, cols)
  const cellH = (areaBottom - areaTop) / rows
  withShape.forEach(({ p, shape }, k) => {
    const col = k % Math.max(1, cols)
    const row = Math.floor(k / Math.max(1, cols))
    const baseScale = Math.min(cellW / 200, cellH / 260) * 1.18
    const scale = baseScale * (0.86 + shape.weight * 0.3) * rng.float(0.94, 1.06)
    const jitterX = rng.float(-0.08, 0.08) * cellW
    const jitterY = rng.float(-0.06, 0.06) * cellH
    const cx = areaLeft + cellW * (col + 0.5) + jitterX
    const cy = areaTop + cellH * (row + 0.5) + jitterY
    const fill = normalizeHex(p.colorHex) ?? ink
    // The catalogue has no second colour; H&M files each colourway as its own article.
    const secondary = null
    placed.push({
      d: shape.d,
      fill,
      secondary,
      x: cx - 100 * scale,
      y: cy - 130 * scale,
      scale,
      rotate: rng.float(-5, 5),
      pattern: p.pattern,
    })
  })
  return placed
}

interface Band {
  shapes: Placed[]
  label: string | null
  labelX: number
  labelY: number
}

/** Stage bounds: the rounded rectangle the garments lie on. */
const STAGE = { x: MARGIN, y: 150, width: POSTER_WIDTH - MARGIN * 2, height: 670 } as const

/**
 * One band per subject for a group card, each captioned with that subject's name — the card has
 * to say whose clothes are whose, not just show everyone's pieces in one heap. Up to three
 * subjects stack; more than that splits into two columns so the bands stay tall enough to read.
 */
function layOutBands(input: LookPosterInput, rng: Rng, ink: string): Band[] {
  const groups = input.groups ?? []
  if (groups.length === 0) {
    return [{ shapes: composeShapes(input.articles, rng, ink), label: null, labelX: 0, labelY: 0 }]
  }
  const cols = groups.length <= 3 ? 1 : 2
  const rows = Math.ceil(groups.length / cols)
  const cellW = STAGE.width / cols
  const cellH = STAGE.height / rows
  const captionH = 34
  return groups.map((group, i) => {
    const left = STAGE.x + cellW * (i % cols)
    const top = STAGE.y + cellH * Math.floor(i / cols)
    return {
      shapes: composeShapes(group.articles, rng, ink, {
        top: top + captionH,
        bottom: top + cellH - 10,
        left: left + 26,
        right: left + cellW - 26,
      }),
      label: group.name,
      labelX: left + 26,
      labelY: top + 26,
    }
  })
}

function shapeMarkup(s: Placed, index: number, ink: string, background: string): string {
  const parts: string[] = []
  const outline = luminance(s.fill) > 0.9 ? mixHex(ink, background, 0.55) : darken(s.fill, 0.35)
  const transform = `translate(${fmt(s.x)} ${fmt(s.y)}) rotate(${fmt(s.rotate)} ${fmt(100 * s.scale)} ${fmt(130 * s.scale)}) scale(${fmt(s.scale)})`
  parts.push(`<g transform="${transform}">`)
  parts.push(
    `<path d="${s.d}" transform="translate(4 8)" fill="${ink}" opacity=".12" fill-rule="evenodd"/>`,
  )
  parts.push(`<path d="${s.d}" fill="${s.fill}" fill-rule="evenodd"/>`)
  if (s.pattern !== 'solid') {
    parts.push(`<path d="${s.d}" fill="url(#tx${index})" opacity=".55" fill-rule="evenodd"/>`)
  } else if (s.secondary && s.secondary !== s.fill) {
    parts.push(
      `<clipPath id="cl${index}"><path d="${s.d}" fill-rule="evenodd"/></clipPath>`,
      `<rect x="0" y="170" width="200" height="120" fill="${s.secondary}" opacity=".85" clip-path="url(#cl${index})"/>`,
    )
  }
  parts.push(`<path d="${s.d}" fill="url(#shade)" fill-rule="evenodd"/>`)
  parts.push(
    `<path d="${s.d}" fill="none" stroke="${outline}" stroke-width="2" stroke-linejoin="round" fill-rule="evenodd"/>`,
  )
  parts.push('</g>')
  return parts.join('')
}

function patternDef(index: number, pattern: string, fill: string, rng: Rng): string {
  const ink = darken(fill, 0.45)
  const light = lighten(fill, 0.4)
  const size = 14 + rng.int(0, 10)
  const rotate = rng.int(0, 3) * 45
  const open = `<pattern id="tx${index}" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="rotate(${rotate})">`
  switch (pattern) {
    case 'stripe':
    case 'pinstripe':
    case 'breton-stripe':
      return `${open}<rect width="${size / 2}" height="${size}" fill="${ink}"/></pattern>`
    case 'check':
    case 'plaid':
    case 'gingham':
    case 'houndstooth':
    case 'windowpane':
      return `${open}<rect width="${size / 2}" height="${size / 2}" fill="${ink}"/><rect x="${size / 2}" y="${size / 2}" width="${size / 2}" height="${size / 2}" fill="${ink}"/></pattern>`
    case 'polka-dot':
      return `${open}<circle cx="${size / 2}" cy="${size / 2}" r="${size / 5}" fill="${light}"/></pattern>`
    case 'floral':
    case 'paisley':
    case 'ditsy-floral':
      return `${open}<circle cx="${size / 3}" cy="${size / 3}" r="${size / 6}" fill="${light}"/><circle cx="${(2 * size) / 3}" cy="${(2 * size) / 3}" r="${size / 8}" fill="${ink}"/></pattern>`
    case 'animal':
    case 'leopard':
    case 'zebra':
      return `${open}<ellipse cx="${size / 2}" cy="${size / 2}" rx="${size / 3}" ry="${size / 6}" fill="${ink}"/></pattern>`
    default:
      return `${open}<rect width="${size}" height="${size}" fill="${ink}" opacity=".18"/><rect width="${size / 3}" height="${size / 3}" fill="${light}" opacity=".5"/></pattern>`
  }
}

/** Complete `<svg>` string, 900×1200. Deterministic in `input.seed` and the field values. */
export function renderLookPosterSvg(input: LookPosterInput): string {
  const rng = createRng(hashSeed(input.seed, 'look-poster'))
  const theme = resolveTheme(input.stylePreset, input.palette)
  const bg = theme.background
  const ink = theme.foreground
  const accent = theme.accent
  const darkGround = luminance(bg) < 0.5
  const muted = mixHex(ink, bg, 0.42)
  const stage = darkGround ? lighten(bg, 0.06) : darken(bg, 0.035)
  const parts: string[] = []

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" role="img" aria-label="${escapeXml(input.title)} by ${escapeXml(input.ownerName)}">`,
  )

  // defs: shade gradient, per-shape pattern fills
  const bands = layOutBands(input, rng, ink)
  const shapes = bands.flatMap((b) => b.shapes)
  parts.push('<defs>')
  parts.push(
    '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>',
  )
  shapes.forEach((s, i) => {
    if (s.pattern !== 'solid') parts.push(patternDef(i, s.pattern, s.fill, rng))
  })
  parts.push('</defs>')

  // 1. ground and the stage the garments lie on
  parts.push(`<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="${bg}"/>`)
  parts.push(
    `<rect x="${MARGIN}" y="150" width="${POSTER_WIDTH - MARGIN * 2}" height="670" rx="14" fill="${stage}"/>`,
  )

  // 2. composition — one band per subject on a group card, a single flat lay otherwise
  parts.push('<g>')
  let index = 0
  for (const band of bands) {
    if (band.label) {
      parts.push(
        `<text x="${fmt(band.labelX)}" y="${fmt(band.labelY)}" font-family="${SANS}" font-size="19" font-weight="700" fill="${muted}">${escapeXml(band.label)}</text>`,
      )
    }
    for (const shape of band.shapes) {
      parts.push(shapeMarkup(shape, index, ink, bg))
      index += 1
    }
  }
  parts.push('</g>')

  // 3. header: preset name left, edition number right (the one accent)
  // A copy says which one it is; the edition's own artwork says only how many exist, because
  // printing a number on the picture every copy shares would make each of them claim to be it.
  const editionLabel =
    input.editionNumber !== undefined
      ? `No. ${pad(input.editionNumber)}${input.editionOf ? `/${pad(input.editionOf)}` : ''}`
      : input.editionOf
        ? `Edition of ${Math.max(1, Math.round(input.editionOf))}`
        : 'No. 001'
  parts.push(
    `<text x="${MARGIN}" y="98" font-family="${SANS}" font-size="20" fill="${muted}">${escapeXml(`Lookline · ${theme.name}`)}</text>`,
  )
  parts.push(
    `<text x="${POSTER_WIDTH - MARGIN}" y="104" text-anchor="end" font-family="${SANS}" font-size="36" font-weight="700" letter-spacing="-1" fill="${accent}">${escapeXml(editionLabel)}</text>`,
  )

  // 4. title block + owner + aesthetics
  const { size, maxChars } = titleFontSize(input.title)
  const lines = wrapTitle(input.title, maxChars, 3)
  const lineHeight = size * 1.0
  const paletteBarY = POSTER_HEIGHT - 82
  const ownerY = paletteBarY - 40
  const titleBottom = ownerY - 50
  const titleTop = titleBottom - lineHeight * (lines.length - 1)
  parts.push(
    `<g font-family="${SANS}" font-size="${size}" font-weight="700" letter-spacing="${fmt(-size * 0.03)}" fill="${ink}">`,
  )
  lines.forEach((line, i) => {
    parts.push(
      `<text x="${MARGIN}" y="${fmt(titleTop + i * lineHeight)}">${escapeXml(line)}</text>`,
    )
  })
  parts.push('</g>')
  parts.push(
    `<text x="${MARGIN}" y="${ownerY}" font-family="${SANS}" font-size="22" fill="${ink}">${escapeXml(`by ${input.ownerName}`)}</text>`,
  )
  const aesthetics = input.aesthetics.slice(0, 3).map(aestheticLabel).join(' · ')
  if (aesthetics) {
    parts.push(
      `<text x="${POSTER_WIDTH - MARGIN}" y="${ownerY}" text-anchor="end" font-family="${SANS}" font-size="18" fill="${muted}">${escapeXml(aesthetics)}</text>`,
    )
  }

  // 5. palette bar + piece count
  const palette = input.palette.map(normalizeHex).filter((h): h is string => h !== null)
  const swatches = palette.length > 0 ? palette : [accent, ink]
  const barW = POSTER_WIDTH - MARGIN * 2 - 140
  const segment = barW / swatches.length
  swatches.forEach((hex, i) => {
    parts.push(
      `<rect x="${fmt(MARGIN + i * segment)}" y="${paletteBarY}" width="${fmt(segment)}" height="12" fill="${hex}"/>`,
    )
  })
  parts.push(
    `<rect x="${MARGIN}" y="${paletteBarY}" width="${fmt(barW)}" height="12" fill="none" stroke="${mixHex(ink, bg, 0.7)}" stroke-width="1"/>`,
  )
  parts.push(
    `<text x="${POSTER_WIDTH - MARGIN}" y="${paletteBarY + 11}" text-anchor="end" font-family="${SANS}" font-size="16" fill="${muted}">${escapeXml(`${input.articles.length} piece${input.articles.length === 1 ? '' : 's'}`)}</text>`,
  )

  parts.push('</svg>')
  return parts.join('')
}
