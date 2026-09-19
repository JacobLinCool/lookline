import type { Metadata } from 'next'
import { and, brands, desc, eq, inArray, articles, purchases } from '@lookline/db'
import { STYLE_PRESETS } from '@lookline/engine'
import { Flash } from '@/components/looks/flash'
import { SubmitButton } from '@/components/looks/submit-button'
import {
  Button,
  Container,
  EmptyState,
  Field,
  Input,
  ProductImage,
  Rail,
  RailItem,
  Section,
  Select,
  Tag,
} from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { createLookAction } from '@/server/actions/looks'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative } from '@/server/format'
import { colorNameLabel } from '@/i18n/taxonomy'
import { sanitizeId } from '@/server/looks'
import { displayName } from '@/lib/product-name'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.looks.new.title }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const MAX_PRODUCTS = 8

function readIdList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '')
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default async function NewLookPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser('/looks/new')
  const [params, { t, locale }] = await Promise.all([searchParams, getI18n()])
  const { db } = getDb()

  const purchaseIds = readIdList(params.purchases)
    .map((id) => sanitizeId(id))
    .filter((id): id is string => id !== null)
  const productParam = readIdList(params.articles).filter((id) => /^\d{10}$/.test(id))

  // Which articles may go into the Look: from the given purchases, explicit product ids, or the
  // user's most recent purchases.
  let source: 'purchases' | 'articles' | 'recent' = 'recent'
  let candidateIds: string[] = []
  let purchasedAt = new Map<string, Date>()
  if (purchaseIds.length > 0) {
    source = 'purchases'
    const rows = await db
      .select({ articleId: purchases.articleId, createdAt: purchases.createdAt })
      .from(purchases)
      .where(and(inArray(purchases.id, purchaseIds), eq(purchases.userId, user.id)))
    candidateIds = rows.map((r) => r.articleId)
    purchasedAt = new Map(rows.map((r) => [r.articleId, r.createdAt]))
  } else if (productParam.length > 0) {
    source = 'articles'
    candidateIds = productParam
  } else {
    const rows = await db
      .select({ articleId: purchases.articleId, createdAt: purchases.createdAt })
      .from(purchases)
      .where(eq(purchases.userId, user.id))
      .orderBy(desc(purchases.createdAt))
      .limit(24)
    candidateIds = rows.map((r) => r.articleId)
    purchasedAt = new Map(rows.map((r) => [r.articleId, r.createdAt]))
  }
  candidateIds = [...new Set(candidateIds)].slice(0, 12)

  const candidates =
    candidateIds.length > 0
      ? await db
          .select({ product: articles, brandName: brands.name })
          .from(articles)
          .innerJoin(brands, eq(articles.brandId, brands.id))
          .where(inArray(articles.id, candidateIds))
      : []
  const ordered = candidateIds.flatMap((id) => {
    const row = candidates.find((c) => c.product.id === id)
    return row ? [row] : []
  })
  const selectedCount = Math.min(ordered.length, MAX_PRODUCTS)
  const defaultTitle = t.looks.new.defaultTitle(
    user.displayName.split(/\s+/)[0] ?? user.displayName,
  )

  const returnPath = (() => {
    const q = new URLSearchParams()
    if (source === 'purchases') q.set('purchases', purchaseIds.join(','))
    if (source === 'articles') q.set('articles', productParam.join(','))
    const s = q.toString()
    return s ? `/looks/new?${s}` : '/looks/new'
  })()

  return (
    <Container className="pb-16">
      <h1 className="display pt-8 text-[30px] md:pt-10 md:text-[36px]">{t.looks.new.title}</h1>
      <Flash error={params.error} className="mt-4" />

      {ordered.length === 0 ? (
        <EmptyState
          className="mt-8"
          title={t.looks.new.emptyTitle}
          description={t.looks.new.emptyDescription}
          action={
            <Button href="/shop" variant="secondary">
              {t.nav.shop}
            </Button>
          }
        />
      ) : null}

      <form action={createLookAction} className="block min-w-0">
        <input type="hidden" name="return" value={returnPath} />

        <Section title={t.looks.new.pieces} rule={false} className="pt-6">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {ordered.map(({ product, brandName }, index) => (
              <li key={product.id}>
                <label className="group relative flex cursor-pointer flex-col gap-2">
                  <input
                    type="checkbox"
                    name="articleId"
                    value={product.id}
                    defaultChecked={index < MAX_PRODUCTS}
                    className="sr-only"
                  />
                  <span className="relative block rounded-md ring-2 ring-transparent ring-offset-2 ring-offset-paper transition-shadow group-has-checked:ring-ink">
                    <ProductImage
                      articleId={product.id}
                      alt={displayName(product.name, brandName)}
                    />
                    <span className="absolute top-2 left-2 hidden group-has-checked:inline-flex">
                      <Tag tone="ink">{t.looks.new.chosen}</Tag>
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5 px-0.5">
                    <span className="truncate text-[12px] text-muted">{brandName}</span>
                    <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                      {displayName(product.name, brandName)}
                    </span>
                    <span className="text-[12px] text-muted">
                      {purchasedAt.has(product.id)
                        ? t.looks.new.bought(
                            formatRelative(purchasedAt.get(product.id) ?? new Date(), locale),
                          )
                        : colorNameLabel(locale, product.colorName)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t.looks.style}>
          <Rail itemWidth="md">
            {STYLE_PRESETS.map((preset, index) => (
              <RailItem key={preset.slug} width="md">
                <label
                  title={preset.description}
                  className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-md border border-line bg-card ring-2 ring-transparent ring-offset-2 ring-offset-paper transition-shadow hover:border-ink has-checked:border-ink has-checked:ring-ink"
                >
                  <input
                    type="radio"
                    name="stylePreset"
                    value={preset.slug}
                    defaultChecked={index === 0}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="relative block h-28"
                    style={{ background: preset.theme.background }}
                  >
                    <span
                      className="absolute bottom-4 left-4 h-1.5 w-14 rounded-full"
                      style={{ background: preset.theme.foreground }}
                    />
                    <span
                      className="absolute right-4 bottom-4 h-1.5 w-6 rounded-full"
                      style={{ background: preset.theme.accent }}
                    />
                  </span>
                  <span className="flex flex-col gap-1 p-3">
                    <span className="text-[14px] leading-tight font-medium">
                      {locale === 'zh-TW' ? preset.labelZh : preset.name}
                      <span className="ml-1.5 text-[12px] font-normal text-muted">
                        {locale === 'zh-TW' ? preset.name : preset.labelZh}
                      </span>
                    </span>
                  </span>
                </label>
              </RailItem>
            ))}
          </Rail>
        </Section>

        <Section title={t.looks.new.photo}>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label={t.looks.photoField} htmlFor="photo" hint={t.looks.new.photoHint}>
              <input
                id="photo"
                type="file"
                name="photo"
                accept="image/*"
                className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-[13px] file:mr-3 file:rounded-xs file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[12px] file:text-paper"
              />
              <span className="mt-2 flex flex-col gap-1.5 text-[13px]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="rememberPhoto"
                    defaultChecked
                    className="size-4 accent-ink"
                  />
                  {t.looks.new.rememberPhoto}
                </label>
                {user.photoPath ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="useSavedPhoto"
                      defaultChecked
                      className="size-4 accent-ink"
                    />
                    {t.looks.new.useSavedPhoto}
                  </label>
                ) : null}
              </span>
            </Field>

            <div className="flex flex-col gap-5">
              <Field label={t.looks.new.occasion} htmlFor="occasion">
                <Input
                  id="occasion"
                  name="occasion"
                  maxLength={80}
                  lang="zh-Hant"
                  placeholder={t.looks.new.occasionPlaceholder}
                />
              </Field>
              <Field label={t.looks.titleField} htmlFor="title">
                <Input id="title" name="title" maxLength={80} defaultValue={defaultTitle} />
              </Field>
              <Field label={t.looks.new.visibility} htmlFor="visibility">
                <Select
                  id="visibility"
                  name="visibility"
                  defaultValue="link"
                  options={[
                    { value: 'private', label: t.looks.visibility.private },
                    { value: 'link', label: t.looks.visibility.link },
                    { value: 'public', label: t.looks.visibility.public },
                  ]}
                />
              </Field>
            </div>
          </div>
        </Section>

        <div className="sticky bottom-14 z-30 -mx-5 flex items-center gap-4 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur-sm md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-2 md:backdrop-blur-none">
          <SubmitButton
            size="lg"
            disabled={ordered.length === 0}
            pendingLabel={t.looks.new.creating}
          >
            {t.looks.new.submit}
          </SubmitButton>
          <span className="text-[13px] text-muted">{t.common.count.pieces(selectedCount)}</span>
        </div>
      </form>
    </Container>
  )
}
