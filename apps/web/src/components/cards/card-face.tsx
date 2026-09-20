import { cn } from '@/lib/cn'

/**
 * An issued card, as a card.
 *
 * Until now every surface showed the artwork on its own — a photograph with a 1px border, which
 * reads as a picture of someone rather than as an object you hold. What makes a collectible look
 * collectible is mostly the printing around the picture: the mount, the wordmark, the subject's
 * name, the number you can quote back. All of that already existed on these pages as loose text
 * beside the image; here it is on the card, where it belongs.
 *
 * Deliberately not a foil: this product's design language is a white wall, one steel rail and
 * paper tags, and the garment is the only colour on the page (see `globals.css`). A card that
 * shimmered would be the loudest thing in the store.
 *
 * Presentational and free of server-only imports, because the discovery rails that use it are a
 * client component and the card page is not.
 */
export interface CardFaceProps {
  /** `/api/cards/[id]` or `/api/editions/[id]?copy=…`. */
  imageUrl: string
  /** The subject, printed under the window. */
  personaName: string
  /** Printed small, and the thing a holder quotes when verifying. */
  verificationCode: string
  /** A personal card's tier (全數自有…). A collection copy has none and prints its number. */
  tierLabel?: string | null
  editionNumber?: number | null
  editionSize?: number | null
  /** A collection copy says which collection it belongs to; a personal card says nothing. */
  collectionTitle?: string | null
  /** `lg` for a card on its own page, `sm` for one in a grid or a rail. */
  size?: 'sm' | 'lg'
  /** Above the fold; skips lazy loading. */
  priority?: boolean
  className?: string
}

const scale = {
  sm: {
    stock: 'rounded-md p-1.5',
    wordmark: 'text-[7px] tracking-[0.22em]',
    rail: 'pb-1',
    name: 'text-[12px]',
    code: 'text-[10px]',
    footer: 'pt-1.5',
  },
  lg: {
    stock: 'rounded-xl p-3',
    wordmark: 'text-[10px] tracking-[0.3em]',
    rail: 'pb-2',
    name: 'display text-[18px]',
    code: 'text-[11px]',
    footer: 'pt-2.5',
  },
} as const

export function CardFace({
  imageUrl,
  personaName,
  verificationCode,
  tierLabel,
  editionNumber,
  editionSize,
  collectionTitle,
  size = 'sm',
  priority,
  className,
}: CardFaceProps) {
  const s = scale[size]
  const numbered = editionNumber !== null && editionNumber !== undefined && editionSize
  const badge = numbered ? `${editionNumber}/${editionSize}` : (tierLabel ?? null)

  return (
    <div
      className={cn(
        'flex flex-col border border-line bg-card shadow-[0_10px_24px_-18px_rgb(23_23_23/0.45)]',
        s.stock,
        className,
      )}
    >
      <div className={cn('flex items-center justify-between gap-2 px-0.5', s.rail)}>
        <span className={cn('font-medium text-muted uppercase', s.wordmark)}>Lookline</span>
        {badge ? <span className={cn('tabular shrink-0 text-muted', s.code)}>{badge}</span> : null}
      </div>

      {/*
       * The window is a fixed 5:7 — a trading card's proportions — but the artwork inside is not:
       * a rendered card comes back 2:3 and the composition poster is 5:7. `object-contain` is what
       * keeps a full-body subject whole; cropping to fill would take the head or the feet off
       * roughly one card in two.
       */}
      <div className="aspect-5/7 overflow-hidden rounded-xs border border-line bg-mist">
        <img
          src={imageUrl}
          alt={personaName}
          width={600}
          height={840}
          loading={priority ? 'eager' : 'lazy'}
          className="size-full object-contain"
        />
      </div>

      <div className={cn('flex flex-col gap-0.5 px-0.5', s.footer)}>
        <span className={cn('truncate leading-tight', s.name)}>{personaName}</span>
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('tabular truncate text-muted', s.code)}>{verificationCode}</span>
          {collectionTitle ? (
            <span className={cn('truncate text-muted', s.code)}>{collectionTitle}</span>
          ) : null}
        </span>
      </div>
    </div>
  )
}
