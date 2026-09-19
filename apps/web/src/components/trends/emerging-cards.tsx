import type { TrendSeries } from '@lookline/engine'
import { Card, Tag } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { num, pct } from './format'
import { seriesLabel } from './momentum-table'
import { CHART } from './palette'

/** Inline sparkline of the last days of volume; the last point is marked. */
function Sparkline({ points }: { points: Array<{ day: string; volume: number }> }) {
  const w = 160
  const h = 36
  if (points.length < 2) return <div className="h-9" aria-hidden />
  const max = Math.max(1, ...points.map((p) => p.volume))
  const step = w / (points.length - 1)
  const coords = points.map((p, i) => [i * step, h - 2 - (p.volume / max) * (h - 4)] as const)
  const d = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const last = coords[coords.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-40 max-w-full text-ink" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {last ? <circle cx={last[0]} cy={last[1]} r={2.5} fill={CHART.accent} /> : null}
    </svg>
  )
}

/** "Emerging now": low base volume, sharp velocity, spread across at least two clusters. */
export async function EmergingCards({ rows, limit = 6 }: { rows: TrendSeries[]; limit?: number }) {
  const { t, locale } = await getI18n()
  const shown = rows.toSorted((a, b) => b.momentum - a.momentum).slice(0, limit)
  if (shown.length === 0) {
    return <p className="text-[13px] text-muted">{t.trends.emerging.empty}</p>
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((row) => (
        <Card as="li" key={`${row.dimension}:${row.key}`} surface="panel" padding="sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="truncate text-[17px] leading-tight">{seriesLabel(locale, row)}</h3>
              <p className="text-[12px] text-muted">{t.trends.dimension[row.dimension]}</p>
            </div>
            <Tag tone="accent">{t.trends.status.emerging}</Tag>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <Sparkline points={row.series} />
            <dl className="tabular grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right text-[12px]">
              <dt className="text-muted">{t.trends.metric.momentum}</dt>
              <dd className="font-medium">{Math.round(row.momentum)}</dd>
              <dt className="text-muted">{t.trends.metric.velocity}</dt>
              <dd>
                {row.velocity >= 0 ? '+' : '−'}
                {pct(Math.abs(row.velocity))}
              </dd>
              <dt className="text-muted">{t.trends.metric.crossCluster}</dt>
              <dd>{num(row.crossCluster)}</dd>
            </dl>
          </div>
        </Card>
      ))}
    </ul>
  )
}
