import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps {
  as?: 'div' | 'article' | 'section' | 'li'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Hover treatment for clickable cards. */
  interactive?: boolean
  /** Wrap the whole card in a link. */
  href?: string
  /** `panel` recesses into the wall (no border); `paper` is a bordered white sheet. */
  surface?: 'paper' | 'panel'
  className?: string
  children: ReactNode
}

const paddings: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-7',
}

/** Use sparingly: a sheet of paper on the wall. Most groups are separated by a rail line instead. */
export function Card({
  as: Tag = 'div',
  padding = 'md',
  interactive,
  href,
  surface = 'paper',
  className,
  children,
}: CardProps) {
  const classes = cn(
    'block rounded-md',
    surface === 'paper' ? 'border border-line bg-card' : 'bg-mist',
    (interactive || href) && 'transition-colors hover:border-ink',
    paddings[padding],
    className,
  )
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }
  return <Tag className={classes}>{children}</Tag>
}
