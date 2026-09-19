import { seedFromParam } from '@/lib/hash'
import { svgResponse } from '@/server/svg'

/** mulberry32 — small, fast, deterministic PRNG for the avatar artwork. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Editorial disc colours paired with the tone that reads on top of them. */
const DISCS: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#141311', fg: '#f8f6f1' },
  { bg: '#7a1f2b', fg: '#f8f6f1' },
  { bg: '#a4823f', fg: '#141311' },
  { bg: '#5f6b4a', fg: '#f8f6f1' },
  { bg: '#4d5f73', fg: '#f8f6f1' },
  { bg: '#b5443d', fg: '#f8f6f1' },
  { bg: '#7b5c6c', fg: '#f8f6f1' },
  { bg: '#d8cbb3', fg: '#141311' },
  { bg: '#edeae3', fg: '#141311' },
  { bg: '#3f3b36', fg: '#f8f6f1' },
]

const SECONDARY = [
  '#7a1f2b',
  '#a4823f',
  '#5f6b4a',
  '#4d5f73',
  '#b5443d',
  '#d8cbb3',
  '#f8f6f1',
  '#141311',
]

function shapes(rand: () => number, fg: string, alt: string): string {
  const parts: string[] = []
  const n = 3 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const color = i % 2 === 0 ? fg : alt
    const cx = 48 + rand() * 160
    const cy = 48 + rand() * 160
    const size = 36 + rand() * 90
    const kind = Math.floor(rand() * 4)
    const opacity = (0.75 + rand() * 0.25).toFixed(2)
    if (kind === 0) {
      parts.push(
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(size / 2).toFixed(1)}" fill="${color}" opacity="${opacity}"/>`,
      )
    } else if (kind === 1) {
      const rot = Math.floor(rand() * 90)
      parts.push(
        `<rect x="${(cx - size / 2).toFixed(1)}" y="${(cy - size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${(size * 0.62).toFixed(1)}" fill="${color}" opacity="${opacity}" transform="rotate(${rot} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`,
      )
    } else if (kind === 2) {
      const h = size * 0.9
      parts.push(
        `<polygon points="${cx.toFixed(1)},${(cy - h / 2).toFixed(1)} ${(cx + size / 2).toFixed(1)},${(cy + h / 2).toFixed(1)} ${(cx - size / 2).toFixed(1)},${(cy + h / 2).toFixed(1)}" fill="${color}" opacity="${opacity}"/>`,
      )
    } else {
      const r = size / 2
      const flip = rand() < 0.5 ? 1 : 0
      parts.push(
        `<path d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${flip} ${(cx + r).toFixed(1)} ${cy.toFixed(1)} Z" fill="${color}" opacity="${opacity}"/>`,
      )
    }
  }
  return parts.join('\n    ')
}

/** `GET /api/avatars/[seed]` — deterministic two-tone geometric avatar, 256×256, cached forever. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ seed: string }> },
): Promise<Response> {
  const { seed } = await ctx.params
  const rand = mulberry32(seedFromParam(seed))
  const disc = DISCS[Math.floor(rand() * DISCS.length)] ?? DISCS[0]!
  let alt = SECONDARY[Math.floor(rand() * SECONDARY.length)] ?? disc.fg
  if (alt === disc.bg) alt = disc.fg

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><clipPath id="disc"><circle cx="128" cy="128" r="128"/></clipPath></defs>
  <circle cx="128" cy="128" r="128" fill="${disc.bg}"/>
  <g clip-path="url(#disc)">
    ${shapes(rand, disc.fg, alt)}
  </g>
</svg>`
  return svgResponse(svg, { cacheControl: 'public, max-age=31536000, immutable' })
}
