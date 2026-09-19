import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type NoticeTone = 'info' | 'success' | 'warning' | 'error'

const toneStyles: Record<NoticeTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-mist text-ink', icon: <Info /> },
  success: { box: 'border border-line bg-card text-ink', icon: <CircleCheck /> },
  warning: { box: 'bg-accent-soft text-ink', icon: <TriangleAlert /> },
  error: { box: 'bg-accent-soft text-accent', icon: <CircleAlert /> },
}

export interface NoticeProps {
  tone?: NoticeTone
  title?: ReactNode
  /** Right-aligned action (a `<Button size="sm">`). */
  action?: ReactNode
  className?: string
  children?: ReactNode
}

/** One line: what happened, and what can be done. */
export function Notice({ tone = 'info', title, action, className, children }: NoticeProps) {
  const style = toneStyles[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-sm px-4 py-3 text-[13px] leading-snug',
        style.box,
        className,
      )}
    >
      <span className="mt-px shrink-0 [&_svg]:size-4">{style.icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-inherit opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
