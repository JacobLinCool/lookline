'use client'

import { useI18n } from '@/i18n/client'

/** The shell stays interactive while the destination's server content is streamed. */
export default function Loading() {
  const { t } = useI18n()
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8" role="status" aria-busy="true">
      <p className="text-[13px] text-muted">{t.common.loading}</p>
      <div aria-hidden className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-[3/4] rounded-md bg-mist" />
        ))}
      </div>
    </div>
  )
}
