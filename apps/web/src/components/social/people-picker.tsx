import type { ReactNode } from 'react'
import type { UserSummary } from '@lookline/engine'
import { Avatar } from '@/components/ui'
import { cn } from '@/lib/cn'

export interface PeoplePickerProps {
  people: UserSummary[]
  name: string
  kind?: 'radio' | 'checkbox'
  /** Optional slot rendered under a person (e.g. a select of their Looks). */
  renderExtra?: (person: UserSummary) => ReactNode
  className?: string
}

/** People from the viewer's network as selectable tiles. */
export function PeoplePicker({
  people,
  name,
  kind = 'checkbox',
  renderExtra,
  className,
}: PeoplePickerProps) {
  return (
    <ul className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {people.map((person) => {
        const id = `${name}-${person.id}`
        return (
          <li key={person.id}>
            <label
              htmlFor={id}
              className="flex h-full cursor-pointer flex-col gap-3 rounded-md border border-line bg-card p-3 transition-colors hover:border-ink has-checked:border-ink has-checked:bg-mist"
            >
              <div className="flex items-center gap-3">
                <input
                  id={id}
                  type={kind}
                  name={name}
                  value={person.id}
                  className="size-4 shrink-0 accent-ink"
                />
                <Avatar seed={person.avatarSeed} name={person.displayName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] leading-tight font-medium">
                    {person.displayName}
                  </p>
                  <p className="truncate text-[12px] text-muted">@{person.handle}</p>
                </div>
              </div>
              {renderExtra ? renderExtra(person) : null}
            </label>
          </li>
        )
      })}
    </ul>
  )
}
