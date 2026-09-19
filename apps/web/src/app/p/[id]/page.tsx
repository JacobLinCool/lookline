import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { and, brands, eq, feedbackEvents, articles, type Brand, type Article } from '@lookline/db'
import { recordInteraction } from '@lookline/engine'
import { AddToBagForm } from '@/components/shop/add-to-bag-form'
import { AttributeList } from '@/components/shop/attribute-list'
import { CompleteTheLook } from '@/components/shop/complete-the-look'
import { SimilarPieces } from '@/components/shop/similar-pieces'
import { WhyThisSuitsYou } from '@/components/shop/why-this-suits-you'
import { Button, Container, Notice, Price, ProductImage, Tag } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import {
  aestheticLabel,
  categoryGroupLabel,
  colorFamilyLabel,
  colorNameLabel,
  departmentLabel,
  subcategoryLabel,
} from '@/i18n/taxonomy'
import { recordFeedbackFor } from '@/server/actions/feedback'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { isEngineView } from '@/server/engine-view'
import { displayName } from '@/lib/product-name'

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** H&M article ids are ten digits with their leading zeros; parsing one as a number loses them. */
function parseId(raw: string): string | null {
  return /^\d{10}$/.test(raw) ? raw : null
}

/** Article + brand, deduplicated between `generateMetadata` and the page for one request. */
const loadProduct = cache(
  async (id: string): Promise<{ product: Article; brand: Brand } | null> => {
    const [row] = await getDb()
      .db.select({ product: articles, brand: brands })
      .from(articles)
      .innerJoin(brands, eq(articles.brandId, brands.id))
      .where(eq(articles.id, id))
      .limit(1)
    return row ?? null
  },
)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getI18n()
  const id = parseId((await params).id)
  if (id === null) return { title: t.shop.product.notFound }
  try {
    const row = await loadProduct(id)
    if (!row) return { title: t.shop.product.notFound }
    return {
      title: `${row.product.name} · ${row.brand.name}`,
      description: row.product.description,
    }
  } catch {
    return { title: t.shop.product.fallbackTitle }
  }
}

/**
 * Engine 03 attribution: when the visitor arrived from a recommendation slate
 * (`?from=<intentSessionId>&pos=<n>`), log one `click` event per user × session × product.
 */
async function recordArrival(
  userId: string,
  articleId: string,
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
          eq(feedbackEvents.articleId, articleId),
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
    articleId,
    intentSessionId: from,
    position: pos,
    context: { surface: 'product_page' },
  })
}

async function recordView(
  userId: string,
  articleId: string,
  from: string | undefined,
  pos: number | null,
): Promise<void> {
  try {
    await recordInteraction(getDb().db, {
      actorUserId: userId,
      type: 'VIEW',
      articleId,
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
  const { t, locale } = await getI18n()
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

  const colourLabel = colorFamilyLabel(locale, product.colorFamily)
  // No inventory and no review data in the catalogue.
  const lowStock = false

  return (
    <Container className="pb-24">
      <nav
        aria-label={t.shop.product.breadcrumb}
        className="flex flex-wrap items-center gap-1.5 pt-5 text-[13px] text-muted"
      >
        <Link href="/shop" className={crumb}>
          {t.shop.title}
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/shop?department=${product.department}`} className={crumb}>
          {departmentLabel(locale, product.department)}
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/shop?department=${product.department}&categoryGroups=${product.categoryGroup}`}
          className={crumb}
        >
          {categoryGroupLabel(locale, product.categoryGroup)}
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/shop?department=${product.department}&categoryGroups=${product.categoryGroup}&subcategory=${product.subcategory}`}
          className={crumb}
        >
          {subcategoryLabel(locale, product.subcategory)}
        </Link>
      </nav>

      {added ? (
        <Notice
          tone="success"
          title={
            added === '1' ? t.shop.product.added : t.shop.product.addedCount(Number(added) || 0)
          }
          className="mt-4"
          action={
            <Button href="/bag" size="sm" variant="secondary">
              {t.shop.product.openBag}
            </Button>
          }
        />
      ) : null}

      <div className="mt-5 grid gap-8 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-7">
          <ProductImage articleId={product.id} alt={product.name} priority />
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
              {lowStock ? <Tag tone="accent">{t.shop.product.lowStock}</Tag> : null}
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <span
                aria-hidden
                className="size-4 rounded-full border border-line"
                style={{ background: product.colorHex }}
              />
              <span>{colorNameLabel(locale, product.colorName)}</span>
              <span className="text-muted">·</span>
              <Link
                href={`/shop?colorFamilies=${product.colorFamily}`}
                className="text-muted transition-colors hover:text-ink"
              >
                {colourLabel}
              </Link>
            </div>
            <WhyThisSuitsYou product={product} userId={user?.id ?? null} engineView={engineView} />
          </header>

          <AddToBagForm product={product} attribution={attribution} />

          <p className="max-w-prose text-[15px] leading-relaxed text-ink/85">
            {product.description}
          </p>

          <details className="group hairline pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium [&::-webkit-details-marker]:hidden">
              {t.shop.product.details}
              <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="pt-3">
              <AttributeList product={product} />
            </div>
          </details>
        </div>
      </div>

      <div className="mt-14 flex flex-col gap-12">
        <CompleteTheLook articleId={product.id} userId={user?.id ?? null} engineView={engineView} />
        <SimilarPieces articleId={product.id} userId={user?.id ?? null} engineView={engineView} />
      </div>
    </Container>
  )
}
