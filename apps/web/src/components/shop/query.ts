import { AESTHETICS, CATEGORY_GROUPS, COLOR_FAMILIES, DEPARTMENTS } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Department } from '@lookline/catalog'
import type { ProductSearch } from '@lookline/engine'

/**
 * URL contract for `/shop` and `GET /api/products/search`. Every search param maps 1:1 onto a
 * `ProductSearch` field; selected and excluded facets are repeatable. Unknown values are dropped, never thrown.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>

export const SHOP_PAGE_SIZE = 24
export const SHOP_MAX_PAGE_SIZE = 48

export type ShopSort = NonNullable<ProductSearch['sort']>

export const SORT_OPTIONS: ReadonlyArray<{ value: ShopSort; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'popular', label: 'Most popular' },
  { value: 'trending', label: 'Trending in the network' },
  { value: 'new', label: 'Newest' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
]

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((o) => o.value))
const DEPARTMENT_VALUES = new Set<string>(DEPARTMENTS)
const GROUP_VALUES = new Set<string>(CATEGORY_GROUPS)
const COLOR_VALUES = new Set<string>(COLOR_FAMILIES)
const AESTHETIC_VALUES = new Set(AESTHETICS.map((a) => a.slug))

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  const trimmed = v?.trim()
  return trimmed ? trimmed : undefined
}

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  const list = Array.isArray(value) ? value : [value]
  return list
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean)
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/** searchParams → `ProductSearch`. Page size is fixed at 24 unless `pageSize` is given (1–48). */
export function parseProductSearch(params: RawSearchParams): ProductSearch {
  const search: ProductSearch = {}

  const q = first(params.q)
  if (q) search.q = q.slice(0, 200)

  const department = first(params.department)
  if (department && DEPARTMENT_VALUES.has(department)) search.department = department as Department

  for (const key of ['categoryGroups', 'excludedCategoryGroups'] as const) {
    const values = [...new Set(all(params[key]).filter((v) => GROUP_VALUES.has(v)))]
    if (values.length) search[key] = values as CategoryGroup[]
  }

  const category = first(params.category)
  if (category && SLUG.test(category)) search.category = category

  const subcategory = first(params.subcategory)
  if (subcategory && SLUG.test(subcategory)) search.subcategory = subcategory

  for (const key of ['aesthetics', 'excludedAesthetics'] as const) {
    const values = [...new Set(all(params[key]).filter((v) => AESTHETIC_VALUES.has(v)))]
    if (values.length) search[key] = values
  }
  for (const key of ['colorFamilies', 'excludedColorFamilies'] as const) {
    const values = [...new Set(all(params[key]).filter((v) => COLOR_VALUES.has(v)))]
    if (values.length) search[key] = values as ColorFamily[]
  }

  const brandId = toInt(first(params.brandId))
  if (brandId !== undefined && brandId > 0) search.brandId = brandId

  const priceMin = toInt(first(params.priceMin))
  if (priceMin !== undefined) search.priceMin = priceMin
  const priceMax = toInt(first(params.priceMax))
  if (priceMax !== undefined && priceMax > 0) search.priceMax = priceMax
  if (
    search.priceMin !== undefined &&
    search.priceMax !== undefined &&
    search.priceMin > search.priceMax
  ) {
    delete search.priceMin
  }

  const sort = first(params.sort)
  search.sort = sort && SORT_VALUES.has(sort) ? (sort as ShopSort) : 'relevance'

  const page = toInt(first(params.page))
  search.page = page !== undefined && page >= 1 ? page : 1

  const pageSize = toInt(first(params.pageSize))
  search.pageSize =
    pageSize !== undefined && pageSize >= 1
      ? Math.min(pageSize, SHOP_MAX_PAGE_SIZE)
      : SHOP_PAGE_SIZE

  return search
}

/** `ProductSearch` → URLSearchParams (defaults omitted so URLs stay short). */
export function searchToParams(search: ProductSearch): URLSearchParams {
  const p = new URLSearchParams()
  if (search.q) p.set('q', search.q)
  if (search.department) p.set('department', search.department)
  for (const key of [
    'categoryGroups',
    'excludedCategoryGroups',
    'colorFamilies',
    'excludedColorFamilies',
    'aesthetics',
    'excludedAesthetics',
  ] as const)
    for (const value of search[key] ?? []) p.append(key, value)
  if (search.category) p.set('category', search.category)
  if (search.subcategory) p.set('subcategory', search.subcategory)
  if (search.brandId !== undefined) p.set('brandId', String(search.brandId))
  if (search.priceMin !== undefined) p.set('priceMin', String(search.priceMin))
  if (search.priceMax !== undefined) p.set('priceMax', String(search.priceMax))
  if (search.sort && search.sort !== 'relevance') p.set('sort', search.sort)
  if (search.page !== undefined && search.page > 1) p.set('page', String(search.page))
  if (search.pageSize !== undefined && search.pageSize !== SHOP_PAGE_SIZE) {
    p.set('pageSize', String(search.pageSize))
  }
  return p
}

/**
 * A `/shop` href for `search` with `patch` applied. Setting a field to `undefined` removes it.
 * Any change other than `page` resets the page to 1.
 */
export function shopHref(search: ProductSearch, patch: Partial<ProductSearch> = {}): string {
  const next: ProductSearch = { ...search, ...patch }
  const keys = Object.keys(patch)
  if (!(keys.length === 1 && keys[0] === 'page')) next.page = 1
  for (const key of keys) {
    if (patch[key as keyof ProductSearch] === undefined) delete next[key as keyof ProductSearch]
  }
  const qs = searchToParams(next).toString()
  return qs ? `/shop?${qs}` : '/shop'
}

export function searchFromParams(params: URLSearchParams): ProductSearch {
  const raw: RawSearchParams = {}
  for (const key of new Set(params.keys())) raw[key] = params.getAll(key)
  return parseProductSearch(raw)
}
