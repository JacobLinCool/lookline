import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ContainerSize = 'narrow' | 'default' | 'wide' | 'full'

const containerSizes: Record<ContainerSize, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-6xl',
  wide: 'max-w-[88rem]',
  full: 'max-w-none',
}

export interface ContainerProps {
  size?: ContainerSize
  as?: 'div' | 'main' | 'section' | 'nav' | 'footer' | 'header'
  className?: string
  children: ReactNode
}

/** Horizontal page gutter + max width. Every page wraps its content in one. */
export function Container({
  size = 'default',
  as: Tag = 'div',
  className,
  children,
}: ContainerProps) {
  return (
    <Tag className={cn('mx-auto w-full px-5 md:px-8', containerSizes[size], className)}>
      {children}
    </Tag>
  )
}

export interface SectionProps {
  /** @deprecated Not rendered. */
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Draw a rail line above the section (default true). */
  rule?: boolean
  className?: string
  children: ReactNode
}

/** A group on the wall: one rail line, a short title row, the content. */
export function Section({
  title,
  description,
  actions,
  rule = true,
  className,
  children,
}: SectionProps) {
  const hasHeader = title || description || actions
  return (
    <section className={cn(rule && 'hairline', 'py-7 md:py-9', className)}>
      {hasHeader ? (
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {title ? <h2 className="text-[20px] md:text-[22px]">{title}</h2> : null}
            {description ? <p className="text-[13px] text-muted">{description}</p> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export type RailItemWidth = 'sm' | 'md' | 'lg' | 'xl'

export interface RailProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  rule?: boolean
  /** Width of one hanging item; `md` fits about 2.3 items on a phone. */
  itemWidth?: RailItemWidth
  className?: string
  /** `RailItem`s. */
  children: ReactNode
}

export const RAIL_ITEM_WIDTHS: Record<RailItemWidth, string> = {
  sm: 'w-[8.5rem] md:w-[10.5rem]',
  md: 'w-[10.5rem] md:w-[13rem]',
  lg: 'w-[14rem] md:w-[17rem]',
  xl: 'w-[17rem] md:w-[22rem]',
}

/**
 * A rail: a labelled row of things hanging in a line, scrolling sideways. Use for curated sets
 * (an outfit, your Looks, a friend's picks); use a grid for a catalog.
 */
export function Rail({
  title,
  description,
  actions,
  rule = false,
  itemWidth = 'md',
  className,
  children,
}: RailProps) {
  return (
    <section
      className={cn(rule && 'hairline pt-6', 'flex min-w-0 flex-col gap-3', className)}
      data-rail-width={itemWidth}
    >
      {title || actions ? (
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h2 className="text-[17px] md:text-[19px]">{title}</h2> : null}
            {description ? <p className="text-[13px] text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <ul className="rail-track w-full min-w-0">{children}</ul>
    </section>
  )
}

/** One hanging item. Pass the same `width` as the parent rail's `itemWidth`. */
export function RailItem({
  width = 'md',
  className,
  children,
}: {
  width?: RailItemWidth
  className?: string
  children: ReactNode
}) {
  return <li className={cn('rail-item', RAIL_ITEM_WIDTHS[width], className)}>{children}</li>
}
