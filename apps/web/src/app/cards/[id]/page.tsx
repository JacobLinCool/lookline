import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { articles as articlesTable, cards, eq, inArray, personas, users } from '@lookline/db'
import { tierForRatio } from '@lookline/engine'
import { Avatar, Button, Card, Container, Tag } from '@/components/ui'
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
  const [card] = await db
    .select({ code: cards.verificationCode, persona: personas.displayName })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(eq(cards.id, id))
    .limit(1)
  if (!card) return { title: 'Card' }
  const origin = await siteOrigin()
  const title = `${card.persona} · ${card.code}`
  const description = `一張 Lookline 小卡，編號 ${card.code}，可以在平台上查證發行資料。`
  return {
    title,
    description,
    metadataBase: new URL(origin),
    alternates: { canonical: `${origin}/cards/${id}` },
    openGraph: {
      title,
      description,
      url: `${origin}/cards/${id}`,
      images: [{ url: `${origin}/api/cards/${id}`, width: 900, height: 1200 }],
    },
  }
}

/**
 * An issued card. What it says about its own making — author, clothes, tier, number — was fixed
 * when it was issued and is not rewritten if the persona later changes hands; the holder is read
 * through the persona, so it is always current.
 */
export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = getDb()
  const viewer = await getSessionUser()

  const [card] = await db
    .select({
      id: cards.id,
      verificationCode: cards.verificationCode,
      tier: cards.tier,
      ownedRatio: cards.ownedRatio,
      snapshot: cards.articleSnapshot,
      issuedAt: cards.issuedAt,
      personaName: personas.displayName,
      personaSeed: personas.avatarSeed,
      holderId: personas.ownerUserId,
      authorId: cards.authorUserId,
    })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(eq(cards.id, id))
    .limit(1)
  if (!card) notFound()

  const [author] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, card.authorId))
    .limit(1)
  const [holder] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, card.holderId))
    .limit(1)

  const ids = (card.snapshot ?? []).map((s) => s.articleId)
  const worn = ids.length
    ? await db
        .select({ id: articlesTable.id, name: articlesTable.name })
        .from(articlesTable)
        .where(inArray(articlesTable.id, ids))
    : []
  const nameById = new Map(worn.map((w) => [w.id, w.name]))
  const tier = tierForRatio(card.ownedRatio)

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div className="grid gap-8 md:grid-cols-[minmax(0,420px)_1fr]">
        <div className="flex flex-col gap-3">
          {/* The card face itself: the frame is part of the object, not page chrome. */}
          <div className="overflow-hidden rounded-xl border border-line bg-card p-3 shadow-[0_18px_40px_-24px_rgb(23_23_23/0.35)]">
            <img
              src={`/api/cards/${card.id}`}
              alt={`${card.personaName} 的小卡`}
              width={600}
              height={840}
              className="w-full rounded-lg"
            />
            <div className="flex items-center justify-between px-1 pt-3">
              <span className="tabular text-[11px] text-muted">{card.verificationCode}</span>
              <Tag tone="accent">{tier.labelZh}</Tag>
            </div>
          </div>
          <ShareCard
            title={`${card.personaName} · Lookline`}
            imageUrl={`/api/cards/${card.id}`}
            verifyCode={card.verificationCode}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar seed={card.personaSeed} name={card.personaName} size="sm" />
            <div className="flex flex-col">
              <h1 className="display text-[24px] leading-tight">{card.personaName}</h1>
              <p className="text-[13px] text-muted">
                由 {author?.displayName ?? '—'} 製作 · 目前屬於 {holder?.displayName ?? '—'}
              </p>
            </div>
          </div>

          <Card surface="panel" padding="sm" className="flex flex-col gap-2">
            <h2 className="text-[13px] font-medium">卡片上的服飾</h2>
            <ul className="flex flex-col gap-1">
              {(card.snapshot ?? []).map((s) => (
                <li key={s.articleId} className="flex items-center justify-between gap-3">
                  <span className="truncate text-[13px]">
                    {nameById.get(s.articleId) ?? s.articleId}
                  </span>
                  <Tag tone={s.source === 'loan' ? 'accent' : undefined}>
                    {s.source === 'loan' ? '借用' : '自有'}
                  </Tag>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-muted">
              自有 {Math.round(card.ownedRatio * 100)}% —— 等級按件數計算，不按價格。
              發行當下的來源已存進卡片，之後轉讓或朋友收回共享都不會改寫。
            </p>
          </Card>

          <div className="flex gap-2">
            <Button href="/me">回到我的收藏</Button>
            {viewer?.id === card.holderId ? (
              <Button href="/studio" variant="secondary">
                再做一張
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Container>
  )
}
