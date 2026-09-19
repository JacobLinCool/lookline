'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import styles from './filters.module.css'

/** A keyboard-accessible disclosure whose content remains mounted during the short close. */
export function FilterDisclosure({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className={className}>
      <button
        type="button"
        className={styles.disclosureButton}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight aria-hidden />
        <span>{label}</span>
      </button>
      <div
        id={id}
        className={styles.disclosurePanel}
        data-open={open}
        aria-hidden={!open}
        inert={!open}
      >
        <div className={styles.disclosureClip}>
          <div className={styles.disclosureContent}>{children}</div>
        </div>
      </div>
    </div>
  )
}
