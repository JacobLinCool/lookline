import { cn } from '@/lib/cn'

export interface SkeletonProps {
  className?: string
}

/** Loading placeholder block; give it a size via className (`h-4 w-40`, `aspect-3/4`). */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-mist', className)} />
}

/** A few lines of text-shaped skeleton. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3 rounded-xs', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/** Product/Look card shaped skeleton (3:4 image + two lines). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} aria-hidden>
      <Skeleton className="aspect-3/4 w-full" />
      <Skeleton className="h-3 w-1/3 rounded-xs" />
      <Skeleton className="h-4 w-3/4 rounded-xs" />
    </div>
  )
}
