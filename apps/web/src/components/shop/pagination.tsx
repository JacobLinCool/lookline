import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ProductSearch } from '@lookline/engine'
import { cn } from '@/lib/cn'
import { shopHref } from './query'

/** Page numbers to show: first, last, and a window of two around the current page. */
function pageWindow(page: number, pages: number): Array<number | 'gap'> {
  const wanted = new Set<number>([1, pages, page - 2, page - 1, page, page + 1, page + 2])
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pages).toSorted((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  let prev = 0
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

export function Pagination({
  search,
  total,
  page,
  pageSize,
}: {
  search: ProductSearch
  total: number
  page: number
  pageSize: number
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  if (pages <= 1) return null
  const current = Math.min(Math.max(1, page), pages)
  const link =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-sm px-2 text-[13px] transition-colors'
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4">
      <p className="tabular text-[12px] text-muted">
        Page {current.toLocaleString('en-US')} of {pages.toLocaleString('en-US')}
      </p>
      <ol className="flex items-center gap-1">
        <li>
          {current > 1 ? (
            <Link
              href={shopHref(search, { page: current - 1 })}
              rel="prev"
              aria-label="Previous page"
              className={cn(link, 'hover:bg-mist')}
            >
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className={cn(link, 'text-line')} aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
        </li>
        {pageWindow(current, pages).map((item, i) =>
          item === 'gap' ? (
            <li key={`gap-${i}`} className="px-1 text-muted" aria-hidden>
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={shopHref(search, { page: item })}
                aria-current={item === current ? 'page' : undefined}
                className={cn(
                  link,
                  'tabular',
                  item === current ? 'bg-ink text-paper' : 'hover:bg-mist',
                )}
              >
                {item.toLocaleString('en-US')}
              </Link>
            </li>
          ),
        )}
        <li>
          {current < pages ? (
            <Link
              href={shopHref(search, { page: current + 1 })}
              rel="next"
              aria-label="Next page"
              className={cn(link, 'hover:bg-mist')}
            >
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className={cn(link, 'text-line')} aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </li>
      </ol>
    </nav>
  )
}
