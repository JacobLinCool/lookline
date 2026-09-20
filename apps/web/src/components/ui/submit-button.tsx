'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui'

interface SubmitButtonProps {
  children: ReactNode
  /** Label while the server action runs ("Generating your edition…"). */
  pendingLabel?: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
  disabled?: boolean
  icon?: ReactNode
  className?: string
}

/** Form submit with a pending state from `useFormStatus` (image generation takes seconds). */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  full,
  disabled,
  icon,
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      full={full}
      disabled={disabled || pending}
      icon={icon}
      className={className}
      aria-busy={pending}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  )
}
