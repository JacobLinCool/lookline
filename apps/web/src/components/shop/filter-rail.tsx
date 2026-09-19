'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { AESTHETICS, CATEGORY_GROUPS, COLOR_FAMILIES } from '@lookline/catalog'
import type { ProductSearch, ProductSearchResult } from '@lookline/engine'
import { useI18n } from '@/i18n/client'
import { aestheticLabel, categoryGroupLabel, colorFamilyLabel } from '@/i18n/taxonomy'
import { cn } from '@/lib/cn'
import { COLOR_FAMILY_HEX, PRICE_PRESETS } from './constants'
import { shopHref } from './query'
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

/** Category, colour, style, price. Selection never changes geometry. */
export function FilterRail({ search, facets }: { search: ProductSearch; facets?: Facets }) {
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
                count={facetCount(facets?.categoryGroups, group)}
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
            const count = facetCount(facets?.colorFamilies, family)
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
              <StyleLink a={a} search={search} facets={facets} selected={selectedAesthetics} />
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
                  <StyleLink a={a} search={search} facets={facets} selected={selectedAesthetics} />
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
    </div>
  )
}
