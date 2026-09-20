import type { Brand, Article, Purchase, User } from '@lookline/db'
import Link from 'next/link'
import { Button, EmptyState, ProductCard } from '@/components/ui'
import type { MeMessages } from '@/i18n/messages/en/me'
import { getI18n } from '@/i18n/server'

export interface WardrobeRow {
  purchase: Purchase
  product: Article
  brand: Brand
  /** The named recipient when the purchase was for a known person. */
  forUser: Pick<User, 'displayName' | 'handle'> | null
}

/** "For Mom" when the purchase was for someone else; nothing when it was for the viewer. */
export function forWhomLabel(row: WardrobeRow, m: MeMessages['wardrobe']): string | null {
  const { purchase, forUser } = row
  if (purchase.forKind !== 'other') return null
  const who = (purchase.forLabel ?? forUser?.displayName ?? m.someone).replace(/^for\s+/i, '')
  return m.forRecipient(who)
}

/** What the viewer owns; each piece can be used in the Card studio. */
export async function Wardrobe({ rows }: { rows: WardrobeRow[] }) {
  const { t } = await getI18n()
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t.me.wardrobe.empty}
        action={
          <Button href="/shop" variant="secondary">
            {t.me.wardrobe.shop}
          </Button>
        }
      />
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((row) => {
        const { purchase, product, brand } = row
        const forWhom = forWhomLabel(row, t.me.wardrobe)
        return (
          <li key={purchase.id}>
            <ProductCard
              product={{ ...product, brandName: brand.name }}
              tag={forWhom ?? undefined}
              footer={
                <Link
                  href="/studio"
                  className="text-[12px] text-muted underline decoration-line underline-offset-4 hover:text-ink"
                >
                  {t.me.wardrobe.createCard}
                </Link>
              }
            />
          </li>
        )
      })}
    </ul>
  )
}
