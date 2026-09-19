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
  lookArticles,
  looks,
  articles,
  users,
  type Look,
} from '@lookline/db'
import { STYLE_PRESETS, recordInteraction } from '@lookline/engine'
import { Flash } from '@/components/looks/flash'
import { LookProductStrip, type LookStripProduct } from '@/components/looks/look-product-strip'
import { ShareButton } from '@/components/looks/share-button'
import { ReactionButton } from '@/components/looks/reaction-button'
import { Avatar, Button, Container, Field, Section, Select } from '@/components/ui'
import { setLookVisibilityAction } from '@/server/actions/looks'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative } from '@/server/format'

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Only me' },
  { value: 'link', label: 'Anyone with the link' },
  { value: 'public', label: 'Everyone on Lookline' },
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
  const row = await loadLook(id)
  const viewer = await getSessionUser()
  if (!row || !canView(row.look, viewer?.id ?? null)) return { title: 'Look' }
  return { title: row.look.title, description: `A Look by ${row.owner.displayName}` }
}

export default async function LookPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const [{ id }, query, viewer] = await Promise.all([params, searchParams, getSessionUser()])
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
        .select({ product: articles, brandName: brands.name, role: lookArticles.role })
        .from(lookArticles)
        .innerJoin(articles, eq(lookArticles.articleId, articles.id))
        .innerJoin(brands, eq(articles.brandId, brands.id))
        .where(eq(lookArticles.lookId, look.id))
        .orderBy(asc(lookArticles.position)),
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
  const presetOptions = STYLE_PRESETS.map((p) => ({ value: p.slug, label: p.name }))

  return (
    <Container className="pb-16">
      <Flash notice={query.notice} error={query.error} className="pt-6" />

      <div className="grid gap-6 pt-4 md:pt-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <EditionCanvas
            title={look.title}
            isOwner={isOwner}
            stylePreset={look.stylePreset}
            presets={presetOptions}
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
                  @{owner.handle} · {formatRelative(look.createdAt)}
                </span>
              </div>
            </div>
            {parent ? (
              <p className="text-[13px] text-muted">
                Inspired by{' '}
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
                Made with {participants.map((p) => p.displayName).join(', ')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Button href={`/looks/${look.id}/remix`} size="lg" full icon={<Sparkles />}>
              Make it mine
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                href={`/asks/new?look=${look.id}`}
                variant="secondary"
                icon={<MessageCircle />}
              >
                Ask a friend
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
                Together
              </Button>
              {viewer && !isOwner ? (
                <ReactionButton lookId={look.id} initiallyReacted={hasReacted} />
              ) : isOwner && reactions > 0 ? (
                <span className="text-[12px] text-muted">
                  {reactions === 1 ? '1 person liked this' : `${reactions} people liked this`}
                </span>
              ) : null}
            </div>
          </div>

          {isOwner ? (
            <form action={setLookVisibilityAction} className="hairline flex items-end gap-2 pt-5">
              <input type="hidden" name="lookId" value={look.id} />
              <Field label="Who can see this" htmlFor="visibility" className="flex-1">
                <Select
                  id="visibility"
                  name="visibility"
                  defaultValue={look.visibility}
                  options={VISIBILITY_OPTIONS}
                />
              </Field>
              <Button type="submit" variant="ghost">
                Update
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <Section title="In this Look">
        <LookProductStrip lookId={look.id} items={strip} redirectTo={`/looks/${look.id}`} />
      </Section>

      {travelled ? (
        <p className="text-[13px]">
          <Link
            href={`/looks/${look.id}/lineage`}
            className="text-muted underline decoration-line underline-offset-4 hover:text-ink"
          >
            See where this Look travelled
          </Link>
        </p>
      ) : null}
    </Container>
  )
}
