import { cn } from '@/lib/cn'

export interface ProductImageProps {
  productId: number
  alt: string
  aspect?: '3/4' | '1/1'
  /** Eager-load above the fold. */
  priority?: boolean
  /** Lift on hover (use inside a link). */
  lift?: boolean
  className?: string
}

/** Product artwork from `/api/products/[id]/image`, on its own tonal ground. */
export function ProductImage({
  productId,
  alt,
  aspect = '3/4',
  priority,
  lift,
  className,
}: ProductImageProps) {
  return (
    <div
      // Where `flyProductToBag` takes off from.
      data-product-image={productId}
      className={cn(
        'overflow-hidden rounded-md bg-mist',
        aspect === '3/4' ? 'aspect-3/4' : 'aspect-square',
        lift && 'tile-lift',
        className,
      )}
    >
      <img
        src={`/api/products/${productId}/image`}
        alt={alt}
        width={600}
        height={aspect === '3/4' ? 800 : 600}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className="size-full object-cover"
      />
    </div>
  )
}
