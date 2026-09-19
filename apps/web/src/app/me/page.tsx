import type { Metadata } from 'next'
import Link from 'next/link'
import {
  askResponses,
  asks,
  brands,
  count,
  desc,
  eq,
  inArray,
  lookParticipants,
  lookProducts,
  looks,
  or,
  products,
  purchases,
  users,
} from '@lookline/db'
import { getPreferenceProfile, getUserNetwork } from '@lookline/engine'
import { Avatar, Button, Container, Notice, Section } from '@/components/ui'
import { AsksPanel, type ReceivedAsk, type SentAsk } from '@/components/me/asks'
import { Circle } from '@/components/me/circle'
import { EditionsGrid, type EditionItem } from '@/components/me/editions'
import { ProfileCard } from '@/components/me/profile-card'
import { Wardrobe, type WardrobeRow } from '@/components/me/wardrobe'
import { callEngine } from '@/components/trends/engine-guard'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { isEngineView } from '@/server/engine-view'
import { formatRelative } from '@/server/format'

export const metadata: Metadata = { title: 'Wardrobe' }

const EDITIONS_LIMIT = 48
const WARDROBE_LIMIT = 60
const ASKS_LIMIT = 30

/** Looks the user owns or took part in, newest first, with owner and lineage hint. */
async function loadEditions(userId: string): Promise<EditionItem[]> {
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
      .select({ lookId: lookProducts.lookId, n: count() })
      .from(lookProducts)
      .where(inArray(lookProducts.lookId, ids))
      .groupBy(lookProducts.lookId),
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
    } else if (look.kind === 'together') lineage = 'Made together'
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
      product: products,
      brand: brands,
      forUser: { displayName: users.displayName, handle: users.handle },
    })
    .from(purchases)
    .innerJoin(products, eq(purchases.productId, products.id))
    .innerJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(users, eq(purchases.forUserId, users.id))
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.createdAt))
    .limit(WARDROBE_LIMIT)
}

async function loadAsks(userId: string): Promise<{ sent: SentAsk[]; received: ReceivedAsk[] }> {
  const { db } = getDb()
  const [sentRows, received] = await Promise.all([
    db
      .select()
      .from(asks)
      .where(eq(asks.askerId, userId))
      .orderBy(desc(asks.createdAt))
      .limit(ASKS_LIMIT),
    db
      .select({
        ask: asks,
        asker: {
          displayName: users.displayName,
          handle: users.handle,
          avatarSeed: users.avatarSeed,
        },
      })
      .from(asks)
      .innerJoin(users, eq(asks.askerId, users.id))
      .where(eq(asks.targetUserId, userId))
      .orderBy(desc(asks.createdAt))
      .limit(ASKS_LIMIT),
  ])
  const responseCounts =
    sentRows.length > 0
      ? await db
          .select({ askId: askResponses.askId, n: count() })
          .from(askResponses)
          .where(
            inArray(
              askResponses.askId,
              sentRows.map((a) => a.id),
            ),
          )
          .groupBy(askResponses.askId)
      : []
  const byAsk = new Map(responseCounts.map((r) => [r.askId, Number(r.n)]))
  return {
    sent: sentRows.map((ask) => ({ ask, responses: byAsk.get(ask.id) ?? 0 })),
    received,
  }
}

const LOOKS_SHOWN = 8
const WARDROBE_SHOWN = 10
const ASKS_SHOWN = 5

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser('/me')
  const showAll = (await searchParams).all === '1'
  const { db } = getDb()
  const [editions, wardrobe, askData, profile, network, engineView] = await Promise.all([
    callEngine('editions', () => loadEditions(user.id)),
    callEngine('wardrobe', () => loadWardrobe(user.id)),
    callEngine('asks', () => loadAsks(user.id)),
    callEngine('getPreferenceProfile', () => getPreferenceProfile(db, user.id)),
    callEngine('getUserNetwork', () => getUserNetwork(db, user.id)),
    isEngineView(),
  ])
  const unavailable = <Notice tone="warning">This part could not be loaded.</Notice>
  const moreLink =
    'text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-ink'

  return (
    <Container className="pb-16">
      <header className="flex items-center gap-4 pt-8 pb-6 md:gap-6 md:pt-10">
        <Avatar seed={user.avatarSeed} name={user.displayName} size={72} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="display truncate text-[28px] md:text-[36px]">{user.displayName}</h1>
          <p className="text-[13px] text-muted">
            @{user.handle} · member since {formatRelative(user.createdAt)}
          </p>
        </div>
        <Button href="/looks/new" className="shrink-0">
          New Look
        </Button>
      </header>

      <Section
        title="Looks"
        actions={
          editions.ok && !showAll && editions.value.length > LOOKS_SHOWN ? (
            <Link href="/me?all=1" className={moreLink}>
              All {editions.value.length}
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

      <Section
        title="Wardrobe"
        actions={
          wardrobe.ok && !showAll && wardrobe.value.length > WARDROBE_SHOWN ? (
            <Link href="/me?all=1" className={moreLink}>
              All {wardrobe.value.length}
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

      <Section title="Your taste">
        {profile.ok ? <ProfileCard profile={profile.value} engineView={engineView} /> : unavailable}
      </Section>

      <Section title="People">
        {network.ok ? <Circle network={network.value} /> : unavailable}
      </Section>

      <Section title="Asks">
        {askData.ok ? (
          <AsksPanel
            sent={showAll ? askData.value.sent : askData.value.sent.slice(0, ASKS_SHOWN)}
            received={
              showAll ? askData.value.received : askData.value.received.slice(0, ASKS_SHOWN)
            }
          />
        ) : (
          unavailable
        )}
      </Section>
    </Container>
  )
}
