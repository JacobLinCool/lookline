import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { brands, eq, inArray, articles } from '@lookline/db'
import { Flash } from '@/components/ui/flash'
import { OrderLines, orderSubtotal, type OrderLine } from '@/components/checkout/order-lines'
import { RecipientPicker } from '@/components/checkout/recipient-picker'
import { SubmitButton } from '@/components/ui/submit-button'
import { Button, Container, EmptyState, PageHeader, Price, Tag } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { placeOrderAction } from '@/server/actions/purchase'
import { requireUser } from '@/server/auth'
import { getBag } from '@/server/bag'
import { getDb } from '@/server/db'
import { formatTwd } from '@/server/format'
import { INTENT_SESSION_COOKIE, SOURCE_CARD_COOKIE, sanitizeId } from '@/server/imagery'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.bag.checkout.metaTitle }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser('/checkout')
  const [params, lines, store, { t }] = await Promise.all([
    searchParams,
    getBag(),
    cookies(),
    getI18n(),
  ])

  // Attribution: explicit searchParams (?card= ?from=) win over cookies set while browsing.
  const sourceCardId =
    sanitizeId(first(params.card)) ?? sanitizeId(store.get(SOURCE_CARD_COOKIE)?.value)
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
        <PageHeader title={t.bag.checkout.title} />
        <EmptyState
          title={t.bag.empty}
          action={
            <Button href="/shop" variant="secondary">
              {t.bag.browseShop}
            </Button>
          }
        />
      </Container>
    )
  }

  return (
    <Container size="narrow" className="pb-24">
      <PageHeader
        title={t.bag.checkout.title}
        description={t.bag.checkout.summary(count, formatTwd(subtotal))}
      />
      <Flash error={params.error} className="mb-6" />

      <OrderLines lines={orderLines} compact />

      <form action={placeOrderAction} className="mt-8 flex flex-col gap-8">
        <input type="hidden" name="sourceCardId" value={sourceCardId ?? ''} />
        <input type="hidden" name="intentSessionId" value={intentSessionId ?? ''} />

        <RecipientPicker defaultValue="self" />

        <div className="flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[14px] font-medium">{t.bag.checkout.total}</span>
          <Price amount={subtotal} size="lg" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton size="lg" pendingLabel={t.bag.checkout.placing}>
            {t.bag.checkout.placeOrder(formatTwd(subtotal))}
          </SubmitButton>
          <Button href="/bag" variant="link">
            {t.bag.checkout.backToBag}
          </Button>
          <Tag tone="outline" className="ml-auto">
            {t.bag.checkout.sample}
          </Tag>
        </div>
      </form>
    </Container>
  )
}
