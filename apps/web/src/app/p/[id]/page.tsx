import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { and, brands, eq, feedbackEvents, products, type Brand, type Product } from '@lookline/db'
import { recordInteraction } from '@lookline/engine'
import { AddToBagForm } from '@/components/shop/add-to-bag-form'
import { AttributeList } from '@/components/shop/attribute-list'
import { CompleteTheLook } from '@/components/shop/complete-the-look'
import { COLOR_FAMILY_LABELS, DEPARTMENT_LABELS } from '@/components/shop/constants'
import { SimilarPieces } from '@/components/shop/similar-pieces'
import { WhyThisSuitsYou } from '@/components/shop/why-this-suits-you'
import { Button, Container, Notice, Price, ProductImage, Tag } from '@/components/ui'
import { recordFeedbackFor } from '@/server/actions/feedback'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { isEngineView } from '@/server/engine-view'
import { humanize } from '@/server/format'
import { displayName } from '@/lib/product-name'

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function parseId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null
  const id = Number(raw)
  return id > 0 ? id : null
}

/** Product + brand, deduplicated between `generateMetadata` and the page for one request. */
const loadProduct = cache(
  async (id: number): Promise<{ product: Product; brand: Brand } | null> => {
    const [row] = await getDb()
      .db.select({ product: products, brand: brands })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(eq(products.id, id))
      .limit(1)
    return row ?? null
  },
)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = parseId((await params).id)
  if (id === null) return { title: 'Product not found' }
  try {
    const row = await loadProduct(id)
    if (!row) return { title: 'Product not found' }
    return {
      title: `${row.product.name} · ${row.brand.name}`,
      description: row.product.description,
    }
  } catch {
    return { title: 'Product' }
  }
}

/**
 * Engine 03 attribution: when the visitor arrived from a recommendation slate
 * (`?from=<intentSessionId>&pos=<n>`), log one `click` event per user × session × product.
 */
async function recordArrival(
  userId: string,
  productId: number,
  from: string | undefined,
  pos: number | null,
): Promise<void> {
  if (!from) return
  try {
    const [existing] = await getDb()
      .db.select({ id: feedbackEvents.id })
      .from(feedbackEvents)
      .where(
        and(
          eq(feedbackEvents.userId, userId),
          eq(feedbackEvents.productId, productId),
          eq(feedbackEvents.intentSessionId, from),
          eq(feedbackEvents.kind, 'click'),
        ),
      )
      .limit(1)
    if (existing) return
  } catch (error) {
    console.warn('[product] click dedupe lookup failed', error)
    return
  }
  await recordFeedbackFor(userId, {
    kind: 'click',
    productId,
    intentSessionId: from,
    position: pos,
    context: { surface: 'product_page' },
  })
}

async function recordView(
  userId: string,
  productId: number,
  from: string | undefined,
  pos: number | null,
): Promise<void> {
  try {
    await recordInteraction(getDb().db, {
      actorUserId: userId,
      type: 'VIEW',
      productId,
      payload: from ? { intentSessionId: from, position: pos } : {},
    })
  } catch (error) {
    console.warn('[product] VIEW interaction not recorded', error)
  }
}

