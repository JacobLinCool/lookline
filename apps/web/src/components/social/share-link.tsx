'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui'
import { useI18n } from '@/i18n/client'

export interface ShareLinkProps {
  /** Path such as `/l/abc123`; resolved against `window.location.origin` on the client. */
  path: string
  /** Field label; the translated "Link" by default. */
  label?: string
  className?: string
}

const noopSubscribe = () => () => {}
const getOrigin = () => window.location.origin
const getServerOrigin = () => ''

/** The link, with a copy button. Renders the path on the server, the absolute URL once mounted. */
export function ShareLink({ path, label, className }: ShareLinkProps) {
  const { t } = useI18n()
  const origin = useSyncExternalStore(noopSubscribe, getOrigin, getServerOrigin)
  const href = `${origin}${path}`
  const [copied, setCopied] = useState(false)
  const fieldLabel = label ?? t.social.share.link

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
    } catch {
      window.prompt(t.social.share.copyPrompt, href)
    }
  }

  return (
    <div className={className}>
      <p className="mb-1.5 text-[13px] font-medium">{fieldLabel}</p>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={href}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={fieldLabel}
          size={1}
          className="tabular h-10 w-0 min-w-0 flex-1 rounded-sm border border-line bg-card px-3 text-[13px] text-ink"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={copy}
          icon={copied ? <Check /> : <Copy />}
          aria-live="polite"
        >
          {copied ? t.common.copied : t.common.copy}
        </Button>
      </div>
    </div>
  )
}
