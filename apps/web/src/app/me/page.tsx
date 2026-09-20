import type { Metadata } from 'next'
import Link from 'next/link'
import {
  and,
  brands,
  count,
  desc,
  eq,
  gt,
  inArray,
  lookParticipants,
  lookArticles,
  looks,
  or,
  articles,
  purchases,
  previews,
  cardCopies,
  cards as cardsTable,
  collectionEditions,
  collections as collectionsTable,
  personas as personasTable,
  users,
} from '@lookline/db'
import { creditBalance, getPreferenceProfile, getUserNetwork, tierForRatio } from '@lookline/engine'
import { Avatar, Button, Container, Notice, Section } from '@/components/ui'
import { Circle } from '@/components/me/circle'
import { EditionsGrid, type EditionItem } from '@/components/me/editions'
import { ProfileCard } from '@/components/me/profile-card'
import { PreviewGrid } from '@/components/me/previews'
import { SavedPhotoForm } from '@/components/me/saved-photo-form'
import { CardLibrary, type LibraryCard } from '@/components/cards/card-library'
import { Wardrobe, type WardrobeRow } from '@/components/me/wardrobe'
import { callEngine } from '@/components/trends/engine-guard'
import { getI18n } from '@/i18n/server'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { isEngineView } from '@/server/engine-view'
import { formatRelative } from '@/server/format'

/**
 * Every card this account holds, through the personas it manages. Copies are listed individually:
 * three copies of one edition are three holdings, and collapsing them by artwork would lose two.
 */
async function loadLibrary(userId: string): Promise<LibraryCard[]> {
  const { db } = getDb()
  const [own, copies] = await Promise.all([
    db
      .select({
        id: cardsTable.id,
        code: cardsTable.verificationCode,
        ownedRatio: cardsTable.ownedRatio,
        issuedAt: cardsTable.issuedAt,
        personaId: personasTable.id,
        personaName: personasTable.displayName,
        avatarSeed: personasTable.avatarSeed,
      })
      .from(cardsTable)
      .innerJoin(personasTable, eq(personasTable.id, cardsTable.personaId))
      .where(eq(personasTable.ownerUserId, userId)),
    db
      .select({
        id: cardCopies.id,
        code: cardCopies.verificationCode,
        editionId: cardCopies.editionId,
        editionNumber: cardCopies.editionNumber,
        editionSize: collectionEditions.editionSize,
        collectionTitle: collectionsTable.title,
        issuedAt: cardCopies.issuedAt,
        personaId: personasTable.id,
        personaName: personasTable.displayName,
        avatarSeed: personasTable.avatarSeed,
      })
      .from(cardCopies)
      .innerJoin(collectionEditions, eq(collectionEditions.id, cardCopies.editionId))
      .innerJoin(collectionsTable, eq(collectionsTable.id, collectionEditions.collectionId))
      .innerJoin(personasTable, eq(personasTable.id, cardCopies.beneficiaryPersonaId))
      .where(eq(personasTable.ownerUserId, userId)),
  ])
  return [
    ...own.map((c) => ({
      kind: 'card' as const,
      id: c.id,
      href: `/cards/${c.id}`,
      imageUrl: `/api/cards/${c.id}`,
      personaName: c.personaName,
      personaId: c.personaId,
      avatarSeed: c.avatarSeed,
      verificationCode: c.code,
      tierLabel: tierForRatio(c.ownedRatio).labelZh,
      editionNumber: null,
      editionSize: null,
      collectionTitle: null,
      issuedAt: c.issuedAt?.getTime() ?? 0,
    })),
    ...copies.map((c) => ({
      kind: 'copy' as const,
      id: c.id,
      href: `/editions/${c.editionId}`,
      // Each copy shows its own numbered print, the same picture its holder would share.
      imageUrl: `/api/editions/${c.editionId}?copy=${encodeURIComponent(c.code)}`,
      personaName: c.personaName,
      personaId: c.personaId,
      avatarSeed: c.avatarSeed,
      verificationCode: c.code,
      tierLabel: null,
      editionNumber: c.editionNumber,
      editionSize: c.editionSize,
      collectionTitle: c.collectionTitle,
      issuedAt: c.issuedAt?.getTime() ?? 0,
    })),
  ]
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.me.metaTitle }
}

const EDITIONS_LIMIT = 48
const WARDROBE_LIMIT = 60
const PREVIEWS_LIMIT = 12

