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
import { createLookAction } from '@/server/actions/looks'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative, pluralize } from '@/server/format'
import { sanitizeId } from '@/server/looks'
import { displayName } from '@/lib/product-name'

export const metadata: Metadata = { title: 'New Look' }

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
  const params = await searchParams
  const { db } = getDb()

  const purchaseIds = readIdList(params.purchases)
    .map((id) => sanitizeId(id))
    .filter((id): id is string => id !== null)
  const productParam = readIdList(params.articles)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)

  // Which articles may go into the Look: from the given purchases, explicit product ids, or the
  // user's most recent purchases.
  let source: 'purchases' | 'articles' | 'recent' = 'recent'
  let candidateIds: number[] = []
  let purchasedAt = new Map<number, Date>()
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
  const defaultTitle = `${user.displayName.split(/\s+/)[0] ?? user.displayName}'s Look`

  const returnPath = (() => {
    const q = new URLSearchParams()
    if (source === 'purchases') q.set('purchases', purchaseIds.join(','))
    if (source === 'articles') q.set('articles', productParam.join(','))
    const s = q.toString()
    return s ? `/looks/new?${s}` : '/looks/new'
  })()

  return (
    <Container className="pb-16">
      <h1 className="display pt-8 text-[30px] md:pt-10 md:text-[36px]">New Look</h1>
      <Flash error={params.error} className="mt-4" />

      {ordered.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Nothing to make a Look from yet."
          description="Looks are made from pieces you own."
          action={
            <Button href="/shop" variant="secondary">
              Shop
            </Button>
          }
        />
      ) : null}

      <form action={createLookAction} className="block min-w-0">
        <input type="hidden" name="return" value={returnPath} />

        <Section title="Pieces" rule={false} className="pt-6">
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
                      <Tag tone="ink">In</Tag>
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5 px-0.5">
                    <span className="truncate text-[12px] text-muted">{brandName}</span>
                    <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                      {displayName(product.name, brandName)}
                    </span>
                    <span className="text-[12px] text-muted">
                      {purchasedAt.has(product.id)
                        ? `Bought ${formatRelative(purchasedAt.get(product.id) ?? new Date())}`
                        : product.colorName}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Style">
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
                      {preset.name}
                      {preset.labelZh ? (
                        <span className="ml-1.5 text-[12px] font-normal text-muted">
                          {preset.labelZh}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </label>
              </RailItem>
            ))}
          </Rail>
        </Section>

        <Section title="Photo">
          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="Your photo (optional)"
              htmlFor="photo"
              hint="Only used to render your Look."
            >
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
                  Remember this photo
                </label>
                {user.photoPath ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="useSavedPhoto"
                      defaultChecked
                      className="size-4 accent-ink"
                    />
                    Use my saved photo
                  </label>
                ) : null}
              </span>
            </Field>

            <div className="flex flex-col gap-5">
              <Field label="Occasion (optional)" htmlFor="occasion">
                <Input
                  id="occasion"
                  name="occasion"
                  maxLength={80}
                  lang="zh-Hant"
                  placeholder="First day at the new office / 音樂祭"
                />
              </Field>
              <Field label="Title" htmlFor="title">
                <Input id="title" name="title" maxLength={80} defaultValue={defaultTitle} />
              </Field>
              <Field label="Who can see it" htmlFor="visibility">
                <Select
                  id="visibility"
                  name="visibility"
                  defaultValue="link"
                  options={[
                    { value: 'private', label: 'Only me' },
                    { value: 'link', label: 'Anyone with the link' },
                    { value: 'public', label: 'Everyone on Lookline' },
                  ]}
                />
              </Field>
            </div>
          </div>
        </Section>

        <div className="sticky bottom-14 z-30 -mx-5 flex items-center gap-4 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur-sm md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-2 md:backdrop-blur-none">
          <SubmitButton size="lg" disabled={ordered.length === 0} pendingLabel="Creating…">
            Create Look
          </SubmitButton>
          <span className="text-[13px] text-muted">{pluralize(selectedCount, 'piece')}</span>
        </div>
      </form>
    </Container>
  )
}
