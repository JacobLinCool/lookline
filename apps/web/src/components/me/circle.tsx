import type { RelationshipKind } from '@lookline/db'
import type { UserNetwork } from '@lookline/engine'
import { Avatar } from '@/components/ui'
import type { MeMessages } from '@/i18n/messages/en/me'
import { getI18n } from '@/i18n/server'

type Edge = UserNetwork['edges'][number]

const KIND_ORDER: RelationshipKind[] = [
  'inspired_by',
  'styles',
  'buys_for',
  'shops_with',
  'remixed',
]

/**
 * Plain-language sentence for a directed edge. `out` means the signed-in user is `a` in
 * `a → b`. Numeric weights are deliberately never shown.
 */
export function describeEdge(edge: Edge, m: MeMessages['people']['edges']): string {
  const name = edge.other.displayName
  const out = edge.direction === 'out'
  switch (edge.relationship.kind) {
    case 'inspired_by':
      return out ? m.inspiredOut(name) : m.inspiredIn(name)
    case 'styles':
      return out ? m.stylesOut(name) : m.stylesIn(name)
    case 'buys_for':
      return out ? m.buysForOut(name) : m.buysForIn(name)
    case 'shops_with':
      return m.shopsWith(name)
    case 'remixed':
      return out ? m.remixedOut(name) : m.remixedIn(name)
  }
}

/** People: derived relationships grouped by kind, described in words. */
export async function Circle({ network }: { network: UserNetwork }) {
  const { t } = await getI18n()
  if (network.edges.length === 0) {
    return <p className="text-[13px] text-muted">{t.me.people.empty}</p>
  }
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    edges: network.edges
      .filter((e) => e.relationship.kind === kind)
      .toSorted((a, b) => b.relationship.lastAt.getTime() - a.relationship.lastAt.getTime()),
  })).filter((g) => g.edges.length > 0)

  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map(({ kind, edges }) => (
        <div key={kind} className="flex flex-col gap-2">
          <p className="text-[13px] font-medium">{t.me.people.kinds[kind]}</p>
          <ul className="flex flex-col">
            {edges.slice(0, 4).map((edge) => (
              <li
                key={`${kind}:${edge.direction}:${edge.other.id}`}
                className="flex items-center gap-3 py-2"
              >
                <Avatar seed={edge.other.avatarSeed} name={edge.other.displayName} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {describeEdge(edge, t.me.people.edges)}
                </span>
              </li>
            ))}
            {edges.length > 4 ? (
              <li className="py-1 text-[12px] text-muted">
                {t.me.people.andMore(edges.length - 4)}
              </li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  )
}
