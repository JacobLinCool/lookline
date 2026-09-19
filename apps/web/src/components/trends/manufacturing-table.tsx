import type { ManufacturingRecommendation } from '@lookline/engine'
import { Tag } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatCompact, humanize } from '@/server/format'
import { pct } from './format'
import { BODY_ROW, STICKY_COL, TABLE, THEAD_ROW } from './momentum-table'

const SIGNAL_LABEL: Record<string, { en: string; zh: string }> = {
  develop: { en: 'Develop', zh: '開款' },
  stock: { en: 'Stock', zh: '備料' },
  watch: { en: 'Watch', zh: '觀察' },
}

function signalOf(rec: ManufacturingRecommendation): string | null {
  const s = rec.evidence['signal']
  return typeof s === 'string' ? s : null
}

function EvidenceList({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).filter(([k]) => k !== 'signal')
  if (entries.length === 0) return <p className="text-[12px] text-muted">No evidence recorded.</p>
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted">
            {humanize(key.replace(/([A-Z0-9]+)/g, ' $1').toLowerCase())}
          </dt>
          <dd className="tabular break-words">
            {typeof value === 'number'
              ? Number.isInteger(value)
                ? String(value)
                : value.toFixed(3)
              : Array.isArray(value)
                ? value.map((v) => String(v)).join(', ')
                : typeof value === 'object' && value !== null
                  ? JSON.stringify(value)
                  : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Ranked 開款 / 備料 signals: aesthetic × category group × colour family. */
export function ManufacturingTable({ rows }: { rows: ManufacturingRecommendation[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        No development or stocking recommendations right now.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className={cn(TABLE, 'min-w-[48rem]')}>
        <thead>
          <tr className={THEAD_ROW}>
            <th className={cn(STICKY_COL, 'w-8')}>#</th>
            <th>Group</th>
            <th>Signal</th>
            <th className="text-right">Momentum</th>
            <th>Confidence</th>
            <th className="text-right">Projected demand</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .toSorted((a, b) => a.rank - b.rank)
            .map((rec) => {
              const signal = signalOf(rec)
              const label = signal ? SIGNAL_LABEL[signal] : undefined
              return (
                <tr key={rec.id} className={cn(BODY_ROW, 'align-top [&>td]:py-3 [&>th]:py-3')}>
                  <th
                    scope="row"
                    className={cn(STICKY_COL, 'tabular text-left font-normal text-muted')}
                  >
                    {rec.rank}
                  </th>
                  <td>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {humanize(rec.aesthetic)} × {humanize(rec.categoryGroup)}
                        {rec.colorFamily ? ` × ${humanize(rec.colorFamily)}` : ''}
                      </span>
                      {rec.subcategory ? (
                        <span className="text-[12px] text-muted">{humanize(rec.subcategory)}</span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    {label ? (
                      <Tag tone={signal === 'develop' ? 'accent' : 'outline'}>
                        {label.en} · {label.zh}
                      </Tag>
                    ) : (
                      <span className="text-[12px] text-muted">–</span>
                    )}
                  </td>
                  <td className="tabular text-right">{Math.round(rec.momentum)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-xs bg-mist">
                        <span
                          className="block h-full bg-ink"
                          style={{ width: `${Math.max(0, Math.min(1, rec.confidence)) * 100}%` }}
                        />
                      </span>
                      <span className="tabular text-[12px]">{pct(rec.confidence)}</span>
                    </span>
                  </td>
                  <td className="tabular text-right">
                    {formatCompact(rec.projectedDemand)}
                    <span className="block text-[11px] text-muted">sessions / 28 d</span>
                  </td>
                  <td className="max-w-md">
                    <p className="leading-snug">{rec.rationale}</p>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[12px] text-muted underline decoration-line underline-offset-4 hover:decoration-ink">
                        Evidence
                      </summary>
                      <div className="mt-2 rounded-sm bg-mist p-3">
                        <EvidenceList evidence={rec.evidence} />
                      </div>
                    </details>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
