import { InstantForm } from '@/components/latency/instant-form'
import type { Metadata } from 'next'
import {
  Button,
  Container,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Section,
  Select,
  Tag,
  Textarea,
} from '@/components/ui'
import {
  first,
  loadLookById,
  loadNetworkPeople,
  loadProductsByIds,
  loadUserAsks,
  occasionOptions,
  parseIdList,
  type ShopProduct,
} from '@/components/social/data'

import { GuestGate } from '@/components/social/guest-gate'
import { ProductOption } from '@/components/social/product-option'
import { getI18n } from '@/i18n/server'
import { createAskAction } from '@/server/actions/asks'
import { getSessionUser } from '@/server/auth'
import { getBag } from '@/server/bag'
import { formatRelative } from '@/server/format'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.social.askNew.title }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function buildPath(query: Record<string, string | string[] | undefined>, kind: string): string {
  const params = new URLSearchParams()
  params.set('kind', kind)
  const look = first(query.look)
  const articles = first(query.articles)
  if (look) params.set('look', look)
  if (articles) params.set('articles', articles)
  return `/asks/new?${params.toString()}`
}

/**
 * `/asks/new` — compose an Ask. `?articles=1,2,3` or `?look=<id>` preload the options (a Look's
 * articles are preselected); the bag contributes candidates too. `?kind=style_me` switches to the
 * "Style me" brief (no options, a budget and an occasion).
 */
