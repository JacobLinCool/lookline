'use client'

import { useI18n } from '@/i18n/client'
import type { LookLineageHint } from './look-card'

/**
 * Where a Look came from, in the reader's language. A client island inside the otherwise
 * server-rendered card, so the caption needs no locale prop threaded through every rail.
 */
export function LineageText({ hint }: { hint: LookLineageHint }) {
  const { t } = useI18n()
  if (typeof hint === 'string') return hint
  return hint.kind === 'together' ? t.ui.lineage.with(hint.handle) : t.ui.lineage.after(hint.handle)
}
