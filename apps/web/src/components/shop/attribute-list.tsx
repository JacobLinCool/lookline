import type { Article } from '@lookline/db'
import { humanize } from '@/server/format'

interface Row {
  label: string
  value: string | null
}

const MAX_ROWS = 8

function list(values: readonly string[]): string | null {
  return values.length > 0 ? values.map(humanize).join(', ') : null
}

/** The few facts a shopper checks before buying; raw catalog fields never appear here. */
export function AttributeList({ product }: { product: Article }) {
  const rows: Row[] = [
    { label: 'Material', value: humanize(product.material) },
    { label: 'Fit', value: product.fit ? humanize(product.fit) : null },
    { label: 'Silhouette', value: product.silhouette ? humanize(product.silhouette) : null },
    { label: 'Length', value: product.length ? humanize(product.length) : null },
    { label: 'Neckline', value: product.neckline ? humanize(product.neckline) : null },
    { label: 'Sleeve', value: product.sleeve ? humanize(product.sleeve) : null },
    { label: 'Closure', value: product.closure ? humanize(product.closure) : null },
    { label: 'Pattern', value: product.pattern !== 'solid' ? humanize(product.pattern) : null },
    { label: 'Occasions', value: list(product.occasions) },
    { label: 'Seasons', value: list(product.seasons) },
  ]
  const shown = rows
    .filter((r): r is Row & { value: string } => r.value !== null)
    .slice(0, MAX_ROWS)
  if (shown.length === 0) return null
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-6 text-[13px]">
      {shown.map((r) => (
        <div key={r.label} className="col-span-2 grid grid-cols-subgrid border-t border-line py-2">
          <dt className="text-muted">{r.label}</dt>
          <dd className="text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
