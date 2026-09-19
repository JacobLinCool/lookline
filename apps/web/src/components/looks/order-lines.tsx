import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Article } from '@lookline/db'
import { Price, ProductImage } from '@/components/ui'
import { cn } from '@/lib/cn'
import { displayName } from '@/lib/product-name'
import { formatTwd } from '@/server/format'

export interface OrderLine {
  product: Pick<Article, 'id' | 'name' | 'price'> & { brandName: string; colorName?: string | null }
  size: string | null
  qty: number
  /** Unit price at purchase time; defaults to the product price. */
  unitPrice?: number
  /** Slot at the right edge of the line (quantity controls, remove). */
  controls?: ReactNode
  /** Extra line under the name ("For Alice", "from Look …"). */
  meta?: ReactNode
}

export function lineTotal(line: Pick<OrderLine, 'product' | 'qty' | 'unitPrice'>): number {
  return (line.unitPrice ?? line.product.price) * line.qty
}

export function orderSubtotal(
  lines: ReadonlyArray<Pick<OrderLine, 'product' | 'qty' | 'unitPrice'>>,
): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0)
}

/** Order lines: artwork, name, size × qty, line total. */
export function OrderLines({
  lines,
  compact = false,
  className,
}: {
  lines: OrderLine[]
  compact?: boolean
  className?: string
}) {
  return (
    <ul className={cn('flex flex-col', className)}>
      {lines.map((line, index) => (
        <li
          key={`${line.product.id}-${line.size ?? ''}-${index}`}
          className="flex gap-4 border-b border-line py-4 first:border-t"
        >
          <Link
            href={`/p/${line.product.id}`}
            className={cn('shrink-0', compact ? 'w-16' : 'w-24')}
            aria-label={line.product.name}
          >
            <ProductImage articleId={line.product.id} alt={line.product.name} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate text-[12px] text-muted">{line.product.brandName}</p>
            <h3 className={cn('leading-snug font-medium', compact ? 'text-[14px]' : 'text-[15px]')}>
              <Link href={`/p/${line.product.id}`} className="hover:underline underline-offset-4">
                {displayName(line.product.name, line.product.brandName)}
              </Link>
            </h3>
            <p className="tabular text-[13px] text-muted">
              {line.size ? `Size ${line.size}` : 'One size'}
              {line.product.colorName ? ` · ${line.product.colorName}` : ''}
              {' · '}
              {formatTwd(line.unitPrice ?? line.product.price)} × {line.qty}
            </p>
            {line.meta ? <div className="text-[13px] text-muted">{line.meta}</div> : null}
            {line.controls ? <div className="mt-2">{line.controls}</div> : null}
          </div>
          <Price amount={lineTotal(line)} className="shrink-0 self-start" />
        </li>
      ))}
    </ul>
  )
}
