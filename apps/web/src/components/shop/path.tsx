'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ProductSearch } from '@lookline/engine'
import { shopHref, type ShopPath } from './query'

const ShopPathContext = createContext<ShopPath>('/shop')
export function ShopPathProvider({ path, children }: { path: ShopPath; children: ReactNode }) {
  return <ShopPathContext.Provider value={path}>{children}</ShopPathContext.Provider>
}
export const useShopPath = () => useContext(ShopPathContext)
export function useShopHref() {
  const path = useShopPath()
  return (search: ProductSearch, patch?: Partial<ProductSearch>) => shopHref(search, patch, path)
}
