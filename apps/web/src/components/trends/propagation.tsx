import type { TrendDashboard } from '@lookline/engine'
import { Button, LookCard } from '@/components/ui'
import { formatTwd, pluralize } from '@/server/format'

type TopLineage = TrendDashboard['topLineages'][number]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="tabular truncate text-[13px] font-medium">{value}</dd>
    </div>
  )
}

/** Top propagation trees: the root Look and how far, wide and profitably it travelled. */
export function Propagation({ lineages, limit = 6 }: { lineages: TopLineage[]; limit?: number }) {
  const shown = lineages.slice(0, limit)
  if (shown.length === 0) {
    return <p className="text-[13px] text-muted">No lineage has more than one Look yet.</p>
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-6">
      {shown.map(({ stats, look, owner }) => (
        <li key={look.id}>
          <LookCard
            look={look}
            owner={owner}
            lineage={`Root of ${pluralize(stats.nodes, 'Look')}`}
            footer={
              <div className="flex flex-col gap-2 border-t border-line pt-2">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Stat label="People" value={String(stats.uniquePeople)} />
                  <Stat label="Clusters" value={String(stats.clustersReached)} />
                  <Stat label="Purchases" value={String(stats.purchases)} />
                  <Stat label="GMV" value={formatTwd(stats.gmv)} />
                </dl>
                <Button href={`/looks/${look.id}/lineage`} variant="link" size="sm">
                  See the tree
                </Button>
              </div>
            }
          />
        </li>
      ))}
    </ul>
  )
}
