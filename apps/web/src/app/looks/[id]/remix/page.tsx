import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { RemixSuggestions } from '@/components/looks/remix-suggestions'
import { SubmitButton } from '@/components/looks/submit-button'
import {
  Button,
  Container,
  Field,
  Input,
  LookCard,
  Notice,
  Section,
  Select,
  SkeletonCard,
} from '@/components/ui'
import { first, loadLookById, loadUser } from '@/components/social/data'
import { GuestGate } from '@/components/social/guest-gate'
import { KeptStyle } from '@/components/social/palette'
import { ProductOption } from '@/components/social/product-option'
import { ShareLink } from '@/components/social/share-link'
import { getI18n } from '@/i18n/server'
import type { Messages } from '@/i18n'
import { createRemixAction } from '@/server/actions/remix'
import { getSessionUser } from '@/server/auth'
import { isEngineView } from '@/server/engine-view'
import { presetOptions } from '@/server/looks'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.looks.remix.title }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const errors = (t: Messages): Record<string, string> => ({
  products: t.looks.errors.keepOnePiece,
  recipient: t.looks.errors.noSuchPerson,
})

function pagePath(id: string, forUserId: string | undefined, budget: string | undefined): string {
  const params = new URLSearchParams()
  if (forUserId) params.set('for', forUserId)
  if (budget) params.set('budget', budget)
  const qs = params.toString()
  return `/looks/${encodeURIComponent(id)}/remix${qs ? `?${qs}` : ''}`
}

/**
 * `/looks/[id]/remix` — Make it mine. Keeps the source Look's aesthetic and palette, swaps in
 * pieces that fit the viewer (Engine 02 `suggestRemix`), and creates a `remix` Look with lineage
 * back to the source. With `?for=<userId>` the same flow styles someone else.
 */
