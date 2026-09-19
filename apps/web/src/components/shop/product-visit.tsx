'use client'
import { useEffect } from 'react'

/** A prefetched server render is not a visit. Record only when the product is actually mounted. */
export function ProductVisit({
  id,
  from,
  position,
}: {
  id: string
  from?: string
  position: number | null
}) {
  useEffect(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (position !== null) params.set('pos', String(position))
    void fetch(`/api/articles/${id}/view?${params}`, { method: 'POST', keepalive: true }).catch(
      () => {},
    )
  }, [id, from, position])
  return null
}
