import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PageHeaderProps {
  /** @deprecated Not rendered; headings carry their own weight. */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode
  size?: 'md' | 'lg'
  align?: 'left' | 'center'
  className?: string
}

/** Page opener: the title, at most one line under it, the page's actions. */
export function PageHeader({
  title,
  description,
  actions,
  size = 'md',
  align = 'left',
  className,
}: PageHeaderProps) {
  const centered = align === 'center'
  return (
    <header
      className={cn(
        'flex flex-col gap-4 pt-8 pb-6 md:flex-row md:items-end md:justify-between md:pt-10',
        centered && 'md:flex-col md:items-center md:text-center',
        className,
      )}
    >
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2', centered && 'items-center')}>
        <h1
          className={cn('display', size === 'lg' ? 'text-4xl md:text-6xl' : 'text-3xl md:text-4xl')}
        >
          {title}
        </h1>
        {description ? <p className="text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
