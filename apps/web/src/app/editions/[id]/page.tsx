import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cardCopies, collectionEditions, collections, eq, personas, users } from '@lookline/db'
import { Avatar, Button, Card, Container, PageHeader, Tag } from '@/components/ui'
import { ShareCard } from '@/components/cards/share-card'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { siteOrigin } from '@/server/site'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { db } = getDb()
  const [edition] = await db
    .select({ size: collectionEditions.editionSize, title: collections.title })
    .from(collectionEditions)
    .innerJoin(collections, eq(collections.id, collectionEditions.collectionId))
    .where(eq(collectionEditions.id, id))
    .limit(1)
  if (!edition) return { title: 'Edition' }
  const origin = await siteOrigin()
  const title = `${edition.title} · 限量 ${edition.size} 份`
  const description = `一張多人小卡，發行 ${edition.size} 份，每位參與者各持 1 份。`
  return {
    title,
    description,
    metadataBase: new URL(origin),
    alternates: { canonical: `${origin}/editions/${id}` },
    // `opengraph-image.tsx` supplies the picture; see the note on the card page.
    openGraph: { title, description, url: `${origin}/editions/${id}` },
  }
}

/**
 * An issued edition and every numbered copy in it. Copies are listed individually rather than
 * deduplicated by artwork: one account holding three of them holds three, and saying "1" would
 * lose two.
 */
export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = getDb()
  const viewer = await getSessionUser()

  const [edition] = await db
    .select({
      id: collectionEditions.id,
      editionSize: collectionEditions.editionSize,
      collectionTitle: collections.title,
      collectionId: collections.id,
    })
    .from(collectionEditions)
    .innerJoin(collections, eq(collections.id, collectionEditions.collectionId))
    .where(eq(collectionEditions.id, id))
    .limit(1)
  if (!edition) notFound()

  const copies = await db
    .select({
      id: cardCopies.id,
      editionNumber: cardCopies.editionNumber,
      verificationCode: cardCopies.verificationCode,
      personaName: personas.displayName,
      avatarSeed: personas.avatarSeed,
      holderName: users.displayName,
      holderId: users.id,
    })
    .from(cardCopies)
    .innerJoin(personas, eq(personas.id, cardCopies.beneficiaryPersonaId))
    .innerJoin(users, eq(users.id, personas.ownerUserId))
    .where(eq(cardCopies.editionId, id))
    .orderBy(cardCopies.editionNumber)

  const mine = copies.filter((c) => c.holderId === viewer?.id)
  // Preview and export are the same picture: whoever is looking sees their own numbered print,
  // so what gets shared is what was on screen rather than an unnumbered variant of it.
  const shown = mine[0] ?? copies[0] ?? null
  const shownImage = shown
    ? `/api/editions/${edition.id}?copy=${encodeURIComponent(shown.verificationCode)}`
    : `/api/editions/${edition.id}`

  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader
        title={edition.collectionTitle}
        description={`限量 ${edition.editionSize} 份 · 每位參與的 persona 各 1 份`}
      />

      <div className="grid gap-8 md:grid-cols-[minmax(0,420px)_1fr]">
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-line bg-card p-3 shadow-[0_18px_40px_-24px_rgb(23_23_23/0.35)]">
            <img
              src={shownImage}
              alt={edition.collectionTitle}
              width={600}
              height={840}
              className="w-full rounded-lg"
            />
          </div>
          <ShareCard
            title={edition.collectionTitle}
            imageUrl={shownImage}
            verifyCode={shown?.verificationCode ?? ''}
          />
        </div>

        <div className="flex flex-col gap-4">
          {mine.length > 0 ? (
            <Card surface="panel" padding="sm">
              <p className="text-[13px]">
                你持有這個發行的 <span className="font-semibold">{mine.length}</span> 份
                {mine.length > 1 ? '（分別綁在你管理的不同 persona 上）' : ''}
              </p>
            </Card>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-medium">每一份</h2>
            <ul className="flex flex-col gap-2">
              {copies.map((c) => (
                <Card
                  as="li"
                  key={c.id}
                  surface={c.holderId === viewer?.id ? 'panel' : undefined}
                  padding="sm"
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar seed={c.avatarSeed} name={c.personaName} size="xs" />
                    <span className="truncate text-[13px]">{c.personaName}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-[12px] text-muted">
                      {c.editionNumber}/{edition.editionSize}
                    </span>
                    <a
                      href={`/verify/${c.verificationCode}`}
                      className="tabular text-[11px] text-muted underline decoration-line underline-offset-4 hover:text-ink"
                    >
                      {c.verificationCode}
                    </a>
                    {c.holderId === viewer?.id ? <Tag tone="accent">你的</Tag> : null}
                  </span>
                </Card>
              ))}
            </ul>
          </section>

          <Button href={`/collections/${edition.collectionId}`} variant="secondary">
            回到收藏
          </Button>
        </div>
      </div>
    </Container>
  )
}
