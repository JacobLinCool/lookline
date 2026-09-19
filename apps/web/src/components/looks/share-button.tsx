'use client'

import { Check, Link2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui'
import { shareLookAction } from '@/server/actions/looks'

interface ShareButtonProps {
  lookId: string
  /** `/l/<shareToken>`; the button prefixes the current origin. */
  sharePath: string
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
}

type State = 'idle' | 'copied' | 'shown'

/**
 * "Share" — copies the `/l/<token>` link and records a SHARE interaction so propagation shows up
 * in the lineage. Shows the link when the clipboard is unavailable (plain http on a LAN).
 */
export function ShareButton({
  lookId,
  sharePath,
  variant = 'secondary',
  size,
  full,
}: ShareButtonProps) {
  const [state, setState] = useState<State>('idle')
  const [pending, startTransition] = useTransition()
  const url = typeof window === 'undefined' ? sharePath : `${window.location.origin}${sharePath}`

  function share() {
    startTransition(async () => {
      let copied = false
      try {
        await navigator.clipboard.writeText(url)
        copied = true
      } catch {
        copied = false
      }
      setState(copied ? 'copied' : 'shown')
      try {
        await shareLookAction(lookId)
      } catch (error) {
        console.warn('[share] could not record the share', error)
      }
      window.setTimeout(() => setState('idle'), 2400)
    })
  }

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        full={full}
        onClick={share}
        disabled={pending}
        icon={state === 'copied' ? <Check /> : <Link2 />}
        aria-live="polite"
      >
        {state === 'copied' ? 'Link copied' : 'Share'}
      </Button>
      {state === 'shown' ? (
        <span className="text-[12px] break-all text-muted select-all">{url}</span>
      ) : null}
    </span>
  )
}
