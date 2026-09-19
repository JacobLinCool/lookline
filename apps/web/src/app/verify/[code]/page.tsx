import type { Metadata } from 'next'
import { BadgeCheck, CircleSlash } from 'lucide-react'
import {
  cardCopies,
  cards,
  collectionEditions,
  collections,
  eq,
  personas,
  users,
} from '@lookline/db'
import { tierForRatio } from '@lookline/engine'
import { Button, Card, Container, EmptyState, PageHeader, Tag } from '@/components/ui'
import { getDb } from '@/server/db'
import { siteOrigin } from '@/server/site'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const origin = await siteOrigin()
  const url = `${origin}/verify/${encodeURIComponent(code)}`
  return {
    title: `查證 ${code} · Lookline`,
    description: '確認這張小卡的發行資料。',
    metadataBase: new URL(origin),
    alternates: { canonical: url },
    openGraph: { title: `查證 ${code} · Lookline`, url },
  }
}

/**
 * Public verification (#38). It states what the platform issued — subject, tier, number, when —
 * and nothing more: no private reference photograph, no candidate image, no unrelated participant.
 *
 * It does not claim the picture cannot be copied elsewhere. What it can show is whether this
 * number was ever issued here, and against what.
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { db } = getDb()
  const wanted = decodeURIComponent(code).trim().toUpperCase()

  const [card] = await db
    .select({
      id: cards.id,
      code: cards.verificationCode,
      tier: cards.tier,
      ownedRatio: cards.ownedRatio,
      issuedAt: cards.issuedAt,
      personaName: personas.displayName,
      holder: users.displayName,
      authorId: cards.authorUserId,
    })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .innerJoin(users, eq(users.id, personas.ownerUserId))
    .where(eq(cards.verificationCode, wanted))
    .limit(1)

  const [copy] = card
    ? []
    : await db
        .select({
          id: cardCopies.id,
          code: cardCopies.verificationCode,
          editionNumber: cardCopies.editionNumber,
          editionId: cardCopies.editionId,
          editionSize: collectionEditions.editionSize,
          issuedAt: cardCopies.issuedAt,
          collectionTitle: collections.title,
          personaName: personas.displayName,
          holder: users.displayName,
        })
        .from(cardCopies)
        .innerJoin(collectionEditions, eq(collectionEditions.id, cardCopies.editionId))
        .innerJoin(collections, eq(collections.id, collectionEditions.collectionId))
        .innerJoin(personas, eq(personas.id, cardCopies.beneficiaryPersonaId))
        .innerJoin(users, eq(users.id, personas.ownerUserId))
        .where(eq(cardCopies.verificationCode, wanted))
        .limit(1)

  if (!card && !copy) {
    return (
      <Container className="flex flex-col gap-6 py-8">
        <PageHeader title="查證" description="輸入卡片上的編號，確認它的發行資料。" />
        <EmptyState
          icon={<CircleSlash />}
          title={`找不到編號 ${wanted}`}
          description="這個編號不是 Lookline 發行的，或是輸入有誤。"
          action={<Button href="/verify">再查一次</Button>}
        />
      </Container>
    )
  }

  const issued = card ? card.issuedAt : copy!.issuedAt
  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader title="查證結果" description="以下是這個編號在平台上的發行資料。" />
      <Card surface="panel" padding="md" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-5" aria-hidden />
          <span className="text-[15px] font-medium">這是 Lookline 發行的卡片</span>
        </div>

        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-muted">編號</dt>
            <dd className="tabular">{card ? card.code : copy!.code}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-muted">主角</dt>
            <dd>{card ? card.personaName : copy!.personaName}</dd>
          </div>
          {card ? (
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">等級</dt>
              <dd>
                <Tag tone="accent">{tierForRatio(card.ownedRatio).labelZh}</Tag>
              </dd>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-muted">收藏</dt>
                <dd>{copy!.collectionTitle}</dd>
              </div>
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-muted">份數</dt>
                <dd className="tabular">
                  {copy!.editionNumber} / {copy!.editionSize}
                </dd>
              </div>
            </>
          )}
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-muted">目前持有</dt>
            <dd>{card ? card.holder : copy!.holder}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-muted">發行時間</dt>
            <dd className="tabular">{issued.toISOString().slice(0, 10)}</dd>
          </div>
        </dl>

        <p className="text-[12px] text-muted">
          查證只說明這個編號在平台上的發行紀錄，不代表圖片無法被他處複製。
        </p>

        <Button href={card ? `/cards/${card.id}` : `/editions/${copy!.editionId}`} size="sm">
          看這張卡
        </Button>
      </Card>
    </Container>
  )
}
