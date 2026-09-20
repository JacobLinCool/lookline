'use client'

import { useState } from 'react'
import type { PurchaseFor } from '@lookline/db'
import { cn } from '@/lib/cn'
import { Field, Input } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import type { Messages } from '@/i18n'

const options = (t: Messages): Array<{ value: PurchaseFor; label: string }> => [
  { value: 'self', label: t.imagery.recipient.self },
  { value: 'other', label: t.imagery.recipient.other },
  { value: 'undisclosed', label: t.imagery.recipient.undisclosed },
]

/**
 * "Recipient": a button-like radio row (`forKind`) and, for "Someone else", one name field
 * (`forLabel`). Client-only for the reveal; the values post through the surrounding form.
 */
export function RecipientPicker({ defaultValue = 'self' }: { defaultValue?: PurchaseFor }) {
  const { t } = useI18n()
  const [kind, setKind] = useState<PurchaseFor>(defaultValue)
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">
        {t.imagery.recipient.legend}
      </legend>
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {options(t).map((option) => (
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
        <Field label={t.imagery.recipient.label} htmlFor="forLabel" hint={t.imagery.recipient.hint}>
          <Input
            id="forLabel"
            name="forLabel"
            maxLength={60}
            placeholder={t.imagery.recipient.placeholder}
            autoComplete="off"
            lang="zh-Hant"
            className="max-w-sm"
          />
        </Field>
      ) : null}
    </fieldset>
  )
}
