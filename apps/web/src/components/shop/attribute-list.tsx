import { DETAIL_VALUES } from '@lookline/catalog'
import type { Article } from '@lookline/db'
import { getI18n } from '@/i18n/server'
import { facetValueLabel, occasionLabel, seasonLabel } from '@/i18n/taxonomy'
import type { Locale } from '@/i18n/config'

interface Row {
  label: string
  value: string | null
}

const MAX_ROWS = 10

/**
 * The few facts a shopper checks before buying; raw catalog fields never appear here. Every
 * value is one of the search facets' own slugs, read through that facet's vocabulary, so a
 * `short` sleeve and a `short` length each read as themselves. A column the vision pass has
 * not filled is simply absent — an unknown is not "none".
 */
export async function AttributeList({ product }: { product: Article }) {
  const { t, locale } = await getI18n()
  const facet = (id: Parameters<typeof facetValueLabel>[1], value: string | null) =>
    value ? facetValueLabel(locale, id, value) : null
  const list = (values: readonly string[], label: (locale: Locale, slug: string) => string) =>
    values.length > 0 ? t.shop.list(values.map((value) => label(locale, value))) : null
  const details = DETAIL_VALUES.filter((d) => product.attributes[d.slug] === true).map(
    (d) => d.slug,
  )
  const rows: Row[] = [
    { label: t.shop.attributes.material, value: facet('material', product.material) },
    { label: t.shop.attributes.silhouette, value: facet('silhouette', product.silhouette) },
    { label: t.shop.attributes.fit, value: facet('fit', product.fit) },
    { label: t.shop.attributes.length, value: facet('length', product.length) },
    { label: t.shop.attributes.neckline, value: facet('neckline', product.neckline) },
    { label: t.shop.attributes.sleeve, value: facet('sleeve', product.sleeve) },
    { label: t.shop.attributes.closure, value: facet('closure', product.closure) },
    {
      label: t.shop.attributes.pattern,
      value: product.pattern !== 'solid' ? facet('pattern', product.pattern) : null,
    },
    { label: t.shop.attributes.printSubject, value: facet('printSubject', product.printSubject) },
    {
      label: t.shop.attributes.details,
      value: list(details, (l, slug) => facetValueLabel(l, 'detail', slug)),
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
