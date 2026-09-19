'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui'

interface PieceToggleProps {
  /** Checkbox `name` inside the surrounding form. */
  name: string
  /** A Look takes at most this many pieces; "all" checks the first `max`. */
  max: number
  selectAllLabel: string
  clearLabel: string
}

/** Select-all / select-none for the uncontrolled piece checkboxes of the new-Look form. */
export function PieceToggle({ name, max, selectAllLabel, clearLabel }: PieceToggleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const setAll = (checked: boolean) => {
    const boxes = ref.current
      ?.closest('form')
      ?.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)
    boxes?.forEach((box, index) => {
      box.checked = checked && index < max
    })
  }
  return (
    <div ref={ref} className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
        {selectAllLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAll(false)}>
        {clearLabel}
      </Button>
    </div>
  )
}
