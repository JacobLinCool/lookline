import { after } from 'next/server'
import { EditionCanvas } from '@/components/looks/edition-canvas'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MessageCircle, Sparkles, Users } from 'lucide-react'
import {
  and,
  asc,
  brands,
  count,
  eq,
  interactions,
  lookParticipants,
  lookProducts,
  looks,
  products,
  users,
  type Look,
} from '@lookline/db'
import { recordInteraction } from '@lookline/engine'
import { Flash } from '@/components/looks/flash'
import { LookProductStrip, type LookStripProduct } from '@/components/looks/look-product-strip'
import { ShareButton } from '@/components/looks/share-button'
import { ReactionButton } from '@/components/looks/reaction-button'
import { previewHref } from '@/components/looks/preview-url'
import { Avatar, Button, Container, Field, Section, Select } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import type { Messages } from '@/i18n'
import { setLookVisibilityAction } from '@/server/actions/looks'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative } from '@/server/format'
import { presetOptions } from '@/server/looks'

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

const visibilityOptions = (t: Messages) => [
  { value: 'private', label: t.looks.visibility.private },
  { value: 'link', label: t.looks.visibility.link },
  { value: 'public', label: t.looks.visibility.public },
]

async function loadLook(id: string) {
  const [row] = await getDb()
    .db.select({ look: looks, owner: users })
    .from(looks)
    .innerJoin(users, eq(looks.ownerId, users.id))
    .where(eq(looks.id, id))
    .limit(1)
  return row ?? null
}

function canView(look: Look, viewerId: string | null): boolean {
  if (viewerId && viewerId === look.ownerId) return true
  return look.visibility !== 'private'
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const [{ t }, row, viewer] = await Promise.all([getI18n(), loadLook(id), getSessionUser()])
  if (!row || !canView(row.look, viewer?.id ?? null)) return { title: t.looks.detail.metaTitle }
  return {
    title: row.look.title,
    description: t.looks.detail.metaDescription(row.owner.displayName),
  }
}