const crumb = 'transition-colors hover:text-ink'

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams])
  const id = parseId(rawId)
  if (id === null) notFound()

  const row = await loadProduct(id)
  if (!row) notFound()
  const { product, brand } = row

  const from = typeof query.from === 'string' && query.from.trim() ? query.from.trim() : undefined
  const posRaw = typeof query.pos === 'string' ? Number(query.pos) : NaN
  const pos = Number.isInteger(posRaw) && posRaw >= 0 ? posRaw : null
  const added = typeof query.added === 'string' ? query.added : null
  const attribution = {
    sourceLook: typeof query.look === 'string' ? query.look : null,
    sourceAsk: typeof query.ask === 'string' ? query.ask : null,
    intentSession: from ?? null,
  }

  const [user, engineView] = await Promise.all([getSessionUser(), isEngineView()])
  if (user) {
    await Promise.all([recordView(user.id, id, from, pos), recordArrival(user.id, id, from, pos)])
  }

  const colourLabel =
    COLOR_FAMILY_LABELS[product.colorFamily as keyof typeof COLOR_FAMILY_LABELS] ??
    humanize(product.colorFamily)
  const lowStock = product.stock > 0 && product.stock <= 5

  return (
    <Container className="pb-24">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 pt-5 text-[13px] text-muted"
      >
        <Link href="/shop" className={crumb}>
          Shop
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/shop?department=${product.department}`} className={crumb}>
          {DEPARTMENT_LABELS[product.department]}
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/shop?department=${product.department}&categoryGroups=${product.categoryGroup}`}
          className={crumb}
        >
          {humanize(product.categoryGroup)}
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/shop?department=${product.department}&categoryGroups=${product.categoryGroup}&subcategory=${product.subcategory}`}
          className={crumb}
        >
          {humanize(product.subcategory)}
        </Link>
      </nav>

      {added ? (
        <Notice
          tone="success"
          title={added === '1' ? 'Added to your bag' : `${added} pieces added to your bag`}
          className="mt-4"
          action={
            <Button href="/bag" size="sm" variant="secondary">
              Open bag
            </Button>
          }
        />
      ) : null}

      <div className="mt-5 grid gap-8 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-7">
          <ProductImage productId={product.id} alt={product.name} priority />
        </div>

        <div className="flex flex-col gap-6 md:col-span-5">
          <header className="flex flex-col gap-2.5">
            <Link
              href={`/shop?brandId=${brand.id}`}
              className="w-fit text-[13px] text-muted transition-colors hover:text-ink"
            >
              {brand.name}
            </Link>
            <h1 className="display text-[28px] md:text-[32px]">
              {displayName(product.name, brand.name)}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <Price amount={product.price} size="lg" />
              {lowStock ? <Tag tone="accent">Low stock</Tag> : null}
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <span
                aria-hidden
                className="size-4 rounded-full border border-line"
                style={{ background: product.colorHex }}
              />
              <span>{product.colorName}</span>
              <span className="text-muted">·</span>
              <Link
                href={`/shop?colorFamilies=${product.colorFamily}`}
                className="text-muted transition-colors hover:text-ink"
              >
                {colourLabel}
              </Link>
              {product.secondaryColorHex ? (
                <span
                  aria-label="Second colour"
                  className="size-4 rounded-full border border-line"
                  style={{ background: product.secondaryColorHex }}
                />
              ) : null}
            </div>
            {product.reviewCount > 0 ? (
              <p className="tabular text-[13px] text-muted">
                {product.rating.toFixed(1)} / 5 · {product.reviewCount.toLocaleString('en-US')}{' '}
                {product.reviewCount === 1 ? 'review' : 'reviews'}
              </p>
            ) : null}
            <WhyThisSuitsYou product={product} userId={user?.id ?? null} engineView={engineView} />
          </header>

          <AddToBagForm product={product} attribution={attribution} />

          <p className="max-w-prose text-[15px] leading-relaxed text-ink/85">
            {product.description}
          </p>

          <details className="group hairline pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium [&::-webkit-details-marker]:hidden">
              Details
              <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="pt-3">
              <AttributeList product={product} />
            </div>
          </details>

          {engineView && product.aesthetics.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {product.aesthetics.map((slug) => (
                <Tag
                  key={slug}
                  tone="outline"
                  href={`/shop?aesthetics=${encodeURIComponent(slug)}`}
                >
                  {humanize(slug)}
                </Tag>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-14 flex flex-col gap-12">
        <CompleteTheLook productId={product.id} userId={user?.id ?? null} engineView={engineView} />
        <SimilarPieces productId={product.id} userId={user?.id ?? null} engineView={engineView} />
      </div>
    </Container>
  )
}
