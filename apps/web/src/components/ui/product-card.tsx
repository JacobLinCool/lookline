import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Product } from '@lookline/db'
import { cn } from '@/lib/cn'
import { displayName } from '@/lib/product-name'
import { ColorName } from './color-name'
import { Price } from './price'
import { ProductImage } from './product-image'
import { Tag } from './chip'

/** The subset of a product row the card needs; `brandName` comes from the brand join. */
export type ProductCardData = Pick<Product, 'id' | 'name' | 'price'> & {
  aesthetics?: readonly string[]
  brandName: string
  colorName?: string | null
}

export interface ProductCardProps {
  product: ProductCardData
  /** Defaults to `/p/[id]`. */
  href?: string
  /** @deprecated Aesthetic chips are no longer shown on cards. */
  maxChips?: number
  /** One paper tag over the artwork (a role, "Friend's pick", a size). */
  tag?: ReactNode
  /** One plain-language line under the price ("Wedding guest · in budget"). */
  reason?: ReactNode
  /** Something drawn over the artwork's top-right corner (save / dismiss controls). */
  overlay?: ReactNode
  /** Slot under the meta: add-to-bag form, actions. */
  footer?: ReactNode
  priority?: boolean
  className?: string
}

/** A garment on the rail: artwork, name, price. Nothing else unless it changes the decision. */
export function ProductCard({
  product,
  href = `/p/${product.id}`,
  tag,
  reason,
  overlay,
  footer,
  priority,
  className,
}: ProductCardProps) {
  const name = displayName(product.name, product.brandName)
  return (
    <article className={cn('group flex flex-col gap-2.5', className)}>
      <div className="relative">
        <Link href={href} className="block" aria-label={name}>
          <ProductImage productId={product.id} alt={name} priority={priority} lift />
        </Link>
        {tag ? (
          <span className="pointer-events-none absolute top-2 left-2">
            {typeof tag === 'string' ? <Tag>{tag}</Tag> : tag}
          </span>
        ) : null}
        {overlay ? <div className="absolute top-2 right-2">{overlay}</div> : null}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="truncate text-[12px] text-muted">{product.brandName}</p>
        <h3 className="line-clamp-2 text-[14px] leading-snug font-medium">
          <Link href={href} className="hover:underline underline-offset-4">
            {name}
          </Link>
        </h3>
        <div className="flex items-baseline justify-between gap-3">
          <Price amount={product.price} size="sm" />
          {product.colorName ? (
            <span className="truncate text-[12px] text-muted">
              <ColorName value={product.colorName} />
            </span>
          ) : null}
        </div>
        {reason ? <p className="mt-0.5 text-[12px] leading-snug text-muted">{reason}</p> : null}
      </div>
      {footer ? <div className="px-0.5">{footer}</div> : null}
    </article>
  )
}
