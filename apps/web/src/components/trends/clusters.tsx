import type { TrendDashboard } from '@lookline/engine'
import { Card } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { aestheticLabel } from '@/i18n/taxonomy'

type Cluster = TrendDashboard['clusters'][number]

/** Taste clusters: k-means over preference vectors, labelled by the top centroid aesthetics. */
export async function Clusters({ clusters }: { clusters: Cluster[] }) {
  const { t, locale } = await getI18n()
  if (clusters.length === 0) {
    return <p className="text-[13px] text-muted">{t.trends.clusters.empty}</p>
  }
  const total = clusters.reduce((s, c) => s + c.size, 0)
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {clusters
        .toSorted((a, b) => b.size - a.size)
        .map((c) => (
          <Card as="li" key={c.id} surface="panel" padding="sm">
            <h3 className="text-[17px] leading-tight">
              {c.topAesthetics
                .slice(0, 2)
                .map((slug) => aestheticLabel(locale, slug))
                .join(' / ') || t.trends.clusters.unlabelled}
            </h3>
            <p className="tabular mt-1 text-[12px] text-muted">
              {t.trends.clusters.meta(
                c.id,
                t.common.count.people(c.size),
                total > 0 ? `${Math.round((c.size / total) * 100)}%` : null,
              )}
            </p>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-xs bg-card">
              <div
                className="h-full bg-ink"
                style={{ width: `${total > 0 ? (c.size / total) * 100 : 0}%` }}
              />
            </div>
            {c.topAesthetics.length > 0 ? (
              <p className="mt-3 text-[12px] leading-snug text-muted">
                {c.topAesthetics
                  .slice(0, 4)
                  .map((slug) => aestheticLabel(locale, slug))
                  .join(' · ')}
              </p>
            ) : null}
          </Card>
        ))}
    </ul>
  )
}
