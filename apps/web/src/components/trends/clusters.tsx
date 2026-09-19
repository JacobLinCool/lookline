import type { TrendDashboard } from '@lookline/engine'
import { Card } from '@/components/ui'
import { humanize, pluralize } from '@/server/format'

type Cluster = TrendDashboard['clusters'][number]

/** Taste clusters: k-means over preference vectors, labelled by the top centroid aesthetics. */
export function Clusters({ clusters }: { clusters: Cluster[] }) {
  if (clusters.length === 0) {
    return <p className="text-[13px] text-muted">No taste groups to show yet.</p>
  }
  const total = clusters.reduce((s, c) => s + c.size, 0)
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {clusters
        .toSorted((a, b) => b.size - a.size)
        .map((c) => (
          <Card as="li" key={c.id} surface="panel" padding="sm">
            <h3 className="text-[17px] leading-tight">{c.label}</h3>
            <p className="tabular mt-1 text-[12px] text-muted">
              Cluster {c.id} · {pluralize(c.size, 'person', 'people')}
              {total > 0 ? ` · ${Math.round((c.size / total) * 100)}%` : ''}
            </p>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-xs bg-card">
              <div
                className="h-full bg-ink"
                style={{ width: `${total > 0 ? (c.size / total) * 100 : 0}%` }}
              />
            </div>
            {c.topAesthetics.length > 0 ? (
              <p className="mt-3 text-[12px] leading-snug text-muted">
                {c.topAesthetics.slice(0, 4).map(humanize).join(' · ')}
              </p>
            ) : null}
          </Card>
        ))}
    </ul>
  )
}
