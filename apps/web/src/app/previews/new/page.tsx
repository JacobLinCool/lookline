import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { brands, eq, inArray, products } from '@lookline/db'
import { STYLE_PRESETS } from '@lookline/engine'
import { Flash } from '@/components/looks/flash'
import { ReferencePhotoField } from '@/components/looks/reference-photo-field'
import { SubmitButton } from '@/components/looks/submit-button'
import {
  Button,
  Container,
  EmptyState,
  Field,
  Input,
  Notice,
  ProductCard,
  Rail,
  RailItem,
  Section,
} from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { createPreviewAction } from '@/server/actions/previews'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { sanitizeId } from '@/server/looks'
import { loadPreviewSourceLook } from '@/server/preview-source'

const MAX_PRODUCTS = 8
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function readProductIds(value: string | string[] | undefined): number[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '')
  return [...new Set(raw.split(',').map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_PRODUCTS)
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.previews.metaTitle }
}

export default async function NewPreviewPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, { t, locale }] = await Promise.all([searchParams, getI18n()])
  const lookParam = Array.isArray(params.look) ? params.look[0] : params.look
  const sourceLookId = sanitizeId(lookParam)
  const requestedProductIds = readProductIds(params.products)
  const requestedPath = sourceLookId
    ? `/previews/new?look=${encodeURIComponent(sourceLookId)}`
    : `/previews/new?products=${requestedProductIds.join(',')}`
  const user = await requireUser(requestedPath)
  const source = sourceLookId ? await loadPreviewSourceLook(sourceLookId, user.id) : null
  if (lookParam && !source) notFound()
  const productIds = source?.productIds.slice(0, MAX_PRODUCTS) ?? requestedProductIds
  const rows = productIds.length
    ? await getDb()
        .db.select({ product: products, brandName: brands.name })
        .from(products)
        .innerJoin(brands, eq(products.brandId, brands.id))
        .where(inArray(products.id, productIds))
    : []
  const ordered = productIds.flatMap((id) => {
    const row = rows.find(({ product }) => product.id === id)
    return row ? [row] : []
  })
  const returnPath = source
    ? `/previews/new?look=${encodeURIComponent(source.look.id)}`
    : `/previews/new?products=${productIds.join(',')}`
  const stylePresets = source
    ? STYLE_PRESETS.filter(({ slug }) => slug === source.look.stylePreset)
    : STYLE_PRESETS
  const defaultTitle = source
    ? t.previews.borrowed.defaultTitle(source.look.title)
    : t.previews.new.defaultTitle

  return (
    <Container className="pb-20">
      <div className="flex max-w-2xl flex-col gap-3 pt-8 md:pt-10">
        <h1 className="display text-[30px] md:text-[36px]">{t.previews.new.title}</h1>
        <p className="text-[14px] leading-relaxed text-muted">
          {source ? t.previews.borrowed.description(source.look.title) : t.previews.new.description}
        </p>
      </div>
      <Flash error={params.error} className="mt-4" />

      {ordered.length === 0 ? (
        <EmptyState
          className="mt-8"
          title={t.previews.new.emptyTitle}
          description={t.previews.new.emptyDescription}
          action={
            <Button href="/shop" variant="secondary">
              {t.nav.shop}
            </Button>
          }
        />
      ) : (
        <form action={createPreviewAction} encType="multipart/form-data">
          <input type="hidden" name="return" value={returnPath} />
          {source ? <input type="hidden" name="sourceLookId" value={source.look.id} /> : null}
          {ordered.map(({ product }) => (
            <input key={product.id} type="hidden" name="productId" value={product.id} />
          ))}

          <Section title={t.previews.new.pieces} rule={false} className="pt-7">
            {source ? (
              <Notice tone="info" title={t.previews.borrowed.exact} className="mb-5">
                {t.previews.borrowed.exactNote}
              </Notice>
            ) : null}
            <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {ordered.map(({ product, brandName }) => (
                <li key={product.id}>
                  <ProductCard product={{ ...product, brandName }} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t.looks.style}>
            <Rail itemWidth="md">
              {stylePresets.map((preset, index) => (
                <RailItem key={preset.slug} width="md">
                  <label className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-md border border-line bg-card ring-2 ring-transparent ring-offset-2 ring-offset-paper transition-shadow hover:border-ink has-checked:border-ink has-checked:ring-ink">
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
                    <span className="p-3 text-[14px] leading-tight font-medium">
                      {locale === 'zh-TW' ? preset.labelZh : preset.name}
                    </span>
                  </label>
                </RailItem>
              ))}
            </Rail>
          </Section>

          <Section title={t.previews.new.photo}>
            <div className="grid gap-6 md:grid-cols-2">
              <ReferencePhotoField
                required
                hasSavedPhoto={Boolean(user.photoPath)}
                labels={{
                  field: t.looks.photoField,
                  hint: t.previews.new.photoHint,
                  previewAlt: t.previews.new.photoPreviewAlt,
                  empty: t.previews.new.noPhotoSelected,
                  selected: t.previews.new.savedPhotoSelected,
                  generated: t.previews.new.photoRequired,
                  newPhoto: t.looks.new.newPhoto,
                  remember: t.looks.new.rememberPhoto,
                  useSaved: t.looks.new.useSavedPhoto,
                }}
              />
              <div className="flex flex-col gap-5">
                {source ? (
                  <input type="hidden" name="occasion" value={source.look.occasion ?? ''} />
                ) : (
                  <Field label={t.previews.new.occasion} htmlFor="occasion">
                    <Input
                      id="occasion"
                      name="occasion"
                      maxLength={80}
                      placeholder={t.previews.new.occasionPlaceholder}
                    />
                  </Field>
                )}
                <Field label={t.previews.new.titleField} htmlFor="title">
                  <Input id="title" name="title" maxLength={80} defaultValue={defaultTitle} />
                </Field>
                <Notice tone="info" title={t.previews.detail.temporary}>
                  {t.previews.detail.explanation}
                </Notice>
              </div>
            </div>
          </Section>

          <div className="sticky bottom-14 z-30 -mx-5 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur-sm md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-2 md:backdrop-blur-none">
            <SubmitButton size="lg" pendingLabel={t.previews.new.creating}>
              {t.previews.new.submit}
            </SubmitButton>
          </div>
        </form>
      )}
    </Container>
  )
}
