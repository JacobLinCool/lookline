import { cn } from '@/lib/cn'

export interface ProductImageProps {
  articleId: number
  alt: string
  aspect?: '3/4' | '1/1'
  /** Eager-load above the fold. */
  priority?: boolean
  /** Lift on hover (use inside a link). */
  lift?: boolean
  className?: string
}

/** Article artwork from `/api/articles/[id]/image`, on its own tonal ground. */
export function ProductImage({
  articleId,
  alt,
  aspect = '3/4',
  priority,
  lift,
  className,
}: ProductImageProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md bg-mist',
        aspect === '3/4' ? 'aspect-3/4' : 'aspect-square',
        lift && 'tile-lift',
        className,
      )}
    >
      <img
        src={`/api/articles/${articleId}/image`}
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
