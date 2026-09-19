import { cn } from '@/lib/cn'

export interface ProductImageProps {
  articleId: string
  alt: string
  /**
   * The article's `image_path`. `null` or `''` means H&M photographed no such article, so the
   * tonal ground is shown on its own rather than requesting an image that would 404. Leave it
   * undefined where the caller does not know.
   */
  imagePath?: string | null
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
  imagePath,
  aspect = '3/4',
  priority,
  lift,
  className,
}: ProductImageProps) {
  return (
    <div
      // Where `flyArticleToBag` takes off from.
      data-article-image={articleId}
      className={cn(
        'overflow-hidden rounded-md bg-mist',
        aspect === '3/4' ? 'aspect-3/4' : 'aspect-square',
        lift && 'tile-lift',
        className,
      )}
    >
      {imagePath === null || imagePath === '' ? null : (
        <img
          src={`/api/articles/${articleId}/image`}
          alt={alt}
          width={600}
          height={aspect === '3/4' ? 800 : 600}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="size-full object-cover"
        />
      )}
    </div>
  )
}
