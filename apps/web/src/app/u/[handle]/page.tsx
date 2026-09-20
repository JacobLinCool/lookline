import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, cards, desc, eq, personas, users } from '@lookline/db'
import { tierForRatio } from '@lookline/engine'
import { Avatar, Button, Container, EmptyState, Notice } from '@/components/ui'
import { CardFace } from '@/components/cards/card-face'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { siteOrigin } from '@/server/site'

/** Handles are stored bare; a pasted `@alice` and a stray path segment both land here. */
function parseHandle(raw: string): string | null {
  const value = decodeURIComponent(raw).trim().replace(/^@/, '')
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null
}

async function loadPerson(raw: string) {
  const handle = parseHandle(raw)
  if (!handle) return null
  const [person] = await getDb()
    .db.select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarSeed: users.avatarSeed,
    })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1)
  return person ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const person = await loadPerson((await params).handle)
  if (!person) return { title: '找不到這個人' }
  const origin = await siteOrigin()
  const url = `${origin}/u/${person.handle}`
  const title = `${person.displayName} (@${person.handle})`
  const description = `${person.displayName} 公開的 Lookline 小卡。`
  return {
    title,
    description,
    metadataBase: new URL(origin),
    alternates: { canonical: url },
    openGraph: { title, description, url },
  }
}

/**
 * Someone's public shelf.
 *
 * Two decisions shape it, and both are decisions the product had already made elsewhere:
 *
 * It lists what this account *holds*, read through the personas it manages, which is the same
 * definition the card page's "目前屬於" uses. So handing a persona to the family member it
 * portrays moves those cards off this page and onto theirs, which is exactly what a transfer is
 * supposed to mean. (The home rails say "made by", through `cards.author_user_id`; that is a
 * different question — who made it — and it does not move.)
 *
 * It lists only `visibility = 'public'`. `link` means "whoever has the link", so listing those
 * here would publish something its holder deliberately did not publish, and the switch on the
 * card page already says as much in the reader's own words.
 *
 * Collection copies are left out on purpose: `card_copies` has no visibility of its own, and one
 * artwork belongs to every persona in the collection, so nobody can say on their own whether it
 * may be listed. Reachable by link is not the same as gathered onto a page.
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const person = await loadPerson((await params).handle)
  if (!person) notFound()
  const viewer = await getSessionUser()
  const isSelf = viewer?.id === person.id

  const held = await getDb()
    .db.select({
      id: cards.id,
      code: cards.verificationCode,
      ownedRatio: cards.ownedRatio,
      personaName: personas.displayName,
    })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(and(eq(personas.ownerUserId, person.id), eq(cards.visibility, 'public')))
    .orderBy(desc(cards.issuedAt))

  return (
    <Container className="flex flex-col gap-6 py-8">
      <header className="flex items-center gap-4">
        <Avatar seed={person.avatarSeed} name={person.displayName} size="md" />
        <div className="flex min-w-0 flex-col">
          <h1 className="display text-[26px] leading-tight">{person.displayName}</h1>
          <p className="text-[13px] text-muted">
            @{person.handle} · {held.length} 張公開的小卡
          </p>
        </div>
        {isSelf ? (
          <Button href="/me" variant="secondary" size="sm" className="ml-auto">
            管理我的收藏
          </Button>
        ) : null}
      </header>

      {/* Said only to its owner, because "why is my card missing" is a question only they can ask
          — and the answer is a switch on the card's own page. */}
      {isSelf ? (
        <Notice>
          這是其他人看到的樣子。只有設為「公開」的小卡會出現在這裡；設成「只有自己」或「持有連結的人」的不會被列出。
        </Notice>
      ) : null}

      {held.length === 0 ? (
        <EmptyState
          title={isSelf ? '還沒有公開的小卡' : `${person.displayName} 還沒有公開的小卡`}
          description={
            isSelf
              ? '到任何一張小卡的頁面，把可見範圍改成「公開」，它就會出現在這裡。'
              : '等他們公開第一張再回來看看。'
          }
          action={isSelf ? <Button href="/me">去我的收藏</Button> : undefined}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {held.map((card) => (
            <li key={card.id}>
              <Link href={`/cards/${card.id}`} className="block tile-lift">
                <CardFace
                  imageUrl={`/api/cards/${card.id}`}
                  personaName={card.personaName}
                  verificationCode={card.code}
                  tierLabel={tierForRatio(card.ownedRatio).labelZh}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
