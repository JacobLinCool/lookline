import { InstantForm } from '@/components/latency/instant-form'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Heart, Sparkles } from 'lucide-react'
import { and, eq, interactions } from '@lookline/db'
import {
  Avatar,
  Button,
  Container,
  Field,
  Input,
  Notice,
  ProductCard,
  Rail,
  RailItem,
  Section,
} from '@/components/ui'
import { first, loadLookByToken, ensureInteraction, logInteraction } from '@/components/social/data'
import { ShareLink } from '@/components/social/share-link'
import { getI18n } from '@/i18n/server'
import { guestLoginAction } from '@/server/actions/auth'
import { addToBagAction } from '@/server/actions/bag'
import { reactToLookAction } from '@/server/actions/remix'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative } from '@/server/format'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.social.sharedLook.metaTitle }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * `/l/[token]` — a Look shared by link, the page a friend opens from a chat. Works without an
 * account: the first action asks for a name and creates a guest on the spot. Every visit by a
 * signed-in viewer logs a VIEW; arriving through `?via=<userId>`, `?from=<lookId>` or another Look
 * page logs one INSPIRE (viewer → owner) so propagation is attributable.
 */
export default async function SharedLookPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: SearchParams
}) {
  const [{ token }, query, { t, locale }] = await Promise.all([params, searchParams, getI18n()])
  const copy = t.social.sharedLook
  const bundle = await loadLookByToken(token)
  if (!bundle) notFound()
  const { look, owner, products } = bundle

  const viewer = await getSessionUser()
  const isOwner = viewer?.id === owner.id
  const path = `/l/${encodeURIComponent(token)}`
  const via = first(query.via)
  const from = first(query.from)
  const referer = (await headers()).get('referer') ?? ''
  const cameFromLook = /\/(looks|l)\//.test(referer)

  let alreadyReacted = false
  if (viewer && !isOwner) {
    const { db } = getDb()
    await logInteraction(db, {
      actorUserId: viewer.id,
      type: 'VIEW',
      targetUserId: owner.id,
      lookId: look.id,
      payload: { via: via ?? null, from: from ?? null, source: 'share-link' },
    })
    if (via || from || cameFromLook) {
      await ensureInteraction(db, {
        actorUserId: viewer.id,
        type: 'INSPIRE',
        targetUserId: owner.id,
        lookId: look.id,
        payload: { via: via ?? null, from: from ?? null, referer: cameFromLook ? 'look' : null },
      })
    }
    try {
      const rows = await db
        .select({ id: interactions.id })
        .from(interactions)
        .where(
          and(
            eq(interactions.actorUserId, viewer.id),
            eq(interactions.type, 'REACT'),
            eq(interactions.lookId, look.id),
          ),
        )
        .limit(1)
      alreadyReacted = rows.length > 0
    } catch {
      alreadyReacted = false
    }
  }

  const reacted = first(query.reacted) === '1' || alreadyReacted
  const error = first(query.error)
  const remixPath = `/looks/${look.id}/remix`
  const stylePath = `/looks/${look.id}/remix?for=${encodeURIComponent(owner.id)}`
  const askPath = `/asks/new?look=${encodeURIComponent(look.id)}`
  const firstName = owner.displayName.split(/\s+/)[0] ?? owner.displayName

  // Guests: one name field, three destinations. Each button carries its `next` in a closure so
  // the submit buttons need no name/value (React reserves those for the action id).
  async function guestTo(next: string, formData: FormData): Promise<void> {
    'use server'
    formData.set('next', next)
    return guestLoginAction(formData)
  }
  const guestRemix = guestTo.bind(null, remixPath)
  const guestAsk = guestTo.bind(null, askPath)
  const guestStyle = guestTo.bind(null, stylePath)

  const likeButton = (formAction?: (formData: FormData) => Promise<void>) => (
    <Button
      type="submit"
      formAction={formAction}
      variant="ghost"
      size="sm"
      icon={<Heart className={reacted ? 'fill-current' : undefined} />}
      disabled={reacted}
      className={reacted ? 'text-accent' : undefined}
    >
      {reacted ? copy.liked : copy.like}
    </Button>
  )

  return (
    <Container className="pb-16">
      <div className="grid gap-5 pt-4 md:grid-cols-12 md:gap-12 md:pt-8">
        <div className="md:col-span-7">
          <div className="overflow-hidden rounded-md bg-mist">
            <div className="aspect-3/4">
              <img
                src={`/api/looks/${look.id}/image?v=${encodeURIComponent(look.imagePath ?? 'composition')}`}
                alt={look.title}
                width={600}
                height={800}
                loading="eager"
                decoding="async"
                className="size-full object-cover"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 md:col-span-5">
          <div className="flex flex-col gap-3">
            <h1 className="display text-[28px] md:text-[34px]">{look.title}</h1>
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Avatar seed={owner.avatarSeed} name={owner.displayName} size="sm" />
              <span className="text-ink">{owner.displayName}</span>
              <span>· {formatRelative(look.createdAt, locale)}</span>
            </div>
          </div>

          {error === 'name' ? <Notice tone="error">{copy.nameError}</Notice> : null}
          {error === 'engine' ? <Notice tone="warning">{copy.likeError}</Notice> : null}
          {reacted && first(query.reacted) === '1' ? (
            <Notice tone="success">{copy.likeSaved(firstName)}</Notice>
          ) : null}

          {isOwner ? (
            <div className="flex flex-col gap-3">
              <ShareLink path={path} label={t.social.share.shareLink} />
              <Button href={`/looks/${look.id}`} variant="secondary">
                {copy.openLook}
              </Button>
            </div>
          ) : viewer ? (
            <div className="flex flex-col gap-2">
              <Button href={remixPath} size="lg" full icon={<Sparkles />}>
                {copy.makeItMine}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button href={askPath} variant="secondary">
                  {copy.askAboutPiece}
                </Button>
                <Button href={stylePath} variant="secondary">
                  {copy.stylePerson(firstName)}
                </Button>
              </div>
              <form action={reactToLookAction} className="flex">
                <input type="hidden" name="token" value={token} />
                {likeButton()}
              </form>
            </div>
          ) : (
            <form className="flex flex-col gap-3">
              <input type="hidden" name="token" value={token} />
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
              <Button type="submit" formAction={guestRemix} size="lg" full icon={<Sparkles />}>
                {copy.makeItMine}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="submit" formAction={guestAsk} variant="secondary">
                  {copy.askAboutPiece}
                </Button>
                <Button type="submit" formAction={guestStyle} variant="secondary">
                  {copy.stylePerson(firstName)}
                </Button>
              </div>
              <div className="flex">{likeButton(reactToLookAction)}</div>
            </form>
          )}
        </div>
      </div>

      <Section title={copy.inThisLook}>
        {products.length === 0 ? (
          <p className="text-[13px] text-muted">{copy.noPieces}</p>
        ) : (
          <Rail itemWidth="md">
            {products.map((product) => (
              <RailItem key={product.id} width="md">
                <ProductCard
                  product={product}
                  href={`/p/${product.id}?look=${encodeURIComponent(look.id)}&via=${encodeURIComponent(owner.id)}`}
                  footer={
                    <InstantForm
                      action={addToBagAction}
                      name="add-to-bag"
                      confirmation={t.social.bag.confirmation}
                      className="flex"
                    >
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="redirect" value={`${path}?bag=1`} />
                      <Button type="submit" variant="secondary" size="sm" full>
                        {t.social.bag.add}
                      </Button>
                    </InstantForm>
                  }
                />
              </RailItem>
            ))}
          </Rail>
        )}
        {first(query.bag) === '1' ? (
          <Notice
            tone="success"
            className="mt-6"
            action={
              <Button href="/bag" size="sm">
                {t.social.bag.open}
              </Button>
            }
          >
            {t.social.bag.added}
          </Notice>
        ) : null}
      </Section>
    </Container>
  )
}