/** Looks the user owns or took part in, newest first, with owner and lineage hint. */
async function loadEditions(userId: string, madeTogether: string): Promise<EditionItem[]> {
  const { db } = getDb()
  const participating = db
    .select({ lookId: lookParticipants.lookId })
    .from(lookParticipants)
    .where(eq(lookParticipants.userId, userId))
  const rows = await db
    .select({ look: looks, owner: users })
    .from(looks)
    .innerJoin(users, eq(looks.ownerId, users.id))
    .where(or(eq(looks.ownerId, userId), inArray(looks.id, participating)))
    .orderBy(desc(looks.createdAt))
    .limit(EDITIONS_LIMIT)
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.look.id)
  const parentIds = [...new Set(rows.map((r) => r.look.parentLookId).filter((id) => id !== null))]
  const [counts, parents] = await Promise.all([
    db
      .select({ lookId: lookArticles.lookId, n: count() })
      .from(lookArticles)
      .where(inArray(lookArticles.lookId, ids))
      .groupBy(lookArticles.lookId),
    parentIds.length > 0
      ? db
          .select({ id: looks.id, handle: users.handle })
          .from(looks)
          .innerJoin(users, eq(looks.ownerId, users.id))
          .where(inArray(looks.id, parentIds))
      : Promise.resolve([]),
  ])
  const countById = new Map(counts.map((c) => [c.lookId, Number(c.n)]))
  const parentHandle = new Map(parents.map((p) => [p.id, p.handle]))

  return rows.map(({ look, owner }) => {
    let lineage: EditionItem['lineage']
    const parent = look.parentLookId ? parentHandle.get(look.parentLookId) : undefined
    if (look.kind === 'remix' && parent) lineage = { kind: 'remix', handle: parent }
    else if (look.kind === 'together' && owner.id !== userId) {
      lineage = { kind: 'together', handle: owner.handle }
    } else if (look.kind === 'together') lineage = madeTogether
    else if (parent) lineage = { kind: 'inspired', handle: parent }
    return {
      look,
      owner: { displayName: owner.displayName, handle: owner.handle, avatarSeed: owner.avatarSeed },
      lineage,
      productCount: countById.get(look.id) ?? 0,
    }
  })
}

async function loadWardrobe(userId: string): Promise<WardrobeRow[]> {
  const { db } = getDb()
  return db
    .select({
      purchase: purchases,
      product: articles,
      brand: brands,
      forUser: { displayName: users.displayName, handle: users.handle },
    })
    .from(purchases)
    .innerJoin(articles, eq(purchases.articleId, articles.id))
    .innerJoin(brands, eq(articles.brandId, brands.id))
    .leftJoin(users, eq(purchases.forUserId, users.id))
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.createdAt))
    .limit(WARDROBE_LIMIT)
}

async function loadPreviews(userId: string) {
  return getDb()
    .db.select({
      id: previews.id,
      title: previews.title,
      imagePath: previews.imagePath,
      imageStatus: previews.imageStatus,
      expiresAt: previews.expiresAt,
    })
    .from(previews)
    .where(and(eq(previews.ownerId, userId), gt(previews.expiresAt, new Date())))
    .orderBy(desc(previews.createdAt))
    .limit(PREVIEWS_LIMIT)
}

