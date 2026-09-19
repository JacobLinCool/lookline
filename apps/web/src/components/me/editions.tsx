import type { Look } from '@lookline/db'
import {
  Button,
  EmptyState,
  LookCard,
  type LookCardOwner,
  type LookLineageHint,
} from '@/components/ui'
import { getI18n } from '@/i18n/server'

export interface EditionItem {
  look: Look
  owner: LookCardOwner
  lineage?: LookLineageHint
  productCount: number
}

/** The viewer's Looks (own, or made together), newest first. */
export async function EditionsGrid({
  items,
  viewerHandle,
}: {
  items: EditionItem[]
  viewerHandle: string
}) {
  const { t } = await getI18n()
  if (items.length === 0) {
    return (
      <EmptyState
        title={t.me.looks.empty}
        action={<Button href="/looks/new">{t.me.newLook}</Button>}
      />
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 lg:grid-cols-4">
      {items.map(({ look, owner, lineage }, i) => (
        <li key={look.id}>
          <LookCard
            look={look}
            owner={owner}
            lineage={lineage}
            hideOwner={owner.handle === viewerHandle}
            priority={i < 4}
          />
        </li>
      ))}
    </ul>
  )
}
