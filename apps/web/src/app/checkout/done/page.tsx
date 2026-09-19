import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import { and, brands, desc, eq, inArray, articles, purchases } from '@lookline/db'
import { Flash } from '@/components/looks/flash'
import { orderSubtotal, type OrderLine } from '@/components/looks/order-lines'
import {
  Button,
  Container,
  Notice,
  PageHeader,
  Price,
  ProductCard,
  Rail,
  RailItem,
} from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { displayName } from '@/lib/product-name'
import { sanitizeId } from '@/server/looks'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.bag.done.metaTitle }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function CheckoutDonePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser('/checkout/done')
  const [params, { t }] = await Promise.all([searchParams, getI18n()])
  const raw = Array.isArray(params.orders) ? params.orders.join(',') : (params.orders ?? '')
  const ids = raw
    .split(',')
    .map((id) => sanitizeId(id))
    .filter((id): id is string => id !== null)

  const recipientTag = (forKind: string, forLabel: string | null): string | undefined => {
    if (forKind !== 'other') return undefined
    return forLabel ? t.bag.done.forSomeone(forLabel) : t.bag.done.forSomeoneElse
  }

  const rows =
    ids.length > 0
      ? await getDb()
          .db.select({ purchase: purchases, product: articles, brandName: brands.name })
          .from(purchases)
          .innerJoin(articles, eq(purchases.articleId, articles.id))
          .innerJoin(brands, eq(articles.brandId, brands.id))
          .where(and(inArray(purchases.id, ids), eq(purchases.userId, user.id)))
          .orderBy(desc(purchases.createdAt))
      : []

  const lines: OrderLine[] = rows.map(({ purchase, product, brandName }) => ({
    product: { ...product, brandName },
    size: purchase.size,
    qty: purchase.quantity,
    unitPrice: purchase.price,
  }))
  const count = lines.reduce((sum, l) => sum + l.qty, 0)
  const purchaseIds = rows.map((r) => r.purchase.id)
  const createHref =
    purchaseIds.length > 0 ? `/looks/new?purchases=${purchaseIds.join(',')}` : '/looks/new'

  return (
    <Container className="pb-24">
      <PageHeader
        title={t.bag.done.title}
        description={
          count > 0 ? (
            <span className="inline-flex items-baseline gap-2">
              {t.common.count.pieces(count)} · <Price amount={orderSubtotal(lines)} size="sm" />
            </span>
          ) : undefined
        }
      />
      <Flash error={params.error} className="mb-6" />

      {rows.length > 0 ? (
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-7">
            <Rail title={t.bag.done.yoursNow} itemWidth="sm">
              {rows.map(({ purchase, product, brandName }) => (
                <RailItem key={purchase.id} width="sm">
                  <ProductCard
                    product={{ ...product, name: displayName(product.name, brandName), brandName }}
                    tag={recipientTag(purchase.forKind, purchase.forLabel)}
                  />
                </RailItem>
              ))}
            </Rail>
          </div>
          <div className="flex flex-col gap-4 rounded-md bg-mist p-6 md:col-span-5">
            <h2 className="text-[20px]">{t.bag.done.makeLook}</h2>
            <p className="text-[13px] text-muted">{t.bag.done.makeLookNote}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button href={createHref} size="lg" icon={<Sparkles />}>
                {t.bag.done.createLook}
              </Button>
              <Button href="/shop" variant="ghost" size="lg">
                {t.bag.done.backToShop}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Notice
          tone="info"
          title={t.bag.done.noOrder}
          action={
            <Button href="/me" size="sm" variant="secondary">
              {t.bag.done.wardrobe}
            </Button>
          }
        />
      )}
    </Container>
  )
}
