import type { Article } from '@lookline/db'
import { getI18n } from '@/i18n/server'
import { facetLabel, occasionLabel, seasonLabel } from '@/i18n/taxonomy'
import type { Locale } from '@/i18n/config'

interface Row {
  label: string
  value: string | null
}

const MAX_ROWS = 8

/** The few facts a shopper checks before buying; raw catalog fields never appear here. */
export async function AttributeList({ product }: { product: Article }) {
  const { t, locale } = await getI18n()
  const facet = (value: string | null) => (value ? facetLabel(locale, value) : null)
  const list = (values: readonly string[], label: (locale: Locale, slug: string) => string) =>
    values.length > 0 ? t.shop.list(values.map((value) => label(locale, value))) : null
  const rows: Row[] = [
    { label: t.shop.attributes.material, value: facet(product.material) },
    // The product type is H&M's own and always present, unlike the fields below it.
    { label: t.shop.attributes.silhouette, value: product.subcategory },
    { label: t.shop.attributes.fit, value: facet(product.fit) },
    { label: t.shop.attributes.length, value: facet(product.length) },
    { label: t.shop.attributes.neckline, value: facet(product.neckline) },
    { label: t.shop.attributes.sleeve, value: facet(product.sleeve) },
    { label: t.shop.attributes.closure, value: facet(product.closure) },
    {
      label: t.shop.attributes.pattern,
      value: product.pattern !== 'solid' ? facet(product.pattern) : null,
    },
    { label: t.shop.attributes.occasions, value: list(product.occasions, occasionLabel) },
    { label: t.shop.attributes.seasons, value: list(product.seasons, seasonLabel) },
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
