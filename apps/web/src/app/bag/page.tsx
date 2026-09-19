import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Minus, Plus, X } from 'lucide-react'
import { brands, eq, inArray, products } from '@lookline/db'
import { Flash } from '@/components/looks/flash'
import { OrderLines, orderSubtotal, type OrderLine } from '@/components/looks/order-lines'
import { Button, Container, EmptyState, Notice, PageHeader, Price, Tag } from '@/components/ui'
import { removeFromBagAction, setBagQtyAction } from '@/server/actions/bag'
import { requireUser } from '@/server/auth'
import { BAG_MAX_QTY, getBag } from '@/server/bag'
import { getDb } from '@/server/db'
import { pluralize } from '@/server/format'
import { SOURCE_LOOK_COOKIE } from '@/server/looks'

export const metadata: Metadata = { title: 'Bag' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function QtyControls({
  productId,
  size,
  qty,
}: {
  productId: number
  size: string | null
  qty: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        action={setBagQtyAction}
        className="flex items-center rounded-sm border border-line bg-card"
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="size" value={size ?? ''} />
        <input type="hidden" name="redirect" value="/bag" />
        <Button
          type="submit"
          name="qty"
          value={qty - 1}
          variant="ghost"
          size="sm"
          aria-label="Decrease quantity"
          icon={<Minus />}
        />
        <span className="tabular w-8 text-center text-[13px]">{qty}</span>
        <Button
          type="submit"
          name="qty"
          value={qty + 1}
          variant="ghost"
          size="sm"
          aria-label="Increase quantity"
          disabled={qty >= BAG_MAX_QTY}
          icon={<Plus />}
        />
      </form>
      <form action={removeFromBagAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="size" value={size ?? ''} />
        <input type="hidden" name="redirect" value="/bag" />
        <Button type="submit" variant="ghost" size="sm" icon={<X />}>
          Remove
        </Button>
      </form>
    </div>
  )
}

export default async function BagPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser('/bag')
  const [params, lines, store] = await Promise.all([searchParams, getBag(), cookies()])
  const sourceLookId = store.get(SOURCE_LOOK_COOKIE)?.value ?? null
  const count = lines.reduce((sum, l) => sum + l.qty, 0)

  const ids = [...new Set(lines.map((l) => l.productId))]
  const rows =
    ids.length > 0
      ? await getDb()
          .db.select({ product: products, brandName: brands.name })
          .from(products)
          .innerJoin(brands, eq(products.brandId, brands.id))
          .where(inArray(products.id, ids))
      : []
  const byId = new Map(rows.map((r) => [r.product.id, { ...r.product, brandName: r.brandName }]))
  const missing = lines.filter((l) => !byId.has(l.productId))
  const orderLines: OrderLine[] = lines.flatMap((line) => {
    const product = byId.get(line.productId)
    if (!product) return []
    return [
      {
        product,
        size: line.size,
        qty: line.qty,
        controls: <QtyControls productId={line.productId} size={line.size} qty={line.qty} />,
      },
    ]
  })
  const subtotal = orderSubtotal(orderLines)

  return (
    <Container className="pb-24">
      <PageHeader title={count > 0 ? `Bag · ${pluralize(count, 'piece')}` : 'Bag'} />
      <Flash notice={params.notice} error={params.error} className="mb-6" />

      {orderLines.length === 0 ? (
        <EmptyState
          title="Your bag is empty."
          action={
            <Button href="/shop" variant="secondary">
              Browse the Shop
            </Button>
          }
        />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div>
            {missing.length > 0 ? (
              <Notice tone="info" className="mb-4">
                {pluralize(missing.length, 'line')} no longer in the catalog and not counted.
              </Notice>
            ) : null}
            <OrderLines lines={orderLines} />
          </div>
          <aside className="flex h-fit flex-col gap-4 rounded-md bg-mist p-6 lg:sticky lg:top-20">
            <dl className="flex flex-col gap-2 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-muted">{pluralize(count, 'piece')}</dt>
                <dd>
                  <Price amount={subtotal} size="sm" />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="text-muted">Included</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <dt className="font-medium">Subtotal</dt>
                <dd>
                  <Price amount={subtotal} size="lg" />
                </dd>
              </div>
            </dl>
            {sourceLookId ? (
              <Tag href={`/looks/${sourceLookId}`} className="w-fit">
                From a Look
              </Tag>
            ) : null}
            <Button href="/checkout" full size="lg">
              Checkout
            </Button>
          </aside>
        </div>
      )}
    </Container>
  )
}
