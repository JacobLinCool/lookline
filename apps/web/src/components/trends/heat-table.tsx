import type { TrendSeries } from '@lookline/engine'
import { cn } from '@/lib/cn'
import { humanize } from '@/server/format'
import { splitPairKey } from './format'
import { STICKY_COL, TABLE, THEAD_ROW } from './momentum-table'

/**
 * Aesthetic × category momentum matrix. Sequential encoding: one hue (tag red) whose alpha
 * follows momentum 0–100, with the number always printed so colour is never the only channel.
 */
export function HeatTable({
  rows,
  maxAesthetics = 12,
}: {
  rows: TrendSeries[]
  maxAesthetics?: number
}) {
  const byAesthetic = new Map<string, Map<string, TrendSeries>>()
  const groups = new Set<string>()
  for (const row of rows) {
    const [aesthetic, group] = splitPairKey(row.key)
    if (!group) continue
    groups.add(group)
    const inner = byAesthetic.get(aesthetic) ?? new Map<string, TrendSeries>()
    inner.set(group, row)
    byAesthetic.set(aesthetic, inner)
  }
  const aesthetics = [...byAesthetic.entries()]
    .map(([slug, cells]) => ({
      slug,
      cells,
      peak: Math.max(0, ...[...cells.values()].map((c) => c.momentum)),
    }))
    .toSorted((a, b) => b.peak - a.peak)
    .slice(0, maxAesthetics)
  const columns = [...groups].toSorted()

  if (aesthetics.length === 0 || columns.length === 0) {
    return <p className="text-[13px] text-muted">No aesthetic × category signals in this window.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className={cn(TABLE, 'min-w-[40rem] text-[12px]')}>
        <thead>
          <tr className={THEAD_ROW}>
            <th className={STICKY_COL}>Aesthetic</th>
            {columns.map((g) => (
              <th key={g} className="text-center font-medium">
                {humanize(g)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aesthetics.map(({ slug, cells }) => (
            <tr key={slug} className="border-t border-line">
              <th
                scope="row"
                className={cn(STICKY_COL, 'py-1.5 text-left font-medium whitespace-nowrap')}
              >
                {humanize(slug)}
              </th>
              {columns.map((g) => {
                const cell = cells.get(g)
                const m = cell?.momentum ?? 0
                const alpha = Math.min(1, Math.max(0, m / 100))
                return (
                  <td key={g} className="p-0.5">
                    <div
                      title={
                        cell
                          ? `${humanize(slug)} × ${humanize(g)}: momentum ${Math.round(m)}, volume ${cell.volume}${cell.emerging ? ', emerging' : ''}`
                          : `${humanize(slug)} × ${humanize(g)}: no signal`
                      }
                      className="tabular flex h-8 items-center justify-center rounded-xs"
                      style={{
                        background: cell
                          ? `rgba(200, 50, 30, ${0.08 + alpha * 0.82})`
                          : 'var(--color-mist)',
                        color: alpha > 0.5 ? '#ffffff' : '#171717',
                      }}
                    >
                      {cell ? Math.round(m) : ''}
                      {cell?.emerging ? <span className="ml-0.5">*</span> : null}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] text-muted">Darker = stronger momentum · * emerging</p>
    </div>
  )
}
