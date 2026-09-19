import type { LineageNode, LineageTree } from '@lookline/engine'
import Link from 'next/link'
import { Avatar, Tag } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatRelative, formatTwd, pluralize } from '@/server/format'
import { longDate, num, pct } from './format'

const KIND_LABEL: Record<string, string> = {
  edition: 'Look',
  remix: 'Made it theirs',
  together: 'Together',
}

function NodeRow({ node, currentId }: { node: LineageNode; currentId: string }) {
  const { look, owner } = node
  const isCurrent = look.id === currentId
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md px-3 py-2.5',
        isCurrent ? 'bg-mist ring-1 ring-ink' : 'bg-card ring-1 ring-line',
      )}
    >
      <Link
        href={`/looks/${look.id}`}
        className="block h-16 w-12 shrink-0 overflow-hidden rounded-xs bg-mist"
      >
        <img
          src={`/api/looks/${look.id}/image`}
          alt={look.title}
          width={48}
          height={64}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/looks/${look.id}`}
            className="text-[14px] leading-tight font-medium hover:underline underline-offset-4"
          >
            {look.title}
          </Link>
          {look.kind !== 'edition' ? <Tag tone="outline">{KIND_LABEL[look.kind]}</Tag> : null}
          {isCurrent ? <Tag tone="ink">This Look</Tag> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <Avatar seed={owner.avatarSeed} name={owner.displayName} size={18} />
            {owner.displayName}
          </span>
          <span title={longDate(look.createdAt)}>{formatRelative(look.createdAt)}</span>
          {node.reactions > 0 ? (
            <span className="tabular">{pluralize(node.reactions, 'like')}</span>
          ) : null}
          {node.purchases > 0 ? (
            <span className="tabular">{pluralize(node.purchases, 'purchase')}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Branch({
  node,
  currentId,
  depth,
}: {
  node: LineageNode
  currentId: string
  depth: number
}) {
  return (
    <li className="flex flex-col gap-2">
      <NodeRow node={node} currentId={currentId} />
      {node.children.length > 0 ? (
        <ul
          className={cn(
            'ml-4 flex flex-col gap-2 border-l border-line pl-4 md:ml-6 md:pl-6',
            depth >= 6 && 'ml-2 pl-2',
          )}
        >
          {node.children
            .toSorted((a, b) => a.look.createdAt.getTime() - b.look.createdAt.getTime())
            .map((child) => (
              <Branch key={child.look.id} node={child} currentId={currentId} depth={depth + 1} />
            ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Indented tree of a lineage: root first, children in creation order, the current Look marked. */
export function LineageTreeView({ tree, currentId }: { tree: LineageTree; currentId: string }) {
  return (
    <ul className="flex flex-col gap-2">
      <Branch node={tree.root} currentId={currentId} depth={0} />
    </ul>
  )
}

/** Per-root statistics from `lineage_stats` (Engine view). */
export function LineageStatsPanel({ stats }: { stats: LineageTree['stats'] }) {
  const rows: Array<[string, string]> = [
    ['Depth', String(stats.depth)],
    ['Looks in tree', String(stats.nodes)],
    ['People touched', String(stats.uniquePeople)],
    ['Taste clusters reached', String(stats.clustersReached)],
    ['Shares', String(stats.shares)],
    ['Asks', String(stats.asks)],
    ['Remixes', String(stats.remixes)],
    ['Purchases', String(stats.purchases)],
    ['Downstream GMV', formatTwd(stats.gmv)],
    ['Velocity', `${num(stats.velocity, 2)} Looks/day`],
    ['Share → remix', pct(stats.shareToRemixRate)],
    ['Remix → purchase', pct(stats.remixToPurchaseRate)],
    ['First Look', longDate(stats.firstAt)],
    ['Latest Look', longDate(stats.lastAt)],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3 lg:grid-cols-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 border-b border-line pb-2">
          <dt className="text-[11px] text-muted">{label}</dt>
          <dd className="tabular font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
