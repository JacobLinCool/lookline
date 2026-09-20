import { CardVisibility } from '@/components/cards/card-visibility'
import { and } from '@lookline/db'
import { readableCard } from '@/server/card-visibility'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  articles as articlesTable,
  brands,
  cards,
  eq,
  inArray,
  personas,
  users,
} from '@lookline/db'
import { tierForRatio } from '@lookline/engine'
import { Avatar, Button, Card, Container, Price, ProductImage, Tag } from '@/components/ui'
import { CardFace } from '@/components/cards/card-face'
import { ShareCard } from '@/components/cards/share-card'
import { displayName } from '@/lib/product-name'
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
    .where(and(eq(cards.id, id), await readableCard()))
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
    // No `images` here: `opengraph-image.tsx` next door supplies it, as a 1200×630 PNG. The
    // card's own endpoint answers SVG, which no platform will render as a preview.
    openGraph: { title, description, url: `${origin}/cards/${id}` },
  }
}

/** A name that leads to that account's public cards, or plain text when there is no account. */
function Person({ displayName, handle }: { displayName?: string; handle?: string }) {
  if (!displayName) return <>—</>
  if (!handle) return <>{displayName}</>
  return (
    <Link href={`/u/${handle}`} className="text-ink hover:underline underline-offset-4">
      {displayName}
    </Link>
  )
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
      visibility: cards.visibility,
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
    .where(and(eq(cards.id, id), await readableCard()))
    .limit(1)
  if (!card) notFound()

  const [author] = await db
    .select({ displayName: users.displayName, handle: users.handle })
    .from(users)
    .where(eq(users.id, card.authorId))
    .limit(1)
  const [holder] = await db
    .select({ displayName: users.displayName, handle: users.handle })
    .from(users)
    .where(eq(users.id, card.holderId))
    .limit(1)

  // Enough to shop from, not just to read: the piece is still in the catalogue, so whoever likes
  // it on the card can go straight to it. An article that has since left the catalogue has no row
  // here, and its line falls back to the bare id rather than linking somewhere that 404s.
  const ids = (card.snapshot ?? []).map((s) => s.articleId)
  const worn = ids.length
    ? await db
        .select({
          id: articlesTable.id,
          name: articlesTable.name,
          price: articlesTable.price,
          imagePath: articlesTable.imagePath,
          brandName: brands.name,
        })
        .from(articlesTable)
        .innerJoin(brands, eq(brands.id, articlesTable.brandId))
        .where(inArray(articlesTable.id, ids))
    : []
  const byId = new Map(worn.map((w) => [w.id, w]))
  const tier = tierForRatio(card.ownedRatio)

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div className="grid gap-8 md:grid-cols-[minmax(0,420px)_1fr]">
        <div className="flex flex-col gap-3">
          {/* The card face itself: the printing is part of the object, not page chrome. */}
          <CardFace
            imageUrl={`/api/cards/${card.id}`}
            personaName={card.personaName}
            verificationCode={card.verificationCode}
            tierLabel={tier.labelZh}
            size="lg"
            priority
          />
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
              {/* Both names lead to that person's shelf: this line was the only place a visitor
                  met someone by name, and it went nowhere. */}
              <p className="text-[13px] text-muted">
                由 <Person {...author} /> 製作 · 目前屬於 <Person {...holder} />
              </p>
            </div>
          </div>

          {viewer?.id === card.holderId ? (
            <CardVisibility id={card.id} visibility={card.visibility} />
          ) : null}
          <Card surface="panel" padding="sm" className="flex flex-col gap-2">
            <h2 className="text-[13px] font-medium">卡片上的服飾</h2>
            <ul className="flex flex-col">
              {(card.snapshot ?? []).map((s) => {
                const article = byId.get(s.articleId)
                const tag = (
                  <Tag tone={s.source === 'loan' ? 'accent' : undefined}>
                    {s.source === 'loan' ? '借用' : '自有'}
                  </Tag>
                )
                if (!article) {
                  return (
                    <li
                      key={s.articleId}
                      className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
                    >
                      <span className="truncate text-[13px] text-muted">{s.articleId}</span>
                      {tag}
                    </li>
                  )
                }
                const name = displayName(article.name, article.brandName)
                return (
                  <li
                    key={s.articleId}
                    className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
                  >
                    <Link href={`/p/${article.id}`} className="w-10 shrink-0" aria-label={name}>
                      <ProductImage
                        articleId={article.id}
                        imagePath={article.imagePath}
                        alt=""
                        lift
                      />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link
                        href={`/p/${article.id}`}
                        className="truncate text-[13px] hover:underline underline-offset-4"
                      >
                        {name}
                      </Link>
                      <span className="truncate text-[12px] text-muted">{article.brandName}</span>
                    </div>
                    <Price amount={article.price} size="sm" className="shrink-0" />
                    {tag}
                  </li>
                )
              })}
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
