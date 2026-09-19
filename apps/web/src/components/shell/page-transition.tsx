'use client'

import { ViewTransition, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/** Only route changes crossfade; filters, transcripts and other live updates stay immediate. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <ViewTransition key={pathname} name="page-content" default="none" share="page-change">
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
    </ViewTransition>
  )
}
