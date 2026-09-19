'use client'

import { Search } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import { cn } from '@/lib/cn'
import { ExampleChips } from './example-chips'

export const SAY_IT_INPUT_ID = 'say-it-q'

export interface SayItFormProps {
  /** Current sentence, echoed into the field. */
  q?: string
  onQuery?: (q: string) => void
  /** Compact single row for the results view. */
  compact?: boolean
  /** Show the example sentences under the field (default: only when not compact). */
  examples?: boolean
  className?: string
}

/**
 * The one-sentence field. Plain GET to `/` with `q`, so the URL is shareable and the back button
 * replays a turn; clarification answers are separate `clarify` links.
 */
export function SayItForm({
  q = '',
  onQuery,
  compact = false,
  examples = !compact,
  className,
}: SayItFormProps) {
  const { t } = useI18n()
  const sayIt = t.home.sayIt
  return (
    <div className={cn('flex w-full flex-col gap-4', className)}>
      <form
        onSubmit={
          onQuery
            ? (event) => {
                event.preventDefault()
                const value = String(new FormData(event.currentTarget).get('q') ?? '').trim()
                if (value) onQuery(value)
              }
            : undefined
        }
        action="/"
        method="get"
        className={cn('flex w-full gap-2', compact ? 'flex-row' : 'flex-col md:flex-row')}
      >
        {!compact ? (
          <label htmlFor={SAY_IT_INPUT_ID} className="sr-only">
            {sayIt.label}
          </label>
        ) : null}
        <Input
          id={SAY_IT_INPUT_ID}
          name="q"
          size={compact ? 'md' : 'lg'}
          defaultValue={q}
          placeholder={compact ? sayIt.compactPlaceholder : sayIt.placeholder}
          aria-label={compact ? sayIt.compactLabel : undefined}
          autoComplete="off"
          maxLength={500}
          required
          autoFocus={!q && !compact}
          className={cn(!compact && 'font-display md:text-[22px]')}
        />
        <Button
          type="submit"
          size={compact ? 'md' : 'lg'}
          icon={<Search />}
          className={cn(!compact && 'md:h-16 md:px-6')}
        >
          {sayIt.submit}
        </Button>
      </form>
      {examples ? <ExampleChips examples={sayIt.examples} inputId={SAY_IT_INPUT_ID} /> : null}
    </div>
  )
}
