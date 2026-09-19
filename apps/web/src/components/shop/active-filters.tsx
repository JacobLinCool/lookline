import Link from 'next/link'
import { X } from 'lucide-react'
import type { ProductSearch } from '@lookline/engine'
import { formatTwd, humanize } from '@/server/format'
import { DEPARTMENT_LABELS } from './constants'
import { shopHref } from './query'
import styles from './filters.module.css'

interface ActiveFilter {
  key: string
  label: string
  href: string
}

/** Every non-default filter as a removable tag; `sort`, `page` and `department` are shown elsewhere. */
export function activeFilters(search: ProductSearch, brandName?: string | null): ActiveFilter[] {
  const list: ActiveFilter[] = []
  if (search.q)
    list.push({ key: 'q', label: `“${search.q}”`, href: shopHref(search, { q: undefined }) })
  if (search.category) {
    list.push({
      key: 'category',
      label: humanize(search.category),
      href: shopHref(search, { category: undefined, subcategory: undefined }),
    })
  }
  if (search.subcategory) {
    list.push({
      key: 'subcategory',
      label: humanize(search.subcategory),
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
    for (const value of search[key] ?? [])
      list.push({
        key: `${key}:${value}`,
        label: `${key.startsWith('excluded') ? 'Not ' : ''}${humanize(value)}`,
        href: shopHref(search, { [key]: search[key]?.filter((v) => v !== value) }),
      })
  }
  if (search.brandId !== undefined) {
    list.push({
      key: 'brandId',
      label: brandName ? brandName : `Brand #${search.brandId}`,
      href: shopHref(search, { brandId: undefined }),
    })
  }
  if (search.priceMin !== undefined || search.priceMax !== undefined) {
    const min = search.priceMin !== undefined ? formatTwd(search.priceMin) : null
    const max = search.priceMax !== undefined ? formatTwd(search.priceMax) : null
    const label = min && max ? `${min} – ${max}` : min ? `${min} and up` : `Under ${max}`
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
  const filters = activeFilters(search, brandName)
  if (filters.length === 0) return null
  return (
    <div className={styles.chips} aria-label="Active filters">
      {filters.map((f) => (
        <Link key={f.key} href={f.href} className={styles.chip} aria-label={`Remove ${f.label}`}>
          {f.label}
          <X aria-hidden />
        </Link>
      ))}
      <Link
        href={shopHref({ sort: search.sort, department: search.department })}
        className={styles.clear}
      >
        Clear
      </Link>
    </div>
  )
}

/** Women / Men / Unisex / Kids as one row of pills; `All` clears the department. */
export function DepartmentPills({ search }: { search: ProductSearch }) {
  const departments = Object.keys(DEPARTMENT_LABELS) as Array<keyof typeof DEPARTMENT_LABELS>
  return (
    <nav aria-label="Department" className={styles.departments}>
      {[undefined, ...departments].map((dept) => (
        <Link
          key={dept ?? 'all'}
          href={shopHref(search, { department: dept, page: 1 })}
          aria-current={search.department === dept ? 'true' : undefined}
          data-selected={search.department === dept}
          className={`${styles.choice} ${styles.department}`}
        >
          {dept ? DEPARTMENT_LABELS[dept] : 'All'}
        </Link>
      ))}
    </nav>
  )
}
