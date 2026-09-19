'use client'

import type { MouseEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { FilterHintId } from '@lookline/engine/hints'
import { useI18n } from '@/i18n/client'
import styles from './filters.module.css'
import { HINT_CHOICES, type HintChoice } from './hints'

/** Keep the caret in the sentence field while a choice is clicked. */
const keepFocus = (event: MouseEvent) => event.preventDefault()

/** One question under the sentence field; each answer is inserted as the sentence's next clause. */
export function HintRow({
  id,
  onChoose,
  onSkip,
}: {
  id: FilterHintId
  onChoose: (choice: HintChoice) => void
  onSkip: () => void
}) {
  const { t } = useI18n()
  const copy: { question: string; choices: Record<string, string> } = t.shop.hints[id]
  return (
    <div key={id} className={styles.hint} role="group" aria-label={copy.question}>
      <span className={styles.hintQuestion}>{copy.question}</span>
      <div className={styles.chips}>
        {HINT_CHOICES[id].map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={styles.chip}
            onMouseDown={keepFocus}
            onClick={() => onChoose(choice)}
          >
            {copy.choices[choice.key] ?? choice.en}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.hintSkip}
        onMouseDown={keepFocus}
        onClick={onSkip}
        aria-label={t.shop.sentence.nextQuestion}
        title={t.shop.sentence.nextQuestion}
      >
        <ChevronRight aria-hidden />
      </button>
    </div>
  )
}
