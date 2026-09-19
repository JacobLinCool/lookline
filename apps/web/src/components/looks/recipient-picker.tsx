'use client'

import { useState } from 'react'
import type { PurchaseFor } from '@lookline/db'
import { cn } from '@/lib/cn'
import { Field, Input } from '@/components/ui'

const OPTIONS: Array<{ value: PurchaseFor; label: string }> = [
  { value: 'self', label: 'Me' },
  { value: 'other', label: 'Someone else' },
  { value: 'undisclosed', label: 'Not now' },
]

/**
 * "Recipient": a button-like radio row (`forKind`) and, for "Someone else", one name field
 * (`forLabel`). Client-only for the reveal; the values post through the surrounding form.
 */
export function RecipientPicker({ defaultValue = 'self' }: { defaultValue?: PurchaseFor }) {
  const [kind, setKind] = useState<PurchaseFor>(defaultValue)
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">Recipient</legend>
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center justify-center rounded-sm border border-line bg-card px-3 text-[13px] font-medium transition-colors',
              'hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-paper',
            )}
          >
            <input
              type="radio"
              name="forKind"
              value={option.value}
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {kind === 'other' ? (
        <Field label="Who is it for" htmlFor="forLabel" hint="A name is enough. Only you see it.">
          <Input
            id="forLabel"
            name="forLabel"
            maxLength={60}
            placeholder="Mom · 小美 · a friend"
            autoComplete="off"
            lang="zh-Hant"
            className="max-w-sm"
          />
        </Field>
      ) : null}
    </fieldset>
  )
}