export default async function LookPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const [{ id }, query, viewer, { t, locale }] = await Promise.all([
    params,
    searchParams,
    getSessionUser(),
    getI18n(),
  ])
  const row = await loadLook(id)
  if (!row) notFound()
  const { look, owner } = row
  const viewerId = viewer?.id ?? null
  if (!canView(look, viewerId)) notFound()
  const isOwner = viewerId === look.ownerId
  const { db } = getDb()

  const [items, parentRows, participantRows, reactionRows, myReaction, childRows] =
    await Promise.all([
      db
        .select({ product: products, brandName: brands.name, role: lookProducts.role })
        .from(lookProducts)
        .innerJoin(products, eq(lookProducts.productId, products.id))
        .innerJoin(brands, eq(products.brandId, brands.id))
        .where(eq(lookProducts.lookId, look.id))
        .orderBy(asc(lookProducts.position)),
      look.parentLookId
        ? db
            .select({ id: looks.id, title: looks.title, handle: users.handle })
            .from(looks)
            .innerJoin(users, eq(looks.ownerId, users.id))
            .where(eq(looks.id, look.parentLookId))
            .limit(1)
        : Promise.resolve([]),
      db
        .select({ id: users.id, handle: users.handle, displayName: users.displayName })
        .from(lookParticipants)
        .innerJoin(users, eq(lookParticipants.userId, users.id))
        .where(eq(lookParticipants.lookId, look.id)),
      isOwner
        ? db
            .select({ n: count() })
            .from(interactions)
            .where(and(eq(interactions.lookId, look.id), eq(interactions.type, 'REACT')))
        : Promise.resolve([]),
      viewerId && !isOwner
        ? db
            .select({ id: interactions.id })
            .from(interactions)
            .where(
              and(
                eq(interactions.actorUserId, viewerId),
                eq(interactions.lookId, look.id),
                eq(interactions.type, 'REACT'),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
      db.select({ n: count() }).from(looks).where(eq(looks.parentLookId, look.id)),
    ])

  // Signed-in visitors leave a VIEW edge (the lineage's "reach"); never block the page on it.
  if (viewer && !isOwner) {
    after(async () => {
      try {
        await recordInteraction(db, {
          actorUserId: viewer.id,
          type: 'VIEW',
          lookId: look.id,
          targetUserId: look.ownerId,
        })
      } catch (error) {
        console.warn(`[looks] VIEW interaction skipped for ${look.id}`, error)
      }
    })
  }

  const strip: LookStripProduct[] = items.map(({ product, brandName, role }) => ({
    product: { ...product, brandName },
    role,
  }))
  const parent = parentRows[0] ?? null
  const participants = participantRows.filter((p) => p.id !== look.ownerId)
  const reactions = Number(reactionRows[0]?.n ?? 0)
  const hasReacted = myReaction.length > 0
  const travelled = parent !== null || Number(childRows[0]?.n ?? 0) > 0
  const presets = presetOptions(locale)

  return (
    <Container className="pb-16">
      <Flash notice={query.notice} error={query.error} className="pt-6" />

      <div className="grid gap-6 pt-4 md:pt-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <EditionCanvas
            title={look.title}
            isOwner={isOwner}
            stylePreset={look.stylePreset}
            presets={presets}
            initial={{
              id: look.id,
              status: look.imageStatus,
              provider: look.imageProvider,
              generationId: look.imageGenerationId,
              startedAt: look.imageStartedAt?.toISOString() ?? null,
              error: look.imageError,
              imageUrl: `/api/looks/${look.id}/image?v=${encodeURIComponent(look.imagePath ?? 'composition')}`,
            }}
          />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <div className="flex flex-col gap-3">
            <h1 className="display text-[28px] md:text-[34px]">{look.title}</h1>
            <div className="flex items-center gap-3">
              <Avatar seed={owner.avatarSeed} name={owner.displayName} size="md" />
              <div className="flex flex-col leading-tight">
                <span className="text-[14px] font-medium">{owner.displayName}</span>
                <span className="text-[12px] text-muted">
                  @{owner.handle} · {formatRelative(look.createdAt, locale)}
                </span>
              </div>
            </div>
            {parent ? (
              <p className="text-[13px] text-muted">
                {t.looks.detail.inspiredBy}{' '}
                <Link
                  href={`/looks/${parent.id}`}
                  className="text-ink underline underline-offset-4"
                >
                  {parent.title}
                </Link>{' '}
                · @{parent.handle}
              </p>
            ) : null}
            {participants.length > 0 ? (
              <p className="text-[13px] text-muted">
                {t.looks.detail.madeWith(participants.map((p) => p.displayName))}
              </p>
            ) : null}
            {isOwner && owner.photoPath ? (
              <div className="mt-1 flex items-center gap-3 rounded-sm border border-line bg-card p-2.5">
                <img
                  src="/api/me/photo"
                  alt="Saved reference photo"
                  className="h-14 w-11 shrink-0 rounded-xs object-cover"
                />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium">Reference photo</p>
                  <p className="text-[12px] leading-snug text-muted">
                    Your current saved photo will guide the next render.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            {isOwner ? (
              <Button href={`/looks/${look.id}/remix`} size="lg" full icon={<Sparkles />}>
                {t.looks.detail.makeItMine}
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button href={previewHref({ sourceLookId: look.id })} size="lg" full>
                  {t.previews.actions.previewOnMe}
                </Button>
                <Button
                  href={`/looks/${look.id}/remix`}
                  size="lg"
                  full
                  variant="secondary"
                  icon={<Sparkles />}
                >
                  {t.looks.detail.makeItMine}
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                href={`/asks/new?look=${look.id}`}
                variant="secondary"
                icon={<MessageCircle />}
              >
                {t.looks.detail.askAFriend}
              </Button>
              <ShareButton lookId={look.id} sharePath={`/l/${look.shareToken}`} full />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                href={`/looks/${look.id}/together`}
                variant="ghost"
                size="sm"
                icon={<Users />}
              >
                {t.looks.detail.together}
              </Button>
              {viewer && !isOwner ? (
                <ReactionButton lookId={look.id} initiallyReacted={hasReacted} />
              ) : isOwner && reactions > 0 ? (
                <span className="text-[12px] text-muted">{t.looks.detail.liked(reactions)}</span>
              ) : null}
            </div>
          </div>

          {isOwner ? (
            <form action={setLookVisibilityAction} className="hairline flex items-end gap-2 pt-5">
              <input type="hidden" name="lookId" value={look.id} />
              <Field label={t.looks.detail.visibility} htmlFor="visibility" className="flex-1">
                <Select
                  id="visibility"
                  name="visibility"
                  defaultValue={look.visibility}
                  options={visibilityOptions(t)}
                />
              </Field>
              <Button type="submit" variant="ghost">
                {t.looks.update}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <Section title={t.looks.detail.pieces}>
        <LookProductStrip lookId={look.id} items={strip} redirectTo={`/looks/${look.id}`} />
      </Section>

      {travelled ? (
        <p className="text-[13px]">
          <Link
            href={`/looks/${look.id}/lineage`}
            className="text-muted underline decoration-line underline-offset-4 hover:text-ink"
          >
            {t.looks.detail.travelled}
          </Link>
        </p>
      ) : null}
    </Container>
  )
}
