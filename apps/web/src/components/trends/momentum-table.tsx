import type { TrendSeries } from '@lookline/engine'
import { Tag } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatTwd, humanize } from '@/server/format'
import { num, pct } from './format'

export interface MomentumTableProps {
  rows: TrendSeries[]
  /** Fewer columns: label, momentum, velocity, status. */
  compact?: boolean
  /** Cap the number of rows shown. */
  limit?: number
  className?: string
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
export function MomentumTable({ rows, compact = false, limit, className }: MomentumTableProps) {
  const shown = (limit ? rows.slice(0, limit) : rows).toSorted((a, b) => b.momentum - a.momentum)
  if (shown.length === 0) {
    return <p className="text-[13px] text-muted">No signals in this window.</p>
  }
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className={cn(TABLE, compact ? 'min-w-[22rem]' : 'min-w-[40rem]')}>
        <thead>
          <tr className={THEAD_ROW}>
            <th className={STICKY_COL}>{compact ? 'Name' : 'Aesthetic'}</th>
            <th className="text-right">Momentum</th>
            {!compact ? <th className="text-right">Volume</th> : null}
            <th className="text-right">Velocity</th>
            {!compact ? <th className="text-right">Cross-cluster</th> : null}
            {!compact ? <th className="text-right">Conversion</th> : null}
            {!compact ? <th className="text-right">GMV</th> : null}
            <th className="text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={`${row.dimension}:${row.key}`} className={BODY_ROW}>
              <th scope="row" className={cn(STICKY_COL, 'text-left font-medium whitespace-nowrap')}>
                {row.label || humanize(row.key)}
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
                  <Tag tone="accent">Emerging</Tag>
                ) : row.velocity >= 0.25 ? (
                  <Tag tone="outline">Rising</Tag>
                ) : row.velocity <= -0.3 ? (
                  <Tag tone="outline">Fading</Tag>
                ) : (
                  <span className="text-[12px] text-muted">Stable</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