export default async function NewAskPage({ searchParams }: { searchParams: SearchParams }) {
  const [query, { t, locale }] = await Promise.all([searchParams, getI18n()])
  const copy = t.social.askNew
  const kind = first(query.kind) === 'style_me' ? 'style_me' : 'choose'
  const lookId = first(query.look)
  const currentPath = buildPath(query, kind)

  const viewer = await getSessionUser()
  if (!viewer) {
    return (
      <Container size="narrow" className="pb-24">
        <PageHeader title={copy.title} />
        <GuestGate
          next={currentPath}
          title={t.social.guest.name}
          description={copy.guestDescription}
        />
      </Container>
    )
  }

  const [look, paramProducts, bagLines, network, recentAsks] = await Promise.all([
    lookId ? loadLookById(lookId) : Promise.resolve(null),
    loadProductsByIds(parseIdList(query.articles)),
    getBag(),
    loadNetworkPeople(viewer.id),
    loadUserAsks(viewer.id, 3),
  ])
  const bagProducts = await loadProductsByIds(bagLines.map((l) => l.articleId))

  const preselected = new Set<string>([
    ...paramProducts.map((p) => p.id),
    ...(look?.articles.map((p) => p.id) ?? []),
  ])
  const candidates = new Map<string, ShopProduct>()
  for (const p of [...paramProducts, ...(look?.articles ?? []), ...bagProducts]) {
    if (!candidates.has(p.id)) candidates.set(p.id, p)
  }
  const options = [...candidates.values()]
  const preselectCount = [...preselected].filter((id) => candidates.has(id)).length
  let defaultChecked = 0

  const error = first(query.error)
  const errors: Record<string, string | undefined> = {
    options: copy.errors.options,
    handle: copy.errors.handle,
  }
  const peopleOptions = network.people.map((p) => ({
    value: p.id,
    label: `${p.displayName} · @${p.handle}`,
  }))

  return (
    <Container className="pb-24">
      <PageHeader
        title={copy.title}
        description={look ? copy.fromLook(look.look.title, look.owner.displayName) : undefined}
        actions={
          <>
            <Button
              href={buildPath(query, 'choose')}
              variant={kind === 'choose' ? 'primary' : 'secondary'}
              size="sm"
            >
              {t.social.ask.whichOne}
            </Button>
            <Button
              href={buildPath(query, 'style_me')}
              variant={kind === 'style_me' ? 'primary' : 'secondary'}
              size="sm"
            >
              {t.social.ask.styleMe}
            </Button>
          </>
        }
      />

      {error && errors[error] ? (
        <Notice tone="error" className="mb-6">
          {errors[error]}
        </Notice>
      ) : null}
      {error === 'engine' ? (
        <Notice tone="warning" className="mb-6">
          {copy.errors.engine}
        </Notice>
      ) : null}

      <InstantForm
        name="ask"
        confirmation={t.social.ask.sending}
        action={createAskAction}
        className="flex flex-col gap-8"
      >
        <input type="hidden" name="kind" value={kind} />
        {lookId ? <input type="hidden" name="lookId" value={lookId} /> : null}

        {kind === 'choose' ? (
          <Section
            title={copy.pieces}
            description={copy.piecesHint}
            rule={false}
            className="py-0 md:py-0"
          >
            {options.length === 0 ? (
              <EmptyState
                title={copy.noPieces}
                action={
                  <Button href="/shop" variant="secondary">
                    {copy.browseShop}
                  </Button>
                }
              />
            ) : (
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {options.map((product) => {
                  const checked =
                    (preselectCount > 0 ? preselected.has(product.id) : true) && defaultChecked < 4
                  if (checked) defaultChecked += 1
                  return (
                    <li key={product.id}>
                      <ProductOption product={product} name="articleId" defaultChecked={checked} />
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        ) : null}

        <div className="grid grid-cols-1 gap-5 md:max-w-3xl md:grid-cols-2">
          {kind === 'choose' ? (
            <Field label={copy.question} htmlFor="question" className="md:col-span-2">
              <Input
                id="question"
                name="question"
                defaultValue={t.social.ask.whichOne}
                maxLength={280}
              />
            </Field>
          ) : (
            <>
              <Field label={copy.need} htmlFor="question" className="md:col-span-2">
                <Textarea
                  id="question"
                  name="question"
                  rows={3}
                  maxLength={280}
                  placeholder={copy.needPlaceholder}
                  required
                />
              </Field>
              <Field label={copy.budget} htmlFor="budget">
                <Input
                  id="budget"
                  name="budget"
                  inputMode="numeric"
                  placeholder={copy.budgetPlaceholder}
                />
              </Field>
              <Field label={copy.occasion} htmlFor="occasion">
                <Select
                  id="occasion"
                  name="occasion"
                  placeholder={copy.occasionAny}
                  defaultValue=""
                  options={occasionOptions(locale, t.social.occasions)}
                />
              </Field>
            </>
          )}
        </div>

        <div className="hairline grid grid-cols-1 gap-5 pt-6 md:max-w-3xl md:grid-cols-2">
          {network.error ? (
            <Notice tone="warning" className="md:col-span-2">
              {copy.errors.people}
            </Notice>
          ) : null}
          <Field label={copy.sendTo} htmlFor="toUserId">
            <Select
              id="toUserId"
              name="toUserId"
              defaultValue=""
              options={peopleOptions}
              placeholder={peopleOptions.length ? copy.choosePerson : copy.noPeople}
              disabled={peopleOptions.length === 0}
            />
          </Field>
          <Field label={copy.orHandle} htmlFor="toHandle" hint={copy.handleHint}>
            <Input
              id="toHandle"
              name="toHandle"
              placeholder="@alice"
              maxLength={40}
              defaultValue={first(query.handle) ?? ''}
            />
          </Field>
        </div>

        <div>
          <Button type="submit" size="lg" disabled={kind === 'choose' && options.length === 0}>
            {t.common.send}
          </Button>
        </div>
      </InstantForm>

      {recentAsks.length > 0 ? (
        <Section title={copy.yourAsks}>
          <ul className="flex flex-col divide-y divide-line">
            {recentAsks.map((ask) => (
              <li key={ask.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{ask.question}</p>
                  <p className="text-[12px] text-muted">
                    {ask.kind === 'choose' ? t.social.ask.whichOne : t.social.ask.styleMe} ·{' '}
                    {formatRelative(ask.createdAt, locale)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Tag tone={ask.status === 'answered' ? 'ink' : 'outline'}>
                    {ask.status === 'answered'
                      ? t.social.ask.status.answered
                      : ask.status === 'open'
                        ? t.social.ask.status.open
                        : t.social.ask.status.closed}
                  </Tag>
                  <Button href={`/asks/${ask.id}`} variant="link">
                    {t.common.open}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Container>
  )
}
