'use client'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useI18n } from '@/i18n/client'

/** Fixed media geometry, native touch scrolling, buttons and explicit keyboard paging. */
export function DiscoveryRail({
  title,
  description,
  children,
  busy = false,
  compactHeader = false,
}: {
  title: string
  description?: string
  children: ReactNode
  busy?: boolean
  compactHeader?: boolean
}) {
  const { t } = useI18n()
  const id = useId()
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  useEffect(() => {
    const node = track.current!
    const update = () =>
      setEdges({
        start: node.scrollLeft < 2,
        end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2,
      })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    for (const child of node.children) observer.observe(child)
    node.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', update)
    }
  }, [children])
  const move = (direction: number) => {
    const node = track.current!
    node.scrollBy({
      left: direction * node.clientWidth * 0.85,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }
  return (
    <section className="min-w-0" aria-labelledby={`${id}-title`} data-discovery-rail>
      <div
        className={`mb-3 flex ${compactHeader ? 'h-20' : 'h-28'} md:h-20 items-end justify-between gap-3`}
      >
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[20px] md:text-[22px]">
            {title}
          </h2>
          {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={edges.start}
            aria-controls={id}
            aria-label={t.home.discovery.previous(title)}
            className="inline-flex size-11 items-center justify-center rounded-sm border disabled:opacity-30"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={edges.end}
            aria-controls={id}
            aria-label={t.home.discovery.next(title)}
            className="inline-flex size-11 items-center justify-center rounded-sm border disabled:opacity-30"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={track}
        id={id}
        role="region"
        aria-label={title}
        aria-busy={busy}
        tabIndex={0}
        className="discovery-track flex h-[352px] gap-4 overflow-x-auto overscroll-x-contain pb-3 md:h-[410px]"
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            move(event.key === 'ArrowLeft' ? -1 : 1)
          }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            track.current!.scrollTo({ left: event.key === 'Home' ? 0 : track.current!.scrollWidth })
          }
        }}
      >
        {children}
      </div>
    </section>
  )
}
