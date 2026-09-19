'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { DEPARTMENTS, SEARCH_FACETS } from '@lookline/catalog'
import type { ProductSearch } from '@lookline/engine'
import { useI18n } from '@/i18n/client'
import type { Locale } from '@/i18n/config'
import type { Messages } from '@/i18n/messages'
import { categoryLabel, departmentLabel, facetValueLabel, subcategoryLabel } from '@/i18n/taxonomy'
import { formatTwd } from '@/server/format'
import { shopHref as hrefForShop, type ShopPath } from './query'
import { useShopHref, useShopPath } from './path'
import styles from './filters.module.css'

interface ActiveFilter {
  key: string
  label: string
  href: string
}

/** A keyword chip reads as the first spelling the shopper's sentence was translated to. */
export const keywordLabel = (keyword: string): string => `“${keyword.split('|')[0] ?? keyword}”`

/** Every non-default filter as a removable tag; `sort`, `page` and `department` are shown elsewhere. */
export function activeFilters(
  search: ProductSearch,
  t: Messages,
  locale: Locale,
  brandName?: string | null,
  path: ShopPath = '/shop',
): ActiveFilter[] {
  const shopHref = (search: ProductSearch, patch?: Partial<ProductSearch>) =>
    hrefForShop(search, patch, path)
  const list: ActiveFilter[] = []
  if (search.q)
    list.push({ key: 'q', label: `“${search.q}”`, href: shopHref(search, { q: undefined }) })
  for (const keyword of search.keywords ?? []) {
    const rest = search.keywords?.filter((k) => k !== keyword)
    list.push({
      key: `keywords:${keyword}`,
      label: keywordLabel(keyword),
      href: shopHref(search, { keywords: rest?.length ? rest : undefined }),
    })
  }
  if (search.category) {
    list.push({
      key: 'category',
      label: categoryLabel(locale, search.category),
      href: shopHref(search, { category: undefined, subcategory: undefined }),
    })
  }
  if (search.subcategory) {
    list.push({
      key: 'subcategory',
      label: subcategoryLabel(locale, search.subcategory),
      href: shopHref(search, { subcategory: undefined }),
    })
  }
  for (const facet of SEARCH_FACETS) {
    for (const key of [facet.key, facet.excludeKey] as const) {
      for (const value of search[key] ?? []) {
        const label = facetValueLabel(locale, facet, value)
        const rest = search[key]?.filter((v) => v !== value)
        list.push({
          key: `${key}:${value}`,
          label: key === facet.excludeKey ? t.shop.filters.not(label) : label,
          href: shopHref(search, { [key]: rest?.length ? rest : undefined }),
        })
      }
    }
  }
  if (search.brandId !== undefined) {
    list.push({
      key: 'brandId',
      label: brandName ? brandName : t.shop.filters.brand(search.brandId),
      href: shopHref(search, { brandId: undefined }),
    })
  }
  if (search.priceMin !== undefined || search.priceMax !== undefined) {
    const min = search.priceMin !== undefined ? formatTwd(search.priceMin) : null
    const max = search.priceMax !== undefined ? formatTwd(search.priceMax) : null
    const label =
      min && max
        ? `${min} – ${max}`
        : min
          ? t.shop.filters.priceFrom(min)
          : t.shop.filters.priceUnder(max ?? '')
    list.push({
      key: 'price',
      label,
      href: shopHref(search, { priceMin: undefined, priceMax: undefined }),
    })
  }
  return list
}

export function ActiveFilters({
  search,
  brandName,
}: {
  search: ProductSearch
  brandName?: string | null
}) {
  const { t, locale } = useI18n()
  const path = useShopPath()
  const shopHref = useShopHref()
  const filters = activeFilters(search, t, locale, brandName, path)
  if (filters.length === 0) return null
  return (
    <div className={styles.chips} aria-label={t.shop.filters.active}>
      {filters.map((f) => (
        <Link
          key={f.key}
          href={f.href}
          className={styles.chip}
          aria-label={t.ui.removeFilter(f.label)}
        >
          {f.label}
          <X aria-hidden />
        </Link>
      ))}
      <Link
        href={shopHref({ sort: search.sort, department: search.department })}
        className={styles.clear}
      >
        {t.common.clear}
      </Link>
    </div>
  )
}

/** Women / Men / Unisex / Kids as one row of pills; `All` clears the department. */
export function DepartmentPills({ search }: { search: ProductSearch }) {
  const shopHref = useShopHref()
  const { t, locale } = useI18n()
  return (
    <nav aria-label={t.shop.filters.department} className={styles.departments}>
      {[undefined, ...DEPARTMENTS].map((dept) => (
        <Link
          key={dept ?? 'all'}
          href={shopHref(search, { department: dept, page: 1 })}
          aria-current={search.department === dept ? 'true' : undefined}
          data-selected={search.department === dept}
          className={`${styles.choice} ${styles.department}`}
        >
          {dept ? departmentLabel(locale, dept) : t.common.all}
        </Link>
      ))}
    </nav>
  )
}
