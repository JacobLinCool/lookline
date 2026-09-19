import type { LineageNode, LineageTree } from '@lookline/engine'
import Link from 'next/link'
import { Avatar, Tag } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import type { Messages } from '@/i18n/messages'
import { getI18n } from '@/i18n/server'
import { cn } from '@/lib/cn'
import { formatRelative, formatTwd } from '@/server/format'
import { longDate, num, pct } from './format'

interface Reader {
  t: Messages
  locale: Locale
}

function NodeRow({
  node,
  currentId,
  t,
  locale,
}: { node: LineageNode; currentId: string } & Reader) {
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
          {look.kind !== 'edition' ? (
            <Tag tone="outline">{t.trends.lineage.kind[look.kind]}</Tag>
          ) : null}
          {isCurrent ? <Tag tone="ink">{t.trends.lineage.thisLook}</Tag> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <Avatar seed={owner.avatarSeed} name={owner.displayName} size={18} />
            {owner.displayName}
          </span>
          <span title={longDate(look.createdAt, locale)}>
            {formatRelative(look.createdAt, locale)}
          </span>
          {node.reactions > 0 ? (
            <span className="tabular">{t.common.count.likes(node.reactions)}</span>
          ) : null}
          {node.purchases > 0 ? (
            <span className="tabular">{t.common.count.purchases(node.purchases)}</span>
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
  t,
  locale,
}: { node: LineageNode; currentId: string; depth: number } & Reader) {
  return (
    <li className="flex flex-col gap-2">
      <NodeRow node={node} currentId={currentId} t={t} locale={locale} />
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
              <Branch
                key={child.look.id}
                node={child}
                currentId={currentId}
                depth={depth + 1}
                t={t}
                locale={locale}
              />
            ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Indented tree of a lineage: root first, children in creation order, the current Look marked. */
export async function LineageTreeView({
  tree,
  currentId,
}: {
  tree: LineageTree
  currentId: string
}) {
  const { t, locale } = await getI18n()
  return (
    <ul className="flex flex-col gap-2">
      <Branch node={tree.root} currentId={currentId} depth={0} t={t} locale={locale} />
    </ul>
  )
}

/** Per-root statistics from `lineage_stats` (Engine view). */
export async function LineageStatsPanel({ stats }: { stats: LineageTree['stats'] }) {
  const { t, locale } = await getI18n()
  const s = t.trends.lineage.stats
  const rows: Array<[string, string]> = [
    [s.depth, String(stats.depth)],
    [s.nodes, String(stats.nodes)],
    [s.people, String(stats.uniquePeople)],
    [s.clusters, String(stats.clustersReached)],
    [s.shares, String(stats.shares)],
    [s.remixes, String(stats.remixes)],
    [s.purchases, String(stats.purchases)],
    [s.gmv, formatTwd(stats.gmv)],
    [s.velocity, t.trends.lineage.velocityValue(num(stats.velocity, 2))],
    [s.shareToRemix, pct(stats.shareToRemixRate)],
    [s.remixToPurchase, pct(stats.remixToPurchaseRate)],
    [s.firstLook, longDate(stats.firstAt, locale)],
    [s.latestLook, longDate(stats.lastAt, locale)],
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
