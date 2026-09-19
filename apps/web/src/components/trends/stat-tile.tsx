import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface StatTileProps {
  label: ReactNode
  value: ReactNode
  /** One short line under the label that defines the metric (a base, a rate). */
  hint?: ReactNode
  /** Emphasise with the accent (use once per row at most). */
  accent?: boolean
  className?: string
}

/** Headline figure: the number in the signage face, its name beneath, nothing boxed. */
export function StatTile({ label, value, hint, accent, className }: StatTileProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <p
        className={cn(
          'display tabular text-[26px] leading-none md:text-[30px]',
          accent && 'text-accent',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-ink">{label}</p>
      {hint ? <p className="text-[12px] leading-snug text-muted">{hint}</p> : null}
    </div>
  )
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 lg:grid-cols-5', className)}
    >
      {children}
    </div>
  )
}
