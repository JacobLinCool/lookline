import { InstantForm } from '@/components/latency/instant-form'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { searchProducts } from '@lookline/engine'
import {
  Avatar,
  Button,
  Container,
  Field,
  Input,
  LookCard,
  Notice,
  Select,
  Tag,
  Textarea,
} from '@/components/ui'
import {
  attempt,
  first,
  loadAskByToken,
  occasionOptionLabel,
  presetOptions,
  type AskBundle,
  type AskResponseRow,
} from '@/components/social/data'

import { ProductLine, ProductOption } from '@/components/social/product-option'
import { getI18n } from '@/i18n/server'
import { answerAskAction, answerStyleMeAction } from '@/server/actions/asks'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative, formatTwd } from '@/server/format'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.social.askCard.metaTitle }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const LETTERS = ['A', 'B', 'C', 'D']

const ERRORS: Record<string, string> = {
  choice: 'Pick one option, then send.',
  picks: 'Pick at least one piece, then send.',
  name: 'Add your name so they know who answered.',
}

function tally(bundle: AskBundle): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { response } of bundle.responses) {
    if (response.choiceArticleId) {
      counts.set(response.choiceArticleId, (counts.get(response.choiceArticleId) ?? 0) + 1)
    }
  }
  return counts
}

async function ThankYou({
  bundle,
  mine,
  lookError,
}: {
  bundle: AskBundle
  mine: AskResponseRow
  lookError: string | undefined
}) {
  const { t, locale } = await getI18n()
  const copy = t.social.askCard
  const { ask, asker, options } = bundle
  const chosen = options.find((p) => p.id === mine.response.choiceArticleId)
  const counts = tally(bundle)
  const name = mine.responder?.displayName ?? mine.response.responderName ?? copy.you
  return (
    <div className="flex flex-col gap-6">
      <Notice tone="success" title={copy.sentTo(asker.displayName)} />
      {lookError ? <Notice tone="warning">{copy.lookFailed}</Notice> : null}
      <div className="hairline flex flex-col gap-4 pt-5">
        <div className="flex items-center gap-3">
          <Avatar seed={mine.responder?.avatarSeed ?? 0} name={name} size="sm" />
          <p className="text-[14px]">
            <span className="font-medium">{name}</span>{' '}
            <span className="text-muted">· {formatRelative(mine.response.createdAt, locale)}</span>
          </p>
          {chosen ? (
            <Tag tone="ink" size="md" className="ml-auto">
              {LETTERS[options.indexOf(chosen)] ?? copy.pick}
            </Tag>
          ) : null}
        </div>
        {chosen ? <ProductLine product={chosen} /> : null}
        {mine.styledLook ? (
          <div className="max-w-56">
            <LookCard
              look={mine.styledLook}
              owner={asker}
              hideOwner
              href={`/l/${encodeURIComponent(mine.styledLook.shareToken)}`}
              lineage={t.social.ask.styledBy(name)}
            />
          </div>
        ) : null}
        {mine.response.comment ? (
          <p className="whitespace-pre-line text-[14px]">{mine.response.comment}</p>
        ) : null}
        {ask.kind === 'choose' && options.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {options.map((p, i) => (
              <li key={p.id}>
                <Tag tone="outline">
                  {LETTERS[i]} · {counts.get(p.id) ?? 0}
                </Tag>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button href="/asks/new" variant="secondary">
          {copy.askYourself}
        </Button>
        {bundle.look ? (
          <Button href={`/l/${encodeURIComponent(bundle.look.shareToken)}`} variant="ghost">
            {copy.seeLook}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default async function AskCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: SearchParams
}) {
  const [{ token }, query, { t, locale }] = await Promise.all([params, searchParams, getI18n()])
  const copy = t.social.askCard
  const bundle = await loadAskByToken(token)
  if (!bundle) notFound()
  const { ask, asker, options } = bundle

  const viewer = await getSessionUser()
  if (viewer?.id === asker.id) redirect(`/asks/${ask.id}`)

  const answeredId = first(query.answered)
  const mine =
    bundle.responses.find((r) => r.response.id === answeredId) ??
    (viewer ? bundle.responses.find((r) => r.response.responderUserId === viewer.id) : undefined)
  const error = first(query.error)
  const errors: Record<string, string | undefined> = {
    choice: copy.errors.choice,
    picks: copy.errors.picks,
    name: copy.errors.name,
  }
  const lookError = first(query.lookError)

  const isStyle = ask.kind === 'style_me'
  const brief = copy.brief(
    ask.occasion ? occasionOptionLabel(locale, ask.occasion, t.social.occasions) : null,
    ask.budget ? formatTwd(ask.budget) : null,
  )

  // style_me: the responder searches the catalog through Engine 02's searchProducts.
  const q = first(query.q)?.trim() ?? ''
  const budgetParam = first(query.budget)?.trim() ?? (ask.budget ? String(ask.budget) : '')
  const budget = Number(budgetParam)
  const search =
    isStyle && !mine && q
      ? await attempt(() =>
          searchProducts(getDb().db, {
            q,
            priceMax: Number.isInteger(budget) && budget > 0 ? budget : undefined,
            pageSize: 12,
            sort: 'relevance',
          }),
        )
      : null

  const nameField = !viewer ? (
    <Field label={t.social.guest.name} htmlFor="displayName">
      <Input
        id="displayName"
        name="displayName"
        placeholder={t.social.guest.namePlaceholder}
        maxLength={40}
        autoComplete="name"
        required
      />
    </Field>
  ) : null

  return (
    <Container size="narrow" className="pb-24">
      <header className="flex flex-col gap-3 pt-8 pb-6 md:pt-10">
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Avatar seed={asker.avatarSeed} name={asker.displayName} size={22} />
          <span>
            <span className="text-ink">
              {copy.asksLine(asker.displayName, bundle.target?.displayName ?? null)}
            </span>{' '}
            · {formatRelative(ask.createdAt, locale)}
          </span>
        </p>
        <h1 className="display text-3xl md:text-5xl">“{ask.question}”</h1>
        {isStyle && brief ? <p className="text-[14px] text-muted">{brief}</p> : null}
      </header>

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

      {mine ? (
        <ThankYou bundle={bundle} mine={mine} lookError={lookError} />
      ) : isStyle ? (
        <div className="flex flex-col gap-8">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={copy.searchCatalog} htmlFor="q" className="flex-1">
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder={copy.searchPlaceholder}
                maxLength={120}
              />
            </Field>
            <Field label={copy.maxPrice} htmlFor="budget" className="sm:w-36">
              <Input
                id="budget"
                name="budget"
                inputMode="numeric"
                defaultValue={budgetParam}
                placeholder={ask.budget ? String(ask.budget) : copy.anyPrice}
              />
            </Field>
            <Button type="submit" variant="secondary">
              {copy.search}
            </Button>
          </form>

          <form action={answerStyleMeAction} className="flex flex-col gap-8">
            <input type="hidden" name="token" value={token} />
            {search && !search.ok ? <Notice tone="warning">{copy.searchFailed}</Notice> : null}
            {search?.ok && search.value.items.length === 0 ? (
              <Notice tone="info">{copy.noMatch(q)}</Notice>
            ) : null}
            {search?.ok && search.value.items.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-muted">{copy.pickUpTo}</p>
                <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {search.value.items.map((product) => (
                    <li key={product.id}>
                      <ProductOption product={product} name="articleId" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="hairline grid grid-cols-1 gap-5 pt-6 md:grid-cols-2">
              {presetOptions(locale).length > 0 ? (
                <Field label={copy.stylePreset} htmlFor="stylePreset">
                  <Select id="stylePreset" name="stylePreset" options={presetOptions(locale)} />
                </Field>
              ) : null}
              {nameField}
              <Field label={copy.comment} htmlFor="comment" className="md:col-span-2">
                <Textarea
                  id="comment"
                  name="comment"
                  rows={2}
                  maxLength={500}
                  placeholder={copy.commentPlaceholderStyle}
                />
              </Field>
            </div>
            <div>
              <Button type="submit" size="lg">
                {copy.sendLook}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <InstantForm
          name="ask"
          confirmation={t.social.ask.sending}
          action={answerAskAction}
          className="flex flex-col gap-8"
        >
          <input type="hidden" name="token" value={token} />
          {options.length === 0 ? (
            <Notice tone="info">{copy.noPieces}</Notice>
          ) : (
            <ul
              className={
                options.length <= 2
                  ? 'grid grid-cols-2 gap-4'
                  : 'grid grid-cols-2 gap-4 md:grid-cols-4'
              }
            >
              {options.map((product, i) => (
                <li key={product.id}>
                  <ProductOption
                    product={product}
                    name="choiceArticleId"
                    kind="radio"
                    badge={LETTERS[i]}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {nameField}
            <Field
              label={copy.comment}
              htmlFor="comment"
              className={viewer ? 'md:col-span-2' : undefined}
            >
              <Textarea
                id="comment"
                name="comment"
                rows={2}
                maxLength={500}
                placeholder={copy.commentPlaceholder}
              />
            </Field>
          </div>
          <div>
            <Button type="submit" size="lg">
              {copy.sendPick}
            </Button>
          </div>
        </InstantForm>
      )}
    </Container>
  )
}
