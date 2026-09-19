import type { Brand, Product, Purchase, User } from '@lookline/db'
import Link from 'next/link'
import { Button, EmptyState, ProductCard } from '@/components/ui'

export interface WardrobeRow {
  purchase: Purchase
  product: Product
  brand: Brand
  /** The named recipient when the purchase was for a known person. */
  forUser: Pick<User, 'displayName' | 'handle'> | null
}

/** "For Mom" when the purchase was for someone else; nothing when it was for the viewer. */
export function forWhomLabel(row: WardrobeRow): string | null {
  const { purchase, forUser } = row
  if (purchase.forKind !== 'other') return null
  const who = (purchase.forLabel ?? forUser?.displayName ?? 'someone').replace(/^for\s+/i, '')
  return `For ${who}`
}

/** What the viewer owns; each piece can become a Look. */
export function Wardrobe({ rows }: { rows: WardrobeRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        action={
          <Button href="/shop" variant="secondary">
            Shop
          </Button>
        }
      />
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((row) => {
        const { purchase, product, brand } = row
        const forWhom = forWhomLabel(row)
        return (
          <li key={purchase.id}>
            <ProductCard
              product={{ ...product, brandName: brand.name }}
              tag={forWhom ?? undefined}
              footer={
                <Link
                  href={`/looks/new?purchases=${encodeURIComponent(purchase.id)}`}
                  className="text-[12px] text-muted underline decoration-line underline-offset-4 hover:text-ink"
                >
                  Create a Look
                </Link>
              }
            />
          </li>
        )
      })}
    </ul>
  )
}
