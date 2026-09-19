'use client'

import { Search } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/cn'
import { ExampleChips } from './example-chips'

export const SAY_IT_INPUT_ID = 'say-it-q'

/** Bilingual examples; each exercises a different slot (occasion + budget, gift, reference, outfit). */
export const EXAMPLE_SENTENCES = [
  '下週要去朋友婚禮，預算五千，不想太正式',
  'gift for my dad under $100, he likes hiking',
  'something like a Tokyo streetwear look but for a woman, under NT$4,000',
  '幫我配一套約會穿搭，喜歡韓系簡約',
] as const

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
            What are you dressing for?
          </label>
        ) : null}
        <Input
          id={SAY_IT_INPUT_ID}
          name="q"
          size={compact ? 'md' : 'lg'}
          defaultValue={q}
          placeholder={
            compact ? 'Change the sentence' : 'A wedding next week, under NT$5,000, not too formal'
          }
          aria-label={compact ? 'Your sentence' : undefined}
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
          Find pieces
        </Button>
      </form>
      {examples ? <ExampleChips examples={EXAMPLE_SENTENCES} inputId={SAY_IT_INPUT_ID} /> : null}
    </div>
  )
}