export default async function RemixPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const [{ id }, query, { t, locale }] = await Promise.all([params, searchParams, getI18n()])
  const source = await loadLookById(id)
  if (!source) notFound()

  const forUserId = first(query.for)
  const budgetParam = first(query.budget)?.trim() || undefined
  const budget = budgetParam ? Number(budgetParam.replace(/[^\d]/g, '')) : undefined
  const currentPath = pagePath(id, forUserId, budgetParam)

  const recipient = forUserId ? await loadUser(forUserId) : null
  if (forUserId && !recipient) notFound()
  const recipientFirst = recipient?.displayName.split(/\s+/)[0] ?? recipient?.displayName

  const [viewer, engineView] = await Promise.all([getSessionUser(), isEngineView()])
  const title =
    recipient && recipientFirst ? t.looks.remix.forSomeone(recipientFirst) : t.looks.remix.title

  if (!viewer) {
    return (
      <Container size="narrow" className="pb-16">
        <div className="grid gap-8 pt-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:pt-10">
          <LookCard look={source.look} owner={source.owner} href={`/looks/${source.look.id}`} />
          <GuestGate
            next={currentPath}
            title={title}
            description={t.looks.remix.basedOn(source.look.title, source.owner.displayName)}
            cta={t.common.continue}
          />
        </div>
      </Container>
    )
  }

  const createdId = first(query.created)
  if (createdId && recipient) {
    const created = await loadLookById(createdId)
    if (created && created.look.ownerId === recipient.id) {
      const sharePath = `/l/${encodeURIComponent(created.look.shareToken)}`
      return (
        <Container size="narrow" className="pb-16">
          <h1 className="display pt-8 text-[30px] md:pt-10 md:text-[36px]">
            {t.looks.remix.sentTo(recipientFirst ?? recipient.displayName)}
          </h1>
          <p className="mt-2 text-[14px] text-muted">{t.looks.remix.sentNote}</p>
          <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <LookCard
              look={created.look}
              owner={recipient}
              href={sharePath}
              lineage={t.looks.remix.styledBy(viewer.displayName)}
            />
            <div className="flex flex-col gap-4">
              <ShareLink path={sharePath} label={t.looks.remix.shareLink} />
              <div className="flex flex-wrap gap-2">
                <Button href={`/looks/${created.look.id}`} variant="secondary">
                  {t.looks.remix.openLook}
                </Button>
                <Button href={`/looks/${source.look.id}`} variant="ghost">
                  {t.common.back}
                </Button>
              </div>
            </div>
          </div>
        </Container>
      )
    }
  }

  const subjectId = recipient?.id ?? viewer.id
  const leftovers = source.products
  const error = first(query.error)
  const errorMessage = error ? errors(t)[error] : undefined
  const presets = presetOptions(locale)
  const defaultTitle =
    recipient && recipientFirst
      ? t.looks.remix.defaultTitleFor(recipientFirst, viewer.displayName)
      : t.looks.remix.defaultTitle(
          viewer.displayName.split(/\s+/)[0] ?? viewer.displayName,
          source.look.title,
        )

  return (
    <Container className="pb-16">
      <div className="flex flex-col gap-1 pt-8 pb-6 md:pt-10">
        <h1 className="display text-[30px] md:text-[36px]">{title}</h1>
        <p className="text-[14px] text-muted">
          {t.looks.remix.basedOn(source.look.title, source.owner.displayName)}
        </p>
      </div>

      {errorMessage ? (
        <Notice tone="error" className="mb-6">
          {errorMessage}
        </Notice>
      ) : null}
      {error === 'look' ? (
        <Notice tone="warning" className="mb-6">
          {t.looks.errors.notSaved}
        </Notice>
      ) : null}

      <div className="grid gap-8 md:grid-cols-12 md:gap-12">
        <aside className="flex flex-col gap-5 md:col-span-4">
          <div className="max-w-xs">
            <LookCard look={source.look} owner={source.owner} href={`/looks/${source.look.id}`} />
          </div>
          <KeptStyle
            aesthetics={source.look.aesthetics}
            palette={source.look.palette}
            label={t.looks.remix.keeps}
          />
          <form method="get" className="flex items-end gap-2">
            {forUserId ? <input type="hidden" name="for" value={forUserId} /> : null}
            <Field label={t.looks.remix.budget} htmlFor="budget" className="flex-1">
              <Input
                id="budget"
                name="budget"
                inputMode="numeric"
                defaultValue={budgetParam ?? ''}
                placeholder={t.looks.remix.budgetPlaceholder}
              />
            </Field>
            <Button type="submit" variant="secondary">
              {t.looks.update}
            </Button>
          </form>
        </aside>

        <form action={createRemixAction} className="flex flex-col gap-8 md:col-span-8">
          <input type="hidden" name="sourceLookId" value={source.look.id} />
          {forUserId ? <input type="hidden" name="forUserId" value={forUserId} /> : null}
          {budgetParam ? <input type="hidden" name="budget" value={budgetParam} /> : null}

          <Suspense
            fallback={
              <Section title={t.looks.remix.swapIn} rule={false}>
                <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  <li>
                    <SkeletonCard />
                  </li>
                  <li>
                    <SkeletonCard />
                  </li>
                  <li>
                    <SkeletonCard />
                  </li>
                </ul>
              </Section>
            }
          >
            <RemixSuggestions
              lookId={source.look.id}
              userId={subjectId}
              budget={budget}
              originalIds={source.products.map((p) => p.id)}
              engineView={engineView}
            />
          </Suspense>

          {leftovers.length > 0 ? (
            <Section title={t.looks.remix.keepOriginal}>
              <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {leftovers.map((product) => (
                  <li key={product.id}>
                    <ProductOption product={product} name="productId" defaultChecked />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t.looks.remix.yourLook}>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label={t.looks.style} htmlFor="stylePreset">
                <Select
                  id="stylePreset"
                  name="stylePreset"
                  options={presets}
                  defaultValue={source.look.stylePreset}
                />
              </Field>
              <Field label={t.looks.photoField} htmlFor="photo">
                <Input
                  id="photo"
                  name="photo"
                  type="file"
                  accept="image/*"
                  className="py-1.5 file:mr-3 file:border-0 file:bg-transparent file:text-[13px]"
                />
              </Field>
              <Field label={t.looks.titleField} htmlFor="title" className="md:col-span-2">
                <Input id="title" name="title" defaultValue={defaultTitle} maxLength={120} />
              </Field>
            </div>
          </Section>

          <div>
            <SubmitButton pendingLabel={t.common.saving} size="lg">
              {recipient && recipientFirst
                ? t.looks.remix.sendTo(recipientFirst)
                : t.looks.remix.save}
            </SubmitButton>
          </div>
        </form>
      </div>
    </Container>
  )
}
