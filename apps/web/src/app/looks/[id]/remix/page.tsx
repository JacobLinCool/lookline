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
import { first, loadLookById, loadUser, presetOptions } from '@/components/social/data'
import { GuestGate } from '@/components/social/guest-gate'
import { KeptStyle } from '@/components/social/palette'
import { ProductOption } from '@/components/social/product-option'
import { ShareLink } from '@/components/social/share-link'
import { createRemixAction } from '@/server/actions/remix'
import { getSessionUser } from '@/server/auth'
import { isEngineView } from '@/server/engine-view'

export const metadata: Metadata = { title: 'Make it mine' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const ERRORS: Record<string, string> = {
  products: 'Keep at least one piece in the Look.',
  recipient: 'That person no longer exists.',
}

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
  const [{ id }, query] = await Promise.all([params, searchParams])
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
  const title = recipient ? `A Look for ${recipientFirst}` : 'Make it mine'

  if (!viewer) {
    return (
      <Container size="narrow" className="pb-16">
        <div className="grid gap-8 pt-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:pt-10">
          <LookCard look={source.look} owner={source.owner} href={`/looks/${source.look.id}`} />
          <GuestGate
            next={currentPath}
            title={title}
            description={`Based on “${source.look.title}” by ${source.owner.displayName}.`}
            cta="Continue"
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
            Sent to {recipientFirst}
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            The Look is theirs now. The link opens without an account.
          </p>
          <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <LookCard
              look={created.look}
              owner={recipient}
              href={sharePath}
              lineage={`Styled by ${viewer.displayName}`}
            />
            <div className="flex flex-col gap-4">
              <ShareLink path={sharePath} label="Share link" />
              <div className="flex flex-wrap gap-2">
                <Button href={`/looks/${created.look.id}`} variant="secondary">
                  Open Look
                </Button>
                <Button href={`/looks/${source.look.id}`} variant="ghost">
                  Back
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
  const presets = presetOptions()
  const defaultTitle = recipient
    ? `For ${recipientFirst}, by ${viewer.displayName}`
    : `${viewer.displayName.split(/\s+/)[0] ?? viewer.displayName}'s ${source.look.title}`

  return (
    <Container className="pb-16">
      <div className="flex flex-col gap-1 pt-8 pb-6 md:pt-10">
        <h1 className="display text-[30px] md:text-[36px]">{title}</h1>
        <p className="text-[14px] text-muted">
          Based on “{source.look.title}” by {source.owner.displayName}
        </p>
      </div>

      {error && ERRORS[error] ? (
        <Notice tone="error" className="mb-6">
          {ERRORS[error]}
        </Notice>
      ) : null}
      {error === 'look' ? (
        <Notice tone="warning" className="mb-6">
          The Look was not saved. Try again.
        </Notice>
      ) : null}

      <div className="grid gap-8 md:grid-cols-12 md:gap-12">
        <aside className="flex flex-col gap-5 md:col-span-4">
          <div className="max-w-xs">
            <LookCard look={source.look} owner={source.owner} href={`/looks/${source.look.id}`} />
          </div>
          <KeptStyle aesthetics={source.look.aesthetics} palette={source.look.palette} />
          <form method="get" className="flex items-end gap-2">
            {forUserId ? <input type="hidden" name="for" value={forUserId} /> : null}
            <Field label="Budget for the whole Look" htmlFor="budget" className="flex-1">
              <Input
                id="budget"
                name="budget"
                inputMode="numeric"
                defaultValue={budgetParam ?? ''}
                placeholder="NT$5,000"
              />
            </Field>
            <Button type="submit" variant="secondary">
              Update
            </Button>
          </form>
        </aside>

        <form action={createRemixAction} className="flex flex-col gap-8 md:col-span-8">
          <input type="hidden" name="sourceLookId" value={source.look.id} />
          {forUserId ? <input type="hidden" name="forUserId" value={forUserId} /> : null}
          {budgetParam ? <input type="hidden" name="budget" value={budgetParam} /> : null}

          <Suspense
            fallback={
              <Section title="Swap in" rule={false}>
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
            <Section title="Keep from the original">
              <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {leftovers.map((product) => (
                  <li key={product.id}>
                    <ProductOption product={product} name="productId" defaultChecked />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Your Look">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Style" htmlFor="stylePreset">
                <Select
                  id="stylePreset"
                  name="stylePreset"
                  options={presets}
                  defaultValue={source.look.stylePreset}
                />
              </Field>
              <Field label="Your photo (optional)" htmlFor="photo">
                <Input
                  id="photo"
                  name="photo"
                  type="file"
                  accept="image/*"
                  className="py-1.5 file:mr-3 file:border-0 file:bg-transparent file:text-[13px]"
                />
              </Field>
              <Field label="Title" htmlFor="title" className="md:col-span-2">
                <Input id="title" name="title" defaultValue={defaultTitle} maxLength={120} />
              </Field>
            </div>
          </Section>

          <div>
            <SubmitButton pendingLabel="Saving…" size="lg">
              {recipient ? `Send to ${recipientFirst}` : 'Save my Look'}
            </SubmitButton>
          </div>
        </form>
      </div>
    </Container>
  )
}
