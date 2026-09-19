import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { displayName } from '@/lib/product-name'
import { ColorName, Price, ProductImage, Tag } from '@/components/ui'
import type { ShopProduct } from './data'

export interface ProductOptionProps {
  product: ShopProduct
  /** Form field name; radios share one name, checkboxes may too. */
  name: string
  kind?: 'radio' | 'checkbox'
  defaultChecked?: boolean
  /** Letter badge over the artwork ("A", "B"). */
  badge?: string
  /** Slot under the price (a tag, a link). */
  footer?: ReactNode
  disabled?: boolean
  className?: string
}

/**
 * A selectable garment: the whole tile is the label, the chosen one gets an ink ring around its
 * artwork. The native control stays visible so the state reads without JavaScript.
 */
export function ProductOption({
  product,
  name,
  kind = 'checkbox',
  defaultChecked,
  badge,
  footer,
  disabled,
  className,
}: ProductOptionProps) {
  const id = `${name}-${product.id}`
  return (
    <label
      htmlFor={id}
      className={cn(
        'group flex flex-col gap-2.5',
        disabled ? 'cursor-default' : 'cursor-pointer',
        className,
      )}
    >
      <div className="relative">
        <ProductImage
          productId={product.id}
          alt={product.name}
          className="ring-2 ring-transparent ring-offset-2 ring-offset-paper transition-shadow group-has-checked:ring-ink"
        />
        {badge ? (
          <span className="pointer-events-none absolute top-2 left-2">
            <Tag tone="ink" size="md">
              {badge}
            </Tag>
          </span>
        ) : null}
        <input
          id={id}
          type={kind}
          name={name}
          value={product.id}
          defaultChecked={defaultChecked}
          disabled={disabled}
          aria-label={product.name}
          className="absolute top-2.5 right-2.5 size-4 accent-ink"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <p className="truncate text-[12px] text-muted">{product.brandName}</p>
        <p className="line-clamp-2 text-[14px] leading-snug font-medium">
          {displayName(product.name, product.brandName)}
        </p>
        <div className="flex items-baseline justify-between gap-3">
          <Price amount={product.price} size="sm" />
          <span className="truncate text-[12px] text-muted">
            <ColorName value={product.colorName} />
          </span>
        </div>
      </div>
      {footer ? <div className="px-0.5">{footer}</div> : null}
    </label>
  )
}

/** Compact, non-selectable product row (answers, previews). */
export function ProductLine({
  product,
  href,
  trailing,
}: {
  product: ShopProduct
  href?: string
  trailing?: ReactNode
}) {
  const body = (
    <>
      <ProductImage productId={product.id} alt={product.name} className="w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-muted">{product.brandName}</p>
        <p className="truncate text-[14px] leading-snug font-medium">
          {displayName(product.name, product.brandName)}
        </p>
        <Price amount={product.price} size="sm" className="text-muted" />
      </div>
    </>
  )
  return (
    <div className="flex items-center gap-3">
      {href ? (
        <a
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3 hover:underline underline-offset-4"
        >
          {body}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}
