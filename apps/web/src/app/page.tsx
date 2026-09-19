import type { Metadata } from 'next'
import { and, brands, desc, eq, gt, inArray, looks, ne, articles, users } from '@lookline/db'
import { getUserNetwork } from '@lookline/engine'
import { IntentWorkspace, type HomeLook, type HomeProduct } from '@/components/intent/workspace'
import { paramList, paramString } from '@/components/intent/urls'
import { getI18n } from '@/i18n/server'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { isEngineView } from '@/server/engine-view'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.home.metaTitle }
}

const RAIL_LIMIT = 12

/**
 * The rail under the sentence field. Signed-in viewers see circle Looks first, then recent public
 * Looks from everyone else. Signed-out viewers see recent public Looks. Private Looks never appear.
 */
async function loadNetworkLooks(userId: string | null): Promise<HomeLook[]> {
  try {
    const { db } = getDb()
    const publicRows = await db
      .select({
        id: looks.id,
        title: looks.title,
        stylePreset: looks.stylePreset,
        imagePath: looks.imagePath,
        kind: looks.kind,
        displayName: users.displayName,
        handle: users.handle,
        avatarSeed: users.avatarSeed,
      })
      .from(looks)
      .innerJoin(users, eq(looks.ownerId, users.id))
      .where(
        userId
          ? and(eq(looks.visibility, 'public'), ne(looks.ownerId, userId))
          : eq(looks.visibility, 'public'),
      )
      .orderBy(desc(looks.createdAt))
      .limit(RAIL_LIMIT)

    let circleRows: typeof publicRows = []
    if (userId) {
      try {
        const network = await getUserNetwork(db, userId)
        const people = [...new Set(network.edges.map((edge) => edge.other.id))].filter(
          (id) => id !== userId,
        )
        if (people.length > 0)
          circleRows = await db
            .select({
              id: looks.id,
              title: looks.title,
              stylePreset: looks.stylePreset,
              imagePath: looks.imagePath,
              kind: looks.kind,
              displayName: users.displayName,
              handle: users.handle,
              avatarSeed: users.avatarSeed,
            })
            .from(looks)
            .innerJoin(users, eq(looks.ownerId, users.id))
            .where(
              and(inArray(looks.ownerId, people), inArray(looks.visibility, ['link', 'public'])),
            )
            .orderBy(desc(looks.createdAt))
            .limit(RAIL_LIMIT)
      } catch (error) {
        console.warn('[home] circle Looks unavailable; showing public Looks', error)
      }
    }
    const rows = [...circleRows, ...publicRows]
      .filter((row, index, all) => all.findIndex(({ id }) => id === row.id) === index)
      .slice(0, RAIL_LIMIT)
    return rows.map((r) => ({
      look: {
        id: r.id,
        title: r.title,
        stylePreset: r.stylePreset,
        imagePath: r.imagePath,
        kind: r.kind,
      },
      owner: { displayName: r.displayName, handle: r.handle, avatarSeed: r.avatarSeed },
    }))
  } catch (error) {
    console.warn('[home] network Looks unavailable', error)
    return []
  }
}

/** In-stock pieces with the most network momentum. */
async function loadTrending(): Promise<HomeProduct[]> {
  try {
    return await getDb()
      .db.select({
        id: articles.id,
        imagePath: articles.imagePath,
        name: articles.name,
        price: articles.price,
        colorName: articles.colorName,
        brandName: brands.name,
      })
      .from(articles)
      .innerJoin(brands, eq(articles.brandId, brands.id))
      .orderBy(desc(articles.trendScore), desc(articles.popularity))
      .limit(RAIL_LIMIT)
  } catch (error) {
    console.warn('[home] trending pieces unavailable', error)
    return []
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [params, user, engineView, trending] = await Promise.all([
    searchParams,
    getSessionUser(),
    isEngineView(),
    loadTrending(),
  ])
  const networkLooks = await loadNetworkLooks(user?.id ?? null)
  const query = {
    q: paramString(params.q).trim().slice(0, 500),
    clarify: paramList(params.clarify),
    previous: paramString(params.previous) || null,
  }
  return (
    <IntentWorkspace
      initialQuery={query}
      signedIn={user !== null}
      engineView={engineView}
      networkLooks={networkLooks}
      trending={trending}
    />
  )
}
