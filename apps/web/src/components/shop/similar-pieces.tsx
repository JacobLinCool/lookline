import { similarProducts } from '@lookline/engine'
import { ProductCard, Rail, RailItem } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { displayName } from '@/lib/product-name'
import { reasonLine } from '@/lib/reason'
import { getDb } from '@/server/db'
import { callEngine } from './engine'

/** Nearest pieces on the rail. Reasons and scores only in Engine view. */
export async function SimilarPieces({
  productId,
  userId,
  engineView = false,
}: {
  productId: number
  userId: string | null
  engineView?: boolean
}) {
  const { t, locale } = await getI18n()
  const result = await callEngine('similarProducts', () =>
    similarProducts(getDb().db, productId, { limit: 6, userId: userId ?? undefined }),
  )
  if (!result.ok || result.value.length === 0) return null
  return (
    <Rail title={t.shop.similar} rule itemWidth="md">
      {result.value.map((item) => (
        <RailItem key={item.product.id} width="md">
          <ProductCard
            product={{
              id: item.product.id,
              name: displayName(item.product.name, item.brandName),
              price: item.product.price,
              brandName: item.brandName,
              colorName: item.product.colorName,
            }}
            reason={
              engineView
                ? `${reasonLine(item.explanation, locale)} · ${item.score.toFixed(2)}`
                : undefined
            }
          />
        </RailItem>
      ))}
    </Rail>
  )
}
