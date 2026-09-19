'use client'

import { articleName } from '@/lib/product-name'
import { useLayoutEffect, useRef } from 'react'
import type { ProductSearchResult } from '@lookline/engine'
import { ProductCard } from '@/components/ui'
import { cn } from '@/lib/cn'
import styles from './filters.module.css'

export function ProductGrid({
  items,
  columns = 4,
  className,
}: {
  items: ProductSearchResult['items']
  columns?: 3 | 4
  className?: string
}) {
  const grid = useRef<HTMLUListElement>(null)
  const previous = useRef(new Map<string, { x: number; y: number }>())
  const previousWidth = useRef<number | undefined>(undefined)
  useLayoutEffect(() => {
    const width = grid.current?.clientWidth
    if (previousWidth.current !== width) previous.current.clear()
    previousWidth.current = width
    const nodes = Array.from(grid.current?.children ?? []) as HTMLLIElement[]
    const positions = new Map<string, { x: number; y: number }>()
    const animations: Animation[] = []
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [index, node] of nodes.entries()) {
      const product = items[index]
      if (!product) continue
      const id = product.id
      const position = { x: node.offsetLeft, y: node.offsetTop }
      const before = previous.current.get(id)
      positions.set(id, position)
      if (!previous.current.size) continue
      if (!before) {
        const artwork = node.querySelector('img')
        if (artwork)
          animations.push(
            artwork.animate([{ opacity: 0.35 }, { opacity: 1 }], {
              duration: reduced ? 80 : 160,
              easing: 'ease-out',
            }),
          )
      } else if (!reduced && (before.x !== position.x || before.y !== position.y)) {
        animations.push(
          node.animate(
            [
              { transform: `translate(${before.x - position.x}px, ${before.y - position.y}px)` },
              { transform: 'translate(0, 0)' },
            ],
            { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
          ),
        )
      }
    }
    previous.current = positions
    return () => animations.forEach((animation) => animation.cancel())
  }, [items])
  return (
    <ul
      ref={grid}
      data-product-grid
      className={cn(
        styles.productGrid,
        'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3',
        columns === 4 && 'xl:grid-cols-4',
        className,
      )}
    >
      {items.map((product, i) => (
        <li key={product.id} data-product-id={product.id}>
          <ProductCard
            product={{
              id: product.id,
              imagePath: product.imagePath,
              name: articleName(product, product.brandName),
              price: product.price,
              brandName: product.brandName,
              colorName: product.colorName,
            }}
            priority={i < 4}
          />
        </li>
      ))}
    </ul>
  )
}
