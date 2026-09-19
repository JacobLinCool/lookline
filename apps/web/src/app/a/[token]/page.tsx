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
  presetOptions,
  type AskBundle,
  type AskResponseRow,
} from '@/components/social/data'

import { ProductLine, ProductOption } from '@/components/social/product-option'
import { answerAskAction, answerStyleMeAction } from '@/server/actions/asks'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative, formatTwd } from '@/server/format'

export const metadata: Metadata = { title: 'Ask' }

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

function ThankYou({
  bundle,
  mine,
  lookError,
}: {
  bundle: AskBundle
  mine: AskResponseRow
  lookError: string | undefined
}) {
  const { ask, asker, options } = bundle
  const chosen = options.find((p) => p.id === mine.response.choiceArticleId)
  const counts = tally(bundle)
  const name = mine.responder?.displayName ?? mine.response.responderName ?? 'You'
  return (
    <div className="flex flex-col gap-6">
      <Notice tone="success" title={`Sent to ${asker.displayName}.`} />
      {lookError ? (
        <Notice tone="warning">
          Your picks were sent as a message; the Look could not be made.
        </Notice>
      ) : null}
      <div className="hairline flex flex-col gap-4 pt-5">
        <div className="flex items-center gap-3">
          <Avatar seed={mine.responder?.avatarSeed ?? 0} name={name} size="sm" />
          <p className="text-[14px]">
            <span className="font-medium">{name}</span>{' '}
            <span className="text-muted">· {formatRelative(mine.response.createdAt)}</span>
          </p>
          {chosen ? (
            <Tag tone="ink" size="md" className="ml-auto">
              {LETTERS[options.indexOf(chosen)] ?? 'Pick'}
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
              lineage={`Styled by ${name}`}
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
          Ask a friend yourself
        </Button>
        {bundle.look ? (
          <Button href={`/l/${encodeURIComponent(bundle.look.shareToken)}`} variant="ghost">
            See the Look
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
  const [{ token }, query] = await Promise.all([params, searchParams])
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
  const lookError = first(query.lookError)

  const isStyle = ask.kind === 'style_me'
  const brief = [
    ask.occasion ? `For ${ask.occasion}` : null,
    ask.budget ? `under ${formatTwd(ask.budget)}` : null,
  ]
    .filter(Boolean)
    .join(', ')

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
    <Field label="Your name" htmlFor="displayName">
      <Input
        id="displayName"
        name="displayName"
        placeholder="Alice / 小美"
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
            <span className="text-ink">{asker.displayName}</span> asks
            {bundle.target ? ` ${bundle.target.displayName}` : ''} · {formatRelative(ask.createdAt)}
          </span>
        </p>
        <h1 className="display text-3xl md:text-5xl">“{ask.question}”</h1>
        {isStyle && brief ? <p className="text-[14px] text-muted">{brief}</p> : null}
      </header>

      {error && ERRORS[error] ? (
        <Notice tone="error" className="mb-6">
          {ERRORS[error]}
        </Notice>
      ) : null}
      {error === 'engine' ? (
        <Notice tone="warning" className="mb-6">
          The answer could not be sent. Send it again.
        </Notice>
      ) : null}

      {mine ? (
        <ThankYou bundle={bundle} mine={mine} lookError={lookError} />
      ) : isStyle ? (
        <div className="flex flex-col gap-8">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Search the catalog" htmlFor="q" className="flex-1">
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="linen shirt, 黑色寬褲, quiet luxury…"
                maxLength={120}
              />
            </Field>
            <Field label="Max price" htmlFor="budget" className="sm:w-36">
              <Input
                id="budget"
                name="budget"
                inputMode="numeric"
                defaultValue={budgetParam}
                placeholder={ask.budget ? String(ask.budget) : 'Any'}
              />
            </Field>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <form action={answerStyleMeAction} className="flex flex-col gap-8">
            <input type="hidden" name="token" value={token} />
            {search && !search.ok ? (
              <Notice tone="warning">Products could not be loaded. Search again.</Notice>
            ) : null}
            {search?.ok && search.value.items.length === 0 ? (
              <Notice tone="info">
                Nothing matched “{q}”. Try another word or a higher price.
              </Notice>
            ) : null}
            {search?.ok && search.value.items.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-muted">Pick up to 4</p>
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
              {presetOptions().length > 0 ? (
                <Field label="Style of the Look" htmlFor="stylePreset">
                  <Select id="stylePreset" name="stylePreset" options={presetOptions()} />
                </Field>
              ) : null}
              {nameField}
              <Field label="A word for them (optional)" htmlFor="comment" className="md:col-span-2">
                <Textarea
                  id="comment"
                  name="comment"
                  rows={2}
                  maxLength={500}
                  placeholder="Why these pieces…"
                />
              </Field>
            </div>
            <div>
              <Button type="submit" size="lg">
                Send this Look
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <InstantForm
          name="ask"
          confirmation="Sending"
          action={answerAskAction}
          className="flex flex-col gap-8"
        >
          <input type="hidden" name="token" value={token} />
          {options.length === 0 ? (
            <Notice tone="info">This Ask has no pieces attached.</Notice>
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
              label="A word for them (optional)"
              htmlFor="comment"
              className={viewer ? 'md:col-span-2' : undefined}
            >
              <Textarea
                id="comment"
                name="comment"
                rows={2}
                maxLength={500}
                placeholder="The cut suits you better… / 這件比較顯瘦"
              />
            </Field>
          </div>
          <div>
            <Button type="submit" size="lg">
              Send my pick
            </Button>
          </div>
        </InstantForm>
      )}
    </Container>
  )
}
