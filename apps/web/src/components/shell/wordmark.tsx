import Link from 'next/link'
import { cn } from '@/lib/cn'

/** "Lookline" in the signage face, linking home. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'display text-[22px] leading-none font-bold tracking-[-0.03em] text-ink',
        className,
      )}
      aria-label="Lookline home"
    >
      Lookline
    </Link>
  )
}
