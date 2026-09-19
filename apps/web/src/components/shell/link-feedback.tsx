'use client'

import { useLinkStatus } from 'next/link'
import { useI18n } from '@/i18n/client'

/** Pending belongs to the actual router request, and clears on cancellation or failure. */
export function LinkFeedback() {
  const { pending } = useLinkStatus()
  const { t } = useI18n()
  return pending ? (
    <span role="status" className="navigation-pending">
      <span className="sr-only">{t.common.loading}</span>
    </span>
  ) : null
}
