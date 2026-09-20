import type { Metadata } from 'next'
import {
  activitySharing,
  and,
  brands,
  cardCopies,
  cards as cardsTable,
  collectionEditions,
  collections as collectionsTable,
  count,
  desc,
  eq,
  friendships,
  gt,
  or,
  articles,
  personas as personasTable,
  previews,
  purchases,
  users,
} from '@lookline/db'
import { creditBalance, tierForRatio } from '@lookline/engine'
import { CardLibrary, type LibraryCard } from '@/components/cards/card-library'
import { PreviewGrid } from '@/components/me/previews'
import { SavedPhotoForm } from '@/components/me/saved-photo-form'
import { Wardrobe, type WardrobeRow } from '@/components/me/wardrobe'
import { Avatar, Button, Card, Container, Notice, Section } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { formatRelative } from '@/server/format'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.me.metaTitle }
}

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
    ...own.map((card) => ({
      kind: 'card' as const,
      id: card.id,
      href: `/cards/${card.id}`,
      imageUrl: `/api/cards/${card.id}`,
      personaName: card.personaName,
      personaId: card.personaId,
      avatarSeed: card.avatarSeed,
      verificationCode: card.code,
      tierLabel: tierForRatio(card.ownedRatio).labelZh,
      editionNumber: null,
      editionSize: null,
      collectionTitle: null,
      issuedAt: card.issuedAt.getTime(),
    })),
    ...copies.map((copy) => ({
      kind: 'copy' as const,
      id: copy.id,
      href: `/editions/${copy.editionId}`,
      imageUrl: `/api/editions/${copy.editionId}?copy=${encodeURIComponent(copy.code)}`,
      personaName: copy.personaName,
      personaId: copy.personaId,
      avatarSeed: copy.avatarSeed,
      verificationCode: copy.code,
      tierLabel: null,
      editionNumber: copy.editionNumber,
      editionSize: copy.editionSize,
      collectionTitle: copy.collectionTitle,
      issuedAt: copy.issuedAt.getTime(),
    })),
  ]
}

async function loadWardrobe(userId: string): Promise<WardrobeRow[]> {
  return getDb()
    .db.select({
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
    .limit(60)
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
    .limit(12)
}

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser('/me')
  const [{ t, locale }, params] = await Promise.all([getI18n(), searchParams])
  const { db } = getDb()
  const [
    library,
    wardrobe,
    previewItems,
    credits,
    personaRows,
    collectionRows,
    friendRows,
    sharing,
  ] = await Promise.all([
    loadLibrary(user.id),
    loadWardrobe(user.id),
    loadPreviews(user.id),
    creditBalance(db, user.id),
    db.select({ n: count() }).from(personasTable).where(eq(personasTable.ownerUserId, user.id)),
    db
      .select({ n: count() })
      .from(collectionsTable)
      .where(eq(collectionsTable.ownerUserId, user.id)),
    db
      .select({ n: count() })
      .from(friendships)
      .where(
        and(
          eq(friendships.state, 'accepted'),
          or(eq(friendships.lowUserId, user.id), eq(friendships.highUserId, user.id)),
        ),
      ),
    db.select().from(activitySharing).where(eq(activitySharing.userId, user.id)).limit(1),
  ])
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
        <Button href="/studio" className="shrink-0">
          {t.me.newCard}
        </Button>
      </header>

      {params.photo === 'updated' ? <Notice tone="success">{t.me.photo.updated}</Notice> : null}
      {photoErrorMessage ? <Notice tone="warning">{photoErrorMessage}</Notice> : null}

      <Section title={t.me.cards.title} rule={false}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <span>{t.me.cards.credits(credits)}</span>
            <span>·</span>
            <span>{t.me.cards.personas(Number(personaRows[0]?.n ?? 0))}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button href="/me/personas" size="sm" variant="secondary">
                {t.me.cards.managePersonas}
              </Button>
              <Button href="/studio" size="sm">
                {t.me.cards.openStudio}
              </Button>
            </div>
          </div>
          {library.length ? (
            <CardLibrary items={library} />
          ) : (
            <p className="text-[13px] text-muted">{t.me.cards.empty}</p>
          )}
        </div>
      </Section>

      <Section title={t.me.organize.title}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card surface="panel" padding="sm" className="flex items-center justify-between gap-4">
            <div>
              <h3>{t.me.organize.collections}</h3>
              <p className="text-[12px] text-muted">
                {t.me.organize.collectionCount(Number(collectionRows[0]?.n ?? 0))}
              </p>
            </div>
            <Button href="/collections" size="sm" variant="secondary">
              {t.common.open}
            </Button>
          </Card>
          <Card surface="panel" padding="sm" className="flex items-center justify-between gap-4">
            <div>
              <h3>{t.me.organize.friends}</h3>
              <p className="text-[12px] text-muted">
                {t.me.organize.friendCount(
                  Number(friendRows[0]?.n ?? 0),
                  sharing[0]?.purchases ?? false,
                )}
              </p>
            </div>
            <Button href="/me/friends" size="sm" variant="secondary">
              {t.me.organize.manageSharing}
            </Button>
          </Card>
        </div>
      </Section>

      <Section title={t.me.previews.title}>
        <PreviewGrid items={previewItems} />
      </Section>

      <Section title={t.me.wardrobe.title}>
        <Wardrobe rows={wardrobe} />
      </Section>

      <Section title={t.me.photo.title}>
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
    </Container>
  )
}
