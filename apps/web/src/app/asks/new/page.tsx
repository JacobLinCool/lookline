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
  OCCASION_OPTIONS,
  parseIdList,
  type ShopProduct,
} from '@/components/social/data'

import { GuestGate } from '@/components/social/guest-gate'
import { ProductOption } from '@/components/social/product-option'
import { createAskAction } from '@/server/actions/asks'
import { getSessionUser } from '@/server/auth'
import { getBag } from '@/server/bag'
import { formatRelative } from '@/server/format'

export const metadata: Metadata = { title: 'Ask a friend' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const ERRORS: Record<string, string> = {
  options: 'Choose two to four pieces.',
  handle: 'No one has that handle. Leave it empty to share by link.',
}

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
  const query = await searchParams
  const kind = first(query.kind) === 'style_me' ? 'style_me' : 'choose'
  const lookId = first(query.look)
  const currentPath = buildPath(query, kind)

  const viewer = await getSessionUser()
  if (!viewer) {
    return (
      <Container size="narrow" className="pb-24">
        <PageHeader title="Ask a friend" />
        <GuestGate
          next={currentPath}
          title="Your name"
          description="Answers come back to this name. No account needed."
          cta="Continue"
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
  const peopleOptions = network.people.map((p) => ({
    value: p.id,
    label: `${p.displayName} · @${p.handle}`,
  }))

  return (
    <Container className="pb-24">
      <PageHeader
        title="Ask a friend"
        description={look ? `From “${look.look.title}” by ${look.owner.displayName}` : undefined}
        actions={
          <>
            <Button
              href={buildPath(query, 'choose')}
              variant={kind === 'choose' ? 'primary' : 'secondary'}
              size="sm"
            >
              Which one?
            </Button>
            <Button
              href={buildPath(query, 'style_me')}
              variant={kind === 'style_me' ? 'primary' : 'secondary'}
              size="sm"
            >
              Style me
            </Button>
          </>
        }
      />

      {error && ERRORS[error] ? (
        <Notice tone="error" className="mb-6">
          {ERRORS[error]}
        </Notice>
      ) : null}
      {error === 'engine' ? (
        <Notice tone="warning" className="mb-6">
          The Ask could not be sent. Check the pieces and send again.
        </Notice>
      ) : null}

      <InstantForm
        name="ask"
        confirmation="Sending"
        action={createAskAction}
        className="flex flex-col gap-8"
      >
        <input type="hidden" name="kind" value={kind} />
        {lookId ? <input type="hidden" name="lookId" value={lookId} /> : null}

        {kind === 'choose' ? (
          <Section title="Pieces" description="Two to four" rule={false} className="py-0 md:py-0">
            {options.length === 0 ? (
              <EmptyState
                title="No pieces to ask about yet."
                action={
                  <Button href="/shop" variant="secondary">
                    Browse the Shop
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
            <Field label="Question" htmlFor="question" className="md:col-span-2">
              <Input id="question" name="question" defaultValue="Which one?" maxLength={280} />
            </Field>
          ) : (
            <>
              <Field label="What you need" htmlFor="question" className="md:col-span-2">
                <Textarea
                  id="question"
                  name="question"
                  rows={3}
                  maxLength={280}
                  placeholder="A friend's wedding in Tainan, light, not too formal / 幫我配一套去墾丁的穿搭"
                  required
                />
              </Field>
              <Field label="Budget (optional)" htmlFor="budget">
                <Input id="budget" name="budget" inputMode="numeric" placeholder="NT$3,000" />
              </Field>
              <Field label="Occasion (optional)" htmlFor="occasion">
                <Select id="occasion" name="occasion" placeholder="Any" defaultValue="">
                  {OCCASION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </div>

        <div className="hairline grid grid-cols-1 gap-5 pt-6 md:max-w-3xl md:grid-cols-2">
          {network.error ? (
            <Notice tone="warning" className="md:col-span-2">
              Your people could not be loaded. Send by handle or by link.
            </Notice>
          ) : null}
          <Field label="Send to" htmlFor="toUserId">
            <Select
              id="toUserId"
              name="toUserId"
              defaultValue=""
              options={peopleOptions}
              placeholder={peopleOptions.length ? 'Choose a person' : 'No one yet'}
              disabled={peopleOptions.length === 0}
            />
          </Field>
          <Field label="or a handle" htmlFor="toHandle" hint="Leave both empty to share by link.">
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
            Send
          </Button>
        </div>
      </InstantForm>

      {recentAsks.length > 0 ? (
        <Section title="Your asks">
          <ul className="flex flex-col divide-y divide-line">
            {recentAsks.map((ask) => (
              <li key={ask.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{ask.question}</p>
                  <p className="text-[12px] text-muted">
                    {ask.kind === 'choose' ? 'Which one?' : 'Style me'} ·{' '}
                    {formatRelative(ask.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Tag tone={ask.status === 'answered' ? 'ink' : 'outline'}>
                    {ask.status === 'answered'
                      ? 'Answered'
                      : ask.status === 'open'
                        ? 'Open'
                        : 'Closed'}
                  </Tag>
                  <Button href={`/asks/${ask.id}`} variant="link">
                    Open
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
