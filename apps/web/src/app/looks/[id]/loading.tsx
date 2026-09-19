import { Container, Skeleton, SkeletonCard } from '@/components/ui'

/** Look page skeleton: image, title block, actions, product rail. */
export default function LookLoading() {
  return (
    <Container className="pb-16">
      <div className="grid gap-6 pt-4 md:pt-8 lg:grid-cols-12 lg:gap-12">
        <Skeleton className="aspect-3/4 w-full lg:col-span-7" />
        <div className="flex flex-col gap-6 lg:col-span-5">
          <Skeleton className="h-9 w-3/4 rounded-xs" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-xs" />
          </div>
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </Container>
  )
}
