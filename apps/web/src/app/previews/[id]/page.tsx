import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InstantForm } from '@/components/latency/instant-form'
import { EditionCanvas } from '@/components/looks/edition-canvas'
import { Button, Container, EmptyState, Notice, ProductCard, Section, Tag } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { addPreviewToBagAction } from '@/server/actions/bag'
import { getSessionUser } from '@/server/auth'
import { presetOptions, sanitizeId } from '@/server/looks'
import { loadPreviewArticles, readPreviewGeneration } from '@/server/preview-generation'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.previews.metaTitle }
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: rawId }, user, { t, locale }] = await Promise.all([
    params,
    getSessionUser(),
    getI18n(),
  ])
  const id = sanitizeId(rawId)
  if (!id || !user) notFound()
  const state = await readPreviewGeneration(id, user.id)
  if (state.expired) {
    return (
      <Container className="pb-20 pt-10">
        <EmptyState
          title={t.previews.expired.title}
          description={t.previews.expired.description}
          action={
            <Button href="/shop" variant="secondary">
              {t.nav.shop}
            </Button>
          }
        />
      </Container>
    )
  }
  const preview = state.preview
  if (!preview || preview.ownerId !== user.id) notFound()
  const items = await loadPreviewArticles(preview.id)
  // The catalogue records no inventory, so every piece in a preview is orderable.
  const availableCount = items.length
  const unavailableCount = 0
  const expiresAt = new Intl.DateTimeFormat(locale === 'zh-TW' ? 'zh-Hant-TW' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(preview.expiresAt)

  return (
    <Container className="pb-20">
      <div className="grid gap-7 pt-7 md:pt-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <EditionCanvas
            title={preview.title}
            isOwner
            stylePreset={preview.stylePreset}
            presets={presetOptions(locale).filter(
              (preset) => !preview.sourceLookId || preset.value === preview.stylePreset,
            )}
            generationEndpoint={`/api/previews/${preview.id}/generate`}
            unavailableMessage={t.previews.detail.imageUnavailable}
            initial={{
              id: preview.id,
              status: preview.imageStatus,
              provider: preview.imageProvider,
              generationId: preview.imageGenerationId,
              startedAt: preview.imageStartedAt?.toISOString() ?? null,
              error: preview.imageError,
              imageUrl: `/api/previews/${preview.id}/image?v=${encodeURIComponent(preview.imagePath ?? 'composition')}`,
            }}
          />
        </div>

        <aside className="flex flex-col gap-5 lg:col-span-5">
          <div className="flex flex-col gap-2">
            <Tag tone="neutral" className="w-fit">
              {t.previews.detail.temporary}
            </Tag>
            <h1 className="display text-[28px] md:text-[34px]">{preview.title}</h1>
            <p className="text-[13px] text-muted">{t.previews.detail.expires(expiresAt)}</p>
          </div>
          <Notice tone="info">{t.previews.detail.explanation}</Notice>

          <InstantForm
            action={addPreviewToBagAction}
            name="add-preview-to-bag"
            confirmation={t.previews.detail.added}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="previewId" value={preview.id} />
            <Button type="submit" size="lg" full disabled={availableCount === 0}>
              {t.previews.detail.addAvailable}
            </Button>
            {unavailableCount > 0 ? (
              <p className="text-[12px] text-muted">
                {t.previews.detail.unavailableCount(unavailableCount)}
              </p>
            ) : null}
          </InstantForm>
        </aside>
      </div>

      <Section title={t.previews.detail.pieces}>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map(({ product, brandName }) => (
            <li key={product.id}>
              <ProductCard product={{ ...product, brandName }} />
            </li>
          ))}
        </ul>
      </Section>
    </Container>
  )
}
