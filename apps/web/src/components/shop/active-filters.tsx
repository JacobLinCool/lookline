'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { DEPARTMENTS } from '@lookline/catalog'
import type { ProductSearch } from '@lookline/engine'
import { useI18n } from '@/i18n/client'
import type { Locale } from '@/i18n/config'
import type { Messages } from '@/i18n/messages'
import { categoryLabel, departmentLabel, facetLabel, subcategoryLabel } from '@/i18n/taxonomy'
import { formatTwd } from '@/server/format'
import { shopHref } from './query'
import styles from './filters.module.css'

interface ActiveFilter {
  key: string
  label: string
  href: string
}

/** Every non-default filter as a removable tag; `sort`, `page` and `department` are shown elsewhere. */
export function activeFilters(
  search: ProductSearch,
  t: Messages,
  locale: Locale,
  brandName?: string | null,
): ActiveFilter[] {
  const list: ActiveFilter[] = []
  if (search.q)
    list.push({ key: 'q', label: `“${search.q}”`, href: shopHref(search, { q: undefined }) })
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
  for (const key of [
    'categoryGroups',
    'excludedCategoryGroups',
    'colorFamilies',
    'excludedColorFamilies',
    'aesthetics',
    'excludedAesthetics',
  ] as const) {
    for (const value of search[key] ?? []) {
      const label = facetLabel(locale, value)
      list.push({
        key: `${key}:${value}`,
        label: key.startsWith('excluded') ? t.shop.filters.not(label) : label,
        href: shopHref(search, { [key]: search[key]?.filter((v) => v !== value) }),
      })
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
  const filters = activeFilters(search, t, locale, brandName)
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
