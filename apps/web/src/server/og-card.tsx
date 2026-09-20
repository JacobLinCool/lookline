/**
 * The share image (#38, #2): a landscape 1200×630 PNG, because that is what the platforms crop
 * to and none of them will render an SVG at all — a card shared today arrives as a bare link.
 *
 * The artwork rides in as a picture with no words on it; everything readable is laid out here,
 * where the font is one we chose. `labelEn` for the tier, so the one line that must survive a
 * missing Chinese face still reads.
 */
import { ImageResponse } from 'next/og'
import { renderLookPosterSvg } from '@lookline/engine'
import type { LookPosterInput } from '@lookline/engine'
import { chineseFont } from './og-font'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

const PAPER = '#F7F6F3'
const INK = '#171717'
const MUTED = '#6D6E69'
const LINE = '#DEDCD5'
const WORDMARK = 'LOOKLINE'

export interface ShareCardFace {
  /** The big line: the persona a card is of, or the collection an edition belongs to. */
  title: string
  /** Under it: who made it, or how many copies exist. */
  subtitle: string
  /** Latin, so it survives a font that failed to load. */
  badge: string
  verificationCode: string
  artwork: LookPosterInput
  /**
   * The rendered artwork as a `data:` URI, when the card has one. The poster in `artwork` is what
   * gets drawn otherwise — a shared card should show the picture its page shows.
   */
  artworkSrc?: string | null
}

export async function shareCardImage(face: ShareCardFace): Promise<ImageResponse> {
  const src =
    face.artworkSrc ??
    `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(renderLookPosterSvg({ ...face.artwork, chrome: 'artwork' }))))}`
  // Exactly the characters this image draws, `LOOKLINE` in the case it is drawn in: a letter left
  // out of the subset falls back to the built-in face and the word comes out in two weights.
  const font = await chineseFont(
    `${WORDMARK}${face.title}${face.subtitle}${face.badge}${face.verificationCode}`,
  )

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: PAPER,
        color: INK,
        padding: 56,
      }}
    >
      <img
        src={src}
        width={392}
        height={523}
        style={{ borderRadius: 14, objectFit: 'cover' }}
        alt=""
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingLeft: 56,
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 24, color: MUTED, letterSpacing: 6 }}>{WORDMARK}</div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, marginTop: 28 }}>
            {face.title}
          </div>
          <div style={{ fontSize: 28, color: MUTED, marginTop: 18 }}>{face.subtitle}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              border: `2px solid ${INK}`,
              borderRadius: 999,
              padding: '8px 22px',
              fontSize: 26,
            }}
          >
            {face.badge}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              paddingTop: 22,
              borderTop: `1px solid ${LINE}`,
              fontSize: 26,
              color: MUTED,
            }}
          >
            {face.verificationCode}
          </div>
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      // A failed subset leaves the built-in Latin face rather than no image at all.
      ...(font
        ? {
            fonts: [
              { name: 'Noto Sans TC', data: font, weight: 700 as const, style: 'normal' as const },
            ],
          }
        : {}),
    },
  )
}
