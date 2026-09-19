import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { brands, eq, inArray, articles } from '@lookline/db'
import { Flash } from '@/components/looks/flash'
import { OrderLines, orderSubtotal, type OrderLine } from '@/components/looks/order-lines'
import { RecipientPicker } from '@/components/looks/recipient-picker'
import { SubmitButton } from '@/components/looks/submit-button'
import { Button, Container, EmptyState, PageHeader, Price, Tag } from '@/components/ui'
import { placeOrderAction } from '@/server/actions/purchase'
import { requireUser } from '@/server/auth'
import { getBag } from '@/server/bag'
import { getDb } from '@/server/db'
import { formatTwd, pluralize } from '@/server/format'
import {
  INTENT_SESSION_COOKIE,
  SOURCE_ASK_COOKIE,
  SOURCE_LOOK_COOKIE,
  sanitizeId,
} from '@/server/looks'

export const metadata: Metadata = { title: 'Checkout' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser('/checkout')
  const [params, lines, store] = await Promise.all([searchParams, getBag(), cookies()])

  // Attribution: explicit searchParams (?look= ?ask= ?from=) win over cookies set while browsing.
  const sourceLookId =
    sanitizeId(first(params.look)) ?? sanitizeId(store.get(SOURCE_LOOK_COOKIE)?.value)
  const sourceAskId =
    sanitizeId(first(params.ask)) ?? sanitizeId(store.get(SOURCE_ASK_COOKIE)?.value)
  const intentSessionId =
    sanitizeId(first(params.from)) ?? sanitizeId(store.get(INTENT_SESSION_COOKIE)?.value)

  const ids = [...new Set(lines.map((l) => l.articleId))]
  const rows =
    ids.length > 0
      ? await getDb()
          .db.select({ product: articles, brandName: brands.name })
          .from(articles)
          .innerJoin(brands, eq(articles.brandId, brands.id))
          .where(inArray(articles.id, ids))
      : []
  const byId = new Map(rows.map((r) => [r.product.id, { ...r.product, brandName: r.brandName }]))
  const orderLines: OrderLine[] = lines.flatMap((line) => {
    const product = byId.get(line.articleId)
    return product ? [{ product, size: line.size, qty: line.qty }] : []
  })
  const count = orderLines.reduce((sum, l) => sum + l.qty, 0)
  const subtotal = orderSubtotal(orderLines)

  if (orderLines.length === 0) {
    return (
      <Container size="narrow" className="pb-24">
        <PageHeader title="Checkout" />
        <EmptyState
          title="Your bag is empty."
          action={
            <Button href="/shop" variant="secondary">
              Browse the Shop
            </Button>
          }
        />
      </Container>
    )
  }

  return (
    <Container size="narrow" className="pb-24">
      <PageHeader
        title="Checkout"
        description={`${pluralize(count, 'piece')} · ${formatTwd(subtotal)}`}
      />
      <Flash error={params.error} className="mb-6" />

      <OrderLines lines={orderLines} compact />

      <form action={placeOrderAction} className="mt-8 flex flex-col gap-8">
        <input type="hidden" name="sourceLookId" value={sourceLookId ?? ''} />
        <input type="hidden" name="sourceAskId" value={sourceAskId ?? ''} />
        <input type="hidden" name="intentSessionId" value={intentSessionId ?? ''} />

        <RecipientPicker defaultValue="self" />

        <div className="flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[14px] font-medium">Total</span>
          <Price amount={subtotal} size="lg" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton size="lg" pendingLabel="Placing order…">
            Place order · {formatTwd(subtotal)}
          </SubmitButton>
          <Button href="/bag" variant="link">
            Back to bag
          </Button>
          <Tag tone="outline" className="ml-auto">
            Sample · no payment
          </Tag>
        </div>
      </form>
    </Container>
  )
}
