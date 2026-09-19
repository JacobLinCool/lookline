import type { RelationshipKind } from '@lookline/db'
import type { UserNetwork } from '@lookline/engine'
import { Avatar } from '@/components/ui'

type Edge = UserNetwork['edges'][number]

const KIND_ORDER: RelationshipKind[] = [
  'asks',
  'trusts',
  'inspired_by',
  'styles',
  'buys_for',
  'shops_with',
  'remixed',
]

const KIND_HEADING: Record<RelationshipKind, string> = {
  asks: 'Advice',
  trusts: 'Trust',
  inspired_by: 'Inspiration',
  styles: 'Styling',
  buys_for: 'Buying for',
  shops_with: 'Shopping together',
  remixed: 'Made it theirs',
}

/**
 * Plain-language sentence for a directed edge. `out` means the signed-in user is `a` in
 * `a → b`. Numeric weights are deliberately never shown.
 */
export function describeEdge(edge: Edge): string {
  const name = edge.other.displayName
  const out = edge.direction === 'out'
  switch (edge.relationship.kind) {
    case 'asks':
      return out ? `You ask ${name} for advice` : `${name} asks you for advice`
    case 'trusts':
      return out ? `You act on ${name}'s advice` : `${name} acts on your advice`
    case 'inspired_by':
      return out ? `Inspired by ${name}` : `${name} is inspired by you`
    case 'styles':
      return out ? `You style ${name}` : `${name} styles you`
    case 'buys_for':
      return out ? `You buy for ${name}` : `${name} buys for you`
    case 'shops_with':
      return `You shop with ${name}`
    case 'remixed':
      return out ? `${name} made your Look theirs` : `You made ${name}'s Look yours`
  }
}

/** People: derived relationships grouped by kind, described in words. */
export function Circle({ network }: { network: UserNetwork }) {
  if (network.edges.length === 0) {
    return <p className="text-[13px] text-muted">No one yet. Ask a friend, or make a Look yours.</p>
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
          <p className="text-[13px] font-medium">{KIND_HEADING[kind]}</p>
          <ul className="flex flex-col">
            {edges.slice(0, 4).map((edge) => (
              <li
                key={`${kind}:${edge.direction}:${edge.other.id}`}
                className="flex items-center gap-3 py-2"
              >
                <Avatar seed={edge.other.avatarSeed} name={edge.other.displayName} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{describeEdge(edge)}</span>
              </li>
            ))}
            {edges.length > 4 ? (
              <li className="py-1 text-[12px] text-muted">and {edges.length - 4} more</li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  )
}
