'use client'

import type { MouseEvent } from 'react'
import { useI18n } from '@/i18n/client'
import { intentHref } from './urls'

export interface ExampleChipsProps {
  examples: readonly string[]
  /** `id` of the sentence input; the chip fills it and submits its form. */
  inputId: string
  className?: string
}

/**
 * Example sentences in the reader's language. Each is a real link (`/?q=…`) so it works without
 * JavaScript; with JavaScript it fills the field and submits the form, which reads as "typing".
 */
export function ExampleChips({ examples, inputId, className }: ExampleChipsProps) {
  const { t } = useI18n()
  function pick(event: MouseEvent<HTMLAnchorElement>, example: string) {
    const input = document.getElementById(inputId)
    if (!(input instanceof HTMLInputElement) || !input.form) return
    event.preventDefault()
    input.value = example
    input.focus()
    input.form.requestSubmit()
  }
  return (
    <ul
      className={className ?? 'flex max-w-full flex-wrap gap-2'}
      aria-label={t.home.sayIt.examplesLabel}
    >
      {examples.map((example) => (
        <li key={example} className="min-w-0 max-w-full">
          <a
            href={intentHref({ q: example })}
            onClick={(event) => pick(event, example)}
            className="block h-9 max-w-full truncate rounded-sm border border-line bg-card px-3 text-[13px] leading-9 text-ink transition-colors hover:border-ink md:max-w-[24rem]"
          >
            {example}
          </a>
        </li>
      ))}
    </ul>
  )
}
