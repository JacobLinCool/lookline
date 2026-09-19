import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ChipTone = 'neutral' | 'ink' | 'accent' | 'outline'
export type TagTone = ChipTone

const tones: Record<TagTone, string> = {
  neutral: 'border border-line bg-card text-ink',
  ink: 'border border-ink bg-ink text-paper',
  accent: 'border border-accent/30 bg-accent-soft text-accent',
  outline: 'border border-line bg-transparent text-muted',
}

export interface TagProps {
  tone?: TagTone
  size?: 'sm' | 'md'
  /** Render as a link (e.g. to a filtered `/shop?aesthetic=…`). */
  href?: string
  className?: string
  children: ReactNode
}

/**
 * A paper tag. One per object: a price, a size, a role in the outfit, a state a friend needs to
 * see. Sentence case, no tracking; never a decorative keyword.
 */
export function Tag({ tone = 'neutral', size = 'sm', href, className, children }: TagProps) {
  const classes = cn(
    'inline-flex items-center gap-1 rounded-xs font-medium whitespace-nowrap leading-none',
    size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-2.5 text-[13px]',
    tones[tone],
    href && 'transition-colors hover:border-ink',
    className,
  )
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }
  return <span className={classes}>{children}</span>
}

export type ChipProps = TagProps
/** @deprecated Use `Tag`. Kept so older surfaces keep rendering. */
export const Chip = Tag

export interface BadgeProps {
  /** Number to show; the badge hides itself at 0 unless `showZero`. */
  count: number
  showZero?: boolean
  max?: number
  className?: string
}

/** Tiny count bubble (bag count, unread asks). */
export function Badge({ count, showZero = false, max = 99, className }: BadgeProps) {
  if (count <= 0 && !showZero) return null
  return (
    <span
      className={cn(
        'tabular inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-none text-paper',
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  )
}
