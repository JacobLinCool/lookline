'use client'

import type { MouseEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { FilterHintId } from '@lookline/engine/hints'
import styles from './filters.module.css'
import { HINT_COPY, type HintChoice } from './hints'

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
  const copy = HINT_COPY[id]
  return (
    <div key={id} className={styles.hint} role="group" aria-label={copy.question}>
      <span className={styles.hintQuestion}>{copy.question}</span>
      <div className={styles.chips}>
        {copy.choices.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className={styles.chip}
            onMouseDown={keepFocus}
            onClick={() => onChoose(choice)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.hintSkip}
        onMouseDown={keepFocus}
        onClick={onSkip}
        aria-label="Next question"
        title="Next question"
      >
        <ChevronRight aria-hidden />
      </button>
    </div>
  )
}
