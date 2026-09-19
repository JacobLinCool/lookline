import type { TrendSeries } from '@lookline/engine'
import { Tag } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { getI18n } from '@/i18n/server'
import { aestheticLabel, categoryGroupLabel, colorFamilyLabel, facetLabel } from '@/i18n/taxonomy'
import { cn } from '@/lib/cn'
import { formatTwd } from '@/server/format'
import { num, pct, splitPairKey } from './format'

export interface MomentumTableProps {
  rows: TrendSeries[]
  /** Fewer columns: label, momentum, velocity, status. */
  compact?: boolean
  /** Cap the number of rows shown. */
  limit?: number
  className?: string
}

/** A signal's name in the reader's language: the catalog's noun for the dimension it belongs to. */
export function seriesLabel(
  locale: Locale,
  series: { dimension: TrendSeries['dimension']; key: string },
): string {
  switch (series.dimension) {
    case 'aesthetic':
      return aestheticLabel(locale, series.key)
    case 'category':
      return categoryGroupLabel(locale, series.key)
    case 'color':
      return colorFamilyLabel(locale, series.key)
    case 'silhouette':
      return facetLabel(locale, series.key)
    case 'aesthetic_category': {
      const [aesthetic, group] = splitPairKey(series.key)
      if (!group) return facetLabel(locale, aesthetic)
      return `${aestheticLabel(locale, aesthetic)} × ${categoryGroupLabel(locale, group)}`
    }
  }
}

function MomentumBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value))
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-xs bg-mist">
        <span className="block h-full bg-ink" style={{ width: `${width}%` }} />
      </span>
      <span className="tabular w-7 text-right">{Math.round(value)}</span>
    </span>
  )
}

export const TABLE = 'w-full border-collapse text-[13px]'
export const THEAD_ROW =
  'text-left text-[12px] font-medium text-muted [&>th]:px-2 [&>th]:py-2 [&>th]:font-medium [&>th:first-child]:pl-0 [&>th:last-child]:pr-0'
export const BODY_ROW =
  'border-t border-line [&>td]:px-2 [&>td]:py-2.5 [&>th]:py-2.5 [&>td:last-child]:pr-0'
export const STICKY_COL = 'sticky left-0 z-10 bg-paper pr-3'

/**
 * Momentum table for one trend dimension. Momentum is the engine's 0–100 composite (velocity,
 * cross-cluster spread, conversion, lineage reach, volume); the bar is a plain magnitude.
 */
export async function MomentumTable({
  rows,
  compact = false,
  limit,
  className,
}: MomentumTableProps) {
  const { t, locale } = await getI18n()
  const shown = (limit ? rows.slice(0, limit) : rows).toSorted((a, b) => b.momentum - a.momentum)
  if (shown.length === 0) {
    return <p className="text-[13px] text-muted">{t.trends.table.empty}</p>
  }
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className={cn(TABLE, compact ? 'min-w-[22rem]' : 'min-w-[40rem]')}>
        <thead>
          <tr className={THEAD_ROW}>
            <th className={STICKY_COL}>
              {compact ? t.trends.table.name : t.trends.table.aesthetic}
            </th>
            <th className="text-right">{t.trends.metric.momentum}</th>
            {!compact ? <th className="text-right">{t.trends.metric.volume}</th> : null}
            <th className="text-right">{t.trends.metric.velocity}</th>
            {!compact ? <th className="text-right">{t.trends.metric.crossCluster}</th> : null}
            {!compact ? <th className="text-right">{t.trends.metric.conversion}</th> : null}
            {!compact ? <th className="text-right">{t.trends.metric.gmv}</th> : null}
            <th className="text-right">{t.trends.table.status}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={`${row.dimension}:${row.key}`} className={BODY_ROW}>
              <th scope="row" className={cn(STICKY_COL, 'text-left font-medium whitespace-nowrap')}>
                {seriesLabel(locale, row)}
              </th>
              <td className="text-right">
                <MomentumBar value={row.momentum} />
              </td>
              {!compact ? <td className="tabular text-right">{row.volume}</td> : null}
              <td
                className={cn('tabular text-right', row.velocity > 0 ? 'text-ink' : 'text-muted')}
              >
                {row.velocity >= 0 ? '+' : '−'}
                {pct(Math.abs(row.velocity))}
              </td>
              {!compact ? <td className="tabular text-right">{num(row.crossCluster)}</td> : null}
              {!compact ? <td className="tabular text-right">{pct(row.conversion)}</td> : null}
              {!compact ? <td className="tabular text-right">{formatTwd(row.gmv)}</td> : null}
              <td className="text-right">
                {row.emerging ? (
                  <Tag tone="accent">{t.trends.status.emerging}</Tag>
                ) : row.velocity >= 0.25 ? (
                  <Tag tone="outline">{t.trends.status.rising}</Tag>
                ) : row.velocity <= -0.3 ? (
                  <Tag tone="outline">{t.trends.status.fading}</Tag>
                ) : (
                  <span className="text-[12px] text-muted">{t.trends.status.stable}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
