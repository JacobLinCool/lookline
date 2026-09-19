'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  AESTHETICS,
  CATEGORY_GROUPS,
  COLOR_FAMILIES,
  SEARCH_FACETS,
  facetAppliesTo,
} from '@lookline/catalog'
import type { SearchFacet } from '@lookline/catalog'
import type { FacetCount, ProductSearch, ProductSearchResult } from '@lookline/engine'
import { useI18n } from '@/i18n/client'
import {
  aestheticLabel,
  categoryGroupLabel,
  colorFamilyLabel,
  facetValueLabel,
} from '@/i18n/taxonomy'
import { cn } from '@/lib/cn'
import { COLOR_FAMILY_HEX, PRICE_PRESETS } from './constants'
import { searchToParams, shopHref } from './query'
import styles from './filters.module.css'

type Facets = NonNullable<ProductSearchResult['facets']>
const facetCount = (list: Array<{ key: string; count: number }> | undefined, key: string) =>
  list?.find((f) => f.key === key)?.count

const STYLE_PREVIEW = 8

function StyleLink({
  a,
  search,
  facets,
  selected,
}: {
  a: (typeof AESTHETICS)[number]
  search: ProductSearch
  facets?: Facets
  selected: Set<string>
}) {
  const { t, locale } = useI18n()
  const active = selected.has(a.slug)
  const next = active ? [...selected].filter((s) => s !== a.slug) : [...selected, a.slug]
  const count = facetCount(facets?.aesthetics, a.slug)
  const label = aestheticLabel(locale, a.slug)
  return (
    <Link
      href={shopHref(search, {
        aesthetics: next.length ? next : undefined,
        excludedAesthetics: search.excludedAesthetics?.filter((v) => v !== a.slug),
      })}
      aria-current={active ? 'true' : undefined}
      data-selected={active}
      data-aesthetic={a.slug}
      title={count === undefined ? label : t.shop.filters.withCount(label, count)}
      className={cn(styles.choice, styles.style)}
    >
      <Check aria-hidden className={styles.check} />
      <span>{label}</span>
    </Link>
  )
}

function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.group} aria-label={title}>
      <h3 className={styles.heading}>{title}</h3>
      {children}
    </section>
  )
}
function RailLink({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  count?: number
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      data-selected={active}
      className={cn(styles.choice, styles.row)}
    >
      <span className={styles.label}>{children}</span>
      <span className={styles.count}>{count?.toLocaleString('en-US') ?? ''}</span>
      <Check aria-hidden className={styles.check} />
    </Link>
  )
}

/** The construction facets the rail offers, in registry order, after the four fixed groups. */
const ATTRIBUTE_FACETS = SEARCH_FACETS.filter((f) => f.decision === 'lexical')
const ATTRIBUTE_PREVIEW = 6

/** The search without pagination: what a facet's counts are keyed on. */
const countKey = (search: ProductSearch) =>
  searchToParams({ ...search, page: undefined, pageSize: undefined }).toString()

/**
 * One construction facet as a folded row: the heading, the current selection, and on opening the
 * values the current results actually hold, most common first. The search itself does not count
 * these facets — their vocabularies are long and D1 bills every row a count touches — so the row
 * asks for its own counts when it opens, once per search, and shows nothing it has not counted:
 * an empty vocabulary is the honest state, not a synthesised list. A facet that cannot describe
 * the chosen categories is not offered at all, so a rail over bags has no sleeve row.
 */
