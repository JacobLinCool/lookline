import { cn } from '@/lib/cn'
import { formatTwd } from '@/server/format'

export interface PriceProps {
  /** Integer TWD. */
  amount: number
  /** Struck-through original price, when discounted. */
  compareAt?: number | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'text-[13px]',
  md: 'text-[15px]',
  lg: 'display text-[22px]',
  xl: 'display text-[28px] md:text-[32px]',
} as const

/** `NT$1,290` with tabular figures. */
export function Price({ amount, compareAt, size = 'md', className }: PriceProps) {
  return (
    <span className={cn('tabular inline-flex items-baseline gap-2', sizes[size], className)}>
      <span>{formatTwd(amount)}</span>
      {compareAt && compareAt > amount ? (
        <s className="text-muted">{formatTwd(compareAt)}</s>
      ) : null}
    </span>
  )
}
