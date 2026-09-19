import { cn } from '@/lib/cn'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizes: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96 }

export interface AvatarProps {
  /** `users.avatarSeed`; drives the deterministic `/api/avatars/[seed]` artwork. */
  seed: number
  /** Display name — used as alt text and for the initials fallback behind the image. */
  name: string
  size?: AvatarSize | number
  /** Override the image (e.g. a persona photo route). */
  src?: string
  className?: string
}

/** Round avatar. The initials sit behind the image so a failed load still shows something. */
export function Avatar({ seed, name, size = 'md', src, className }: AvatarProps) {
  const px = typeof size === 'number' ? size : sizes[size]
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-mist text-ink',
        className,
      )}
      style={{ width: px, height: px, fontSize: Math.max(10, Math.round(px * 0.36)) }}
      title={name}
    >
      <span aria-hidden className="font-display leading-none select-none">
        {initials}
      </span>
      <img
        src={src ?? `/api/avatars/${seed}`}
        alt={name}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  )
}