function AttributeGroup({
  facet,
  search,
  stale,
}: {
  facet: SearchFacet
  search: ProductSearch
  stale: boolean
}) {
  const { t, locale } = useI18n()
  const selected = search[facet.key] ?? []
  const [open, setOpen] = useState(selected.length > 0)
  const key = countKey(search)
  // `values: null` records a count that failed, so the row stops asking until the search moves.
  const [counted, setCounted] = useState<{ key: string; values: FacetCount[] | null } | null>(null)
  const pending = open && !stale && counted?.key !== key
  useEffect(() => {
    if (!pending) return
    const controller = new AbortController()
    fetch(`/api/articles/facets?facet=${facet.id}&${key}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
    })
      .then(async (response) => {
        const data = (await response.json()) as { values?: FacetCount[] }
        if (!response.ok || !Array.isArray(data.values)) throw new Error('facet counts')
        if (!controller.signal.aborted) setCounted({ key, values: data.values })
      })
      .catch(() => {
        // The row keeps its selection; the values stay unknown rather than invented.
        if (!controller.signal.aborted) setCounted({ key, values: null })
      })
    return () => controller.abort()
  }, [pending, key, facet.id])
  const fresh = counted?.key === key ? (counted.values ?? undefined) : undefined
  const loading = pending
  const values = [
    ...selected,
    ...(fresh ?? []).map((c) => c.key).filter((v) => !selected.includes(v)),
  ]
  const title = t.shop.filters.facet[facet.id]
  const summary = selected.length
    ? t.shop.list(selected.map((v) => facetValueLabel(locale, facet, v)))
    : t.shop.filters.any
  const item = (value: string) => {
    const active = selected.includes(value)
    const next = active ? selected.filter((v) => v !== value) : [...selected, value]
    const count = fresh ? facetCount(fresh, value) : undefined
    const label = facetValueLabel(locale, facet, value)
    return (
      <li key={value}>
        <Link
          href={shopHref(search, {
            [facet.key]: next.length ? next : undefined,
            [facet.excludeKey]: search[facet.excludeKey]?.filter((v) => v !== value),
          })}
          aria-current={active ? 'true' : undefined}
          data-selected={active}
          data-facet={facet.id}
          data-value={value}
          title={count === undefined ? label : t.shop.filters.withCount(label, count)}
          className={cn(styles.choice, styles.style)}
        >
          <Check aria-hidden className={styles.check} />
          <span>{label}</span>
        </Link>
      </li>
    )
  }
  const shown = values.slice(0, ATTRIBUTE_PREVIEW)
  const rest = values.slice(ATTRIBUTE_PREVIEW)
  return (
    <details
      className={styles.attribute}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-facet={facet.id}
    >
      <summary className={styles.attributeSummary}>
        <span className={styles.heading}>{title}</span>
        <span className={styles.attributeValue} title={summary}>
          {summary}
        </span>
      </summary>
      <div className={styles.attributeBody} aria-busy={loading || stale}>
        {values.length > 0 ? <ul className={styles.styles}>{shown.map(item)}</ul> : null}
        {rest.length > 0 ? (
          <details className={styles.more} open={rest.some((v) => selected.includes(v))}>
            <summary className={styles.moreSummary}>
              {t.shop.filters.moreValues(rest.length)}
            </summary>
            <ul className={styles.styles}>{rest.map(item)}</ul>
          </details>
        ) : null}
        {values.length === 0 && !loading && !stale && fresh ? (
          <p className={styles.attributeEmpty}>{t.shop.filters.none}</p>
        ) : null}
      </div>
    </details>
  )
}

/** Category, colour, style, price, then the construction facets. Selection never changes geometry. */
export function FilterRail({
  search,
  facets,
  stale = false,
}: {
  search: ProductSearch
  /** The latest counts, possibly for a previous search; `stale` says so. */
  facets?: Facets
  stale?: boolean
}) {
  const { t, locale } = useI18n()
  const selectedAesthetics = new Set(search.aesthetics ?? [])
  const selectedColours = search.colorFamilies ?? []
  const colourSummary = selectedColours.length
    ? t.shop.list(selectedColours.map((v) => colorFamilyLabel(locale, v)))
    : t.shop.filters.anyColour
  return (
    <div className={styles.rail} data-filter-rail>
      <RailGroup title={t.shop.filters.category}>
        <ul className={styles.rows}>
          <li>
            <RailLink
              href={shopHref(search, {
                categoryGroups: undefined,
                excludedCategoryGroups: undefined,
                category: undefined,
                subcategory: undefined,
              })}
              active={!search.categoryGroups?.length && !search.excludedCategoryGroups?.length}
            >
              {t.common.all}
            </RailLink>
          </li>
          {CATEGORY_GROUPS.map((group) => (
            <li key={group}>
              <RailLink
                href={shopHref(search, {
                  categoryGroups: search.categoryGroups?.includes(group)
                    ? search.categoryGroups.filter((v) => v !== group)
                    : [...(search.categoryGroups ?? []), group],
                  excludedCategoryGroups: search.excludedCategoryGroups?.filter((v) => v !== group),
                  category: undefined,
                  subcategory: undefined,
                })}
                active={search.categoryGroups?.includes(group) ?? false}
                // A group missing from the facets holds nothing under the current filters, which
                // is worth saying — but only once the facets are here. While they are stale the
                // count is unknown, not zero, and `RailLink` renders nothing for `undefined`.
                count={
                  facets && !stale ? (facetCount(facets.categoryGroups, group) ?? 0) : undefined
                }
              >
                {categoryGroupLabel(locale, group)}
              </RailLink>
            </li>
          ))}
        </ul>
      </RailGroup>
      <RailGroup title={t.shop.filters.colour}>
        <ul className={styles.swatches}>
          {COLOR_FAMILIES.map((family) => {
            const active = search.colorFamilies?.includes(family) ?? false
            const count = stale ? undefined : facetCount(facets?.colorFamilies, family)
            const label = colorFamilyLabel(locale, family)
            return (
              <li key={family}>
                <Link
                  href={shopHref(search, {
                    colorFamilies: active
                      ? search.colorFamilies?.filter((v) => v !== family)
                      : [...(search.colorFamilies ?? []), family],
                    excludedColorFamilies: search.excludedColorFamilies?.filter(
                      (v) => v !== family,
                    ),
                  })}
                  aria-label={label}
                  title={count === undefined ? label : t.shop.filters.withCount(label, count)}
                  aria-current={active ? 'true' : undefined}
                  data-selected={active}
                  className={cn(styles.choice, styles.swatch)}
                >
                  <span
                    className={styles.swatchColour}
                    style={{ background: COLOR_FAMILY_HEX[family] }}
                  />
                  <span className={styles.swatchCheck}>
                    <Check aria-hidden />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <p className={styles.colourSummary} title={colourSummary}>
          {colourSummary}
        </p>
      </RailGroup>
      <RailGroup title={t.shop.filters.style}>
        <ul className={styles.styles}>
          {AESTHETICS.slice(0, STYLE_PREVIEW).map((a) => (
            <li key={a.slug}>
              <StyleLink
                a={a}
                search={search}
                facets={stale ? undefined : facets}
                selected={selectedAesthetics}
              />
            </li>
          ))}
        </ul>
        {AESTHETICS.length > STYLE_PREVIEW ? (
          <details
            className={styles.more}
            open={AESTHETICS.slice(STYLE_PREVIEW).some((a) => selectedAesthetics.has(a.slug))}
          >
            <summary className={styles.moreSummary}>
              {t.shop.filters.moreStyles(AESTHETICS.length - STYLE_PREVIEW)}
            </summary>
            <ul className={styles.styles}>
              {AESTHETICS.slice(STYLE_PREVIEW).map((a) => (
                <li key={a.slug}>
                  <StyleLink
                    a={a}
                    search={search}
                    facets={stale ? undefined : facets}
                    selected={selectedAesthetics}
                  />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </RailGroup>
      <RailGroup title={t.shop.filters.price}>
        <ul className={styles.rows}>
          <li>
            <RailLink
              href={shopHref(search, { priceMin: undefined, priceMax: undefined })}
              active={search.priceMin === undefined && search.priceMax === undefined}
            >
              {t.shop.filters.any}
            </RailLink>
          </li>
          {PRICE_PRESETS.map((preset) => (
            <li key={preset.key}>
              <RailLink
                href={shopHref(search, { priceMin: preset.priceMin, priceMax: preset.priceMax })}
                active={preset.priceMin === search.priceMin && preset.priceMax === search.priceMax}
              >
                {t.shop.filters.pricePresets[preset.key]}
              </RailLink>
            </li>
          ))}
        </ul>
      </RailGroup>
      <section className={styles.group} aria-label={t.shop.filters.details}>
        {ATTRIBUTE_FACETS.filter((facet) => facetAppliesTo(facet, search.categoryGroups ?? [])).map(
          (facet) => (
            <AttributeGroup key={facet.id} facet={facet} search={search} stale={stale} />
          ),
        )}
      </section>
    </div>
  )
}
