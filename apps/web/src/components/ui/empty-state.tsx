import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  /** @deprecated Not rendered. */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Usually a `<Button>`; rendered under the description. */
  action?: ReactNode
  /** Optional lucide icon element, rendered small and muted above the title. */
  icon?: ReactNode
  className?: string
}

/** The state in one line, one next action. Never a paragraph. */
export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-md bg-mist px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-1 text-muted [&_svg]:size-5">{icon}</div> : null}
      <h3 className="max-w-md text-[17px]">{title}</h3>
      {description ? <p className="max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
