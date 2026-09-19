/**
 * `<defs>` pattern tiles for the 15 catalog patterns (docs/specs/CATALOG_SPEC.md §9.3).
 * Every tile is `<pattern id="p" patternUnits="userSpaceOnUse" patternTransform="translate(o o)
 * scale(s)">`; `scale` is the silhouette's `patternScale`, `offset = imageSeed mod 17` shifts the
 * tile phase so identical patterns do not tile identically.
 */

/** How the renderer applies a pattern: tile overlay, gradient body fill, colour-block rect, or nothing. */
export type PatternKind = 'tile' | 'gradient' | 'block' | 'none'

export const PATTERN_KINDS: Readonly<Record<string, PatternKind>> = {
  solid: 'none',
  'breton-stripe': 'tile',
  pinstripe: 'tile',
  gingham: 'tile',
  plaid: 'tile',
  houndstooth: 'tile',
  'polka-dot': 'tile',
  'ditsy-floral': 'tile',
  'bold-floral': 'tile',
  leopard: 'tile',
  'tie-dye': 'gradient',
  camo: 'tile',
  'colour-block': 'block',
  monogram: 'tile',
  geometric: 'tile',
}

/** Pattern slugs the renderer knows (spec order). */
export const RENDERABLE_PATTERNS: readonly string[] = Object.keys(PATTERN_KINDS)

export function patternKind(pattern: string | null | undefined): PatternKind {
  return (pattern && PATTERN_KINDS[pattern]) || 'none'
}

const tile = (w: number, h: number, scale: number, offset: number, inner: string): string =>
  `<pattern id="p" patternUnits="userSpaceOnUse" width="${w}" height="${h}" patternTransform="translate(${offset} ${offset}) scale(${scale})">${inner}</pattern>`

const petals = (cx: number, cy: number, fill: string): string =>
  `<circle cx="${cx}" cy="${cy - 6}" r="4" fill="${fill}"/><circle cx="${cx + 5.7}" cy="${cy - 1.9}" r="4" fill="${fill}"/><circle cx="${cx + 3.5}" cy="${cy + 4.9}" r="4" fill="${fill}"/><circle cx="${cx - 3.5}" cy="${cy + 4.9}" r="4" fill="${fill}"/><circle cx="${cx - 5.7}" cy="${cy - 1.9}" r="4" fill="${fill}"/>`

const rosette = (cx: number, cy: number, inner: string): string =>
  `<path d="M${cx - 9} ${cy - 3} q3 -9 12 -7 q9 2 8 10 q-2 9 -11 8 q-10 -1 -9 -11z" fill="#0A0A0A"/><ellipse cx="${cx}" cy="${cy}" rx="7" ry="5" fill="${inner}"/>`

/**
 * Returns the `<defs>` content for a pattern (`''` for `solid`, `colour-block` and unknown slugs).
 * `S` = secondary colour, `D` = darkened primary, `L` = lightened primary, `P` = primary.
 */
export function patternDef(
  pattern: string,
  S: string,
  D: string,
  L: string,
  scale: number,
  offset: number,
  initials: string,
  P = D,
): string {
  switch (pattern) {
    case 'breton-stripe':
      return tile(40, 28, scale, offset, `<rect width="40" height="12" fill="${S}"/>`)
    case 'pinstripe':
      return tile(18, 18, scale, offset, `<rect width="1.5" height="18" fill="${S}" opacity=".7"/>`)
    case 'gingham':
      return tile(
        36,
        36,
        scale,
        offset,
        `<rect width="18" height="18" fill="${S}" opacity=".55"/><rect x="18" y="18" width="18" height="18" fill="${S}" opacity=".55"/><rect x="18" width="18" height="18" fill="${S}" opacity=".25"/><rect y="18" width="18" height="18" fill="${S}" opacity=".25"/>`,
      )
    case 'plaid':
      return tile(
        60,
        60,
        scale,
        offset,
        `<rect width="60" height="14" y="23" fill="${S}" opacity=".5"/><rect width="14" height="60" x="23" fill="${S}" opacity=".5"/><rect width="60" height="3" fill="${D}"/><rect width="3" height="60" fill="${D}"/>`,
      )
    case 'houndstooth':
      return tile(
        32,
        32,
        scale,
        offset,
        `<path d="M0 0h16v16H0zM16 16h16v16H16zM16 0l16 16V0zM0 16l16 16H0z" fill="${S}"/>`,
      )
    case 'polka-dot':
      return tile(40, 40, scale, offset, `<circle cx="20" cy="20" r="7" fill="${S}"/>`)
    case 'ditsy-floral':
      return tile(
        40,
        40,
        scale,
        offset,
        `${petals(12, 12, S)}<circle cx="12" cy="12" r="2.5" fill="${L}"/>${petals(30, 30, S)}<circle cx="30" cy="30" r="2.5" fill="${L}"/>`,
      )
    case 'bold-floral':
      return tile(
        120,
        120,
        scale,
        offset,
        `<g fill="${S}" opacity=".85"><ellipse cx="60" cy="60" rx="14" ry="30"/><ellipse cx="60" cy="60" rx="14" ry="30" transform="rotate(60 60 60)"/><ellipse cx="60" cy="60" rx="14" ry="30" transform="rotate(120 60 60)"/></g><circle cx="60" cy="60" r="12" fill="${D}"/><path d="M100 20 q30 20 0 50 q-30 -20 0 -50z" fill="${D}" opacity=".6"/>`,
      )
    case 'leopard':
      return tile(
        70,
        70,
        scale,
        offset,
        rosette(14, 16, L) +
          rosette(48, 10, L) +
          rosette(30, 40, L) +
          rosette(60, 50, L) +
          rosette(10, 58, L),
      )
    case 'tie-dye':
      return `<radialGradient id="p" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="${P}"/><stop offset=".35" stop-color="${S}"/><stop offset=".6" stop-color="${L}"/><stop offset="1" stop-color="${S}"/></radialGradient>`
    case 'camo':
      return tile(
        140,
        140,
        scale,
        offset,
        `<g opacity=".85"><path d="M10 30 q20 -30 55 -12 q25 10 10 35 q-20 25 -50 12 q-25 -12 -15 -35z" fill="${S}"/><path d="M80 10 q35 -10 50 20 q10 25 -15 35 q-30 10 -45 -15 q-8 -25 10 -40z" fill="#3B2A22"/><path d="M60 80 q30 -15 55 10 q15 25 -10 40 q-30 12 -50 -10 q-15 -22 5 -40z" fill="${D}"/><path d="M0 95 q15 -25 40 -10 q20 15 5 35 q-20 20 -40 5 q-15 -15 -5 -30z" fill="${L}"/></g>`,
      )
    case 'monogram':
      return tile(
        48,
        48,
        scale,
        offset,
        `<text x="8" y="30" font-family="system-ui" font-size="16" font-weight="700" fill="${S}" opacity=".55" transform="rotate(20 24 24)">${initials}</text>`,
      )
    case 'geometric':
      return tile(
        50,
        50,
        scale,
        offset,
        `<polygon points="0,50 25,0 50,50" fill="${S}" opacity=".6"/><polygon points="25,10 40,25 25,40 10,25" fill="${D}"/>`,
      )
    default:
      return ''
  }
}
