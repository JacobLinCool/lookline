import { InstantForm } from '@/components/latency/instant-form'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import {
  Avatar,
  Button,
  Container,
  EmptyState,
  LookCard,
  Notice,
  PageHeader,
  Section,
  Tag,
} from '@/components/ui'
import { first, loadAskById, occasionOptionLabel } from '@/components/social/data'
import { ProductLine, ProductOption } from '@/components/social/product-option'
import { ShareLink } from '@/components/social/share-link'
import { getI18n } from '@/i18n/server'
import { addToBagAction } from '@/server/actions/bag'
import { getSessionUser } from '@/server/auth'
import { formatRelative, formatTwd } from '@/server/format'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.social.askOwner.metaTitle }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const LETTERS = ['A', 'B', 'C', 'D']

/**
 * `/asks/[id]` — the asker's view: the link, the options with their tallies, every answer so far.
 * Anyone else is sent to the card itself (/a/<token>).
 */
export default async function AskOwnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const [{ id }, query, { t, locale }] = await Promise.all([params, searchParams, getI18n()])
  const copy = t.social.askOwner
  const bundle = await loadAskById(id)
  if (!bundle) notFound()
  const { ask, asker, target, options, responses } = bundle

  const viewer = await getSessionUser()
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/asks/${id}`)}`)
  if (viewer.id !== asker.id) redirect(`/a/${encodeURIComponent(ask.shareToken)}`)

  const cardPath = `/a/${encodeURIComponent(ask.shareToken)}`
  const counts = new Map<string, number>()
  for (const { response } of responses) {
    if (response.choiceArticleId) {
      counts.set(response.choiceArticleId, (counts.get(response.choiceArticleId) ?? 0) + 1)
    }
  }
  const leader = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]
  const leading = leader ? options.find((p) => p.id === leader[0]) : undefined
  const isStyle = ask.kind === 'style_me'
  const status =
    ask.status === 'answered'
      ? t.social.ask.status.answered
      : ask.status === 'open'
        ? t.social.ask.status.open
        : t.social.ask.status.closed

  return (
    <Container className="pb-24">
      <PageHeader
        title={ask.question}
        description={`${target ? copy.sentTo(target.displayName) : copy.anyoneWithLink} · ${formatRelative(ask.createdAt, locale)}`}
        actions={
          <>
            <Tag tone={ask.status === 'answered' ? 'ink' : 'outline'} size="md">
              {status}
            </Tag>
            <Button href="/asks/new" variant="secondary" size="sm">
              {copy.newAsk}
            </Button>
          </>
        }
      />

      {first(query.bag) === '1' ? (
        <Notice
          tone="success"
          className="mb-6"
          action={
            <Button href="/bag" size="sm">
              {t.social.bag.open}
            </Button>
          }
        >
          {t.social.bag.added}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14">
        <div className="flex flex-col gap-6">
          <ShareLink path={cardPath} />
          {isStyle ? (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-muted">{copy.budget}</dt>
                <dd className="font-medium">
                  {ask.budget ? formatTwd(ask.budget) : copy.budgetOpen}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{copy.occasion}</dt>
                <dd className="font-medium">
                  {ask.occasion
                    ? occasionOptionLabel(locale, ask.occasion, t.social.occasions)
                    : copy.occasionAny}
                </dd>
              </div>
            </dl>
          ) : (
            <ul className="grid grid-cols-2 gap-4">
              {options.map((product, i) => {
                const n = counts.get(product.id) ?? 0
                const isLeader = leading?.id === product.id && n > 0
                return (
                  <li key={product.id}>
                    <ProductOption
                      product={product}
                      name="preview"
                      kind="radio"
                      badge={LETTERS[i]}
                      disabled
                      footer={
                        <Tag tone={isLeader ? 'accent' : 'outline'}>
                          {n === 0 ? copy.noPicks : copy.picked(n)}
                        </Tag>
                      }
                    />
                  </li>
                )
              })}
            </ul>
          )}
          <Button href={cardPath} variant="link" className="self-start">
            {copy.previewCard}
          </Button>
        </div>

        <div className="flex flex-col gap-6">
          <Section
            title={responses.length ? t.common.count.answers(responses.length) : copy.answers}
            rule={false}
            className="py-0 md:py-0"
          >
            {responses.length === 0 ? (
              <EmptyState title={copy.noAnswers} description={copy.noAnswersHint} />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {responses.map(({ response, responder, styledLook }) => {
                  const chosen = options.find((p) => p.id === response.choiceArticleId)
                  const name = responder?.displayName ?? response.responderName ?? copy.guest
                  return (
                    <li key={response.id} className="flex flex-col gap-3 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar seed={responder?.avatarSeed ?? 0} name={name} size="sm" />
                        <p className="min-w-0 flex-1 truncate text-[14px]">
                          <span className="font-medium">{name}</span>{' '}
                          <span className="text-muted">
                            {formatRelative(response.createdAt, locale)}
                          </span>
                        </p>
                        {chosen ? (
                          <Tag tone="ink" size="md">
                            {LETTERS[options.indexOf(chosen)]}
                          </Tag>
                        ) : null}
                      </div>
                      {styledLook ? (
                        <div className="max-w-56">
                          <LookCard
                            look={styledLook}
                            owner={asker}
                            hideOwner
                            lineage={t.social.ask.styledBy(name)}
                            href={`/looks/${styledLook.id}`}
                          />
                        </div>
                      ) : null}
                      {response.comment ? (
                        <p className="whitespace-pre-line text-[14px]">{response.comment}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {leading ? (
            <div className="hairline pt-5">
              <ProductLine
                product={leading}
                href={`/p/${leading.id}?ask=${encodeURIComponent(ask.id)}`}
                trailing={
                  <InstantForm
                    action={addToBagAction}
                    name="add-to-bag"
                    confirmation={t.social.bag.confirmation}
                  >
                    <input type="hidden" name="articleId" value={leading.id} />
                    <input type="hidden" name="redirect" value={`/asks/${ask.id}?bag=1`} />
                    <Button type="submit" variant="secondary" size="sm" icon={<ShoppingBag />}>
                      {t.social.bag.add}
                    </Button>
                  </InstantForm>
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </Container>
  )
}