const LOOKS_SHOWN = 8
const WARDROBE_SHOWN = 10

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser('/me')
  const [{ t, locale }, params] = await Promise.all([getI18n(), searchParams])
  const showAll = params.all === '1'
  const { db } = getDb()
  const [editions, previewItems, wardrobe, profile, network, engineView] = await Promise.all([
    callEngine('editions', () => loadEditions(user.id, t.me.looks.madeTogether)),
    callEngine('previews', () => loadPreviews(user.id)),
    callEngine('wardrobe', () => loadWardrobe(user.id)),
    callEngine('getPreferenceProfile', () => getPreferenceProfile(db, user.id)),
    callEngine('getUserNetwork', () => getUserNetwork(db, user.id)),
    isEngineView(),
  ])
  const library = await loadLibrary(user.id).catch(() => [] as LibraryCard[])
  const [cardCredits, personaCount] = await Promise.all([
    creditBalance(db, user.id).catch(() => 0),
    db
      .select({ n: count() })
      .from(personasTable)
      .where(eq(personasTable.ownerUserId, user.id))
      .then((r) => Number(r[0]?.n ?? 0))
      .catch(() => 0),
  ])
  const unavailable = <Notice tone="warning">{t.me.sectionUnavailable}</Notice>
  const moreLink =
    'text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-ink'
  const photoNotice = params.photo === 'updated'
  const photoError = Array.isArray(params.photoError) ? params.photoError[0] : params.photoError
  const photoErrorMessage = photoError
    ? (t.me.photo.errors[photoError] ?? t.me.photo.errors.save)
    : null

  return (
    <Container className="pb-16">
      <header className="flex items-center gap-4 pt-8 pb-6 md:gap-6 md:pt-10">
        <Avatar seed={user.avatarSeed} name={user.displayName} size={72} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="display truncate text-[28px] md:text-[36px]">{user.displayName}</h1>
          <p className="text-[13px] text-muted">
            {t.me.profileMeta(user.handle, formatRelative(user.createdAt, locale))}
          </p>
        </div>
        <Button href="/looks/new" className="shrink-0">
          {t.me.newLook}
        </Button>
      </header>

      {photoNotice ? (
        <Notice tone="success" className="mb-4">
          {t.me.photo.updated}
        </Notice>
      ) : null}
      {photoErrorMessage ? (
        <Notice tone="warning" className="mb-4">
          {photoErrorMessage}
        </Notice>
      ) : null}

      {/* Personas and credits: the two things the card studio needs, surfaced where a visitor
          already looks for their own things. */}
      <Section title="小卡" rule={false}>
        {/* The library's own sort control is right-aligned too, so without a gap here it sat
            flush against the bottom edge of the studio button directly above it. */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-muted">
              製卡額度{' '}
              <span className="tabular text-[15px] font-semibold text-ink">{cardCredits}</span>
              <span className="ml-2">· {personaCount} 位 persona</span>
            </p>
            <div className="ml-auto flex gap-2">
              {/* Where a visitor checks what they are actually showing: only the cards they set
                  to 公開 reach it. */}
              <Button href={`/u/${user.handle}`} size="sm" variant="secondary">
                我的公開頁面
              </Button>
              <Button href="/me/personas" size="sm" variant="secondary">
                管理 persona
              </Button>
              <Button href="/collections" size="sm" variant="secondary">
                收藏組合
              </Button>
              <Button href="/studio" size="sm">
                製卡工作室
              </Button>
            </div>
          </div>
          {library.length > 0 ? <CardLibrary items={library} /> : null}
        </div>
      </Section>

      <Section title={t.me.photo.title} rule={false}>
        <SavedPhotoForm
          hasPhoto={Boolean(user.photoPath)}
          labels={{
            currentAlt: t.me.photo.currentAlt,
            empty: t.me.photo.empty,
            hint: t.me.photo.hint,
            save: user.photoPath ? t.me.photo.replace : t.me.photo.add,
            saving: t.me.photo.saving,
          }}
        />
      </Section>

      <Section
        title={t.me.looks.title}
        actions={
          editions.ok && !showAll && editions.value.length > LOOKS_SHOWN ? (
            <Link href="/me?all=1" className={moreLink}>
              {t.me.allCount(editions.value.length)}
            </Link>
          ) : null
        }
      >
        {editions.ok ? (
          <EditionsGrid
            items={showAll ? editions.value : editions.value.slice(0, LOOKS_SHOWN)}
            viewerHandle={user.handle}
          />
        ) : (
          unavailable
        )}
      </Section>

      <Section title={t.me.previews.title}>
        {previewItems.ok ? <PreviewGrid items={previewItems.value} /> : unavailable}
      </Section>

      <Section
        title={t.me.wardrobe.title}
        actions={
          wardrobe.ok && !showAll && wardrobe.value.length > WARDROBE_SHOWN ? (
            <Link href="/me?all=1" className={moreLink}>
              {t.me.allCount(wardrobe.value.length)}
            </Link>
          ) : null
        }
      >
        {wardrobe.ok ? (
          <Wardrobe rows={showAll ? wardrobe.value : wardrobe.value.slice(0, WARDROBE_SHOWN)} />
        ) : (
          unavailable
        )}
      </Section>

      <Section title={t.me.taste.title}>
        {profile.ok ? <ProfileCard profile={profile.value} engineView={engineView} /> : unavailable}
      </Section>

      <Section title={t.me.people.title}>
        {network.ok ? <Circle network={network.value} /> : unavailable}
      </Section>
    </Container>
  )
}
