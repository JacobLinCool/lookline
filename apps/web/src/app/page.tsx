import type { Metadata } from 'next'
import { and, brands, desc, eq, gt, inArray, looks, products, users } from '@lookline/db'
import { getUserNetwork } from '@lookline/engine'
import { IntentWorkspace, type HomeLook, type HomeProduct } from '@/components/intent/workspace'
import { paramList, paramString } from '@/components/intent/urls'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { isEngineView } from '@/server/engine-view'

export const metadata: Metadata = { title: 'Find' }

const RAIL_LIMIT = 12

/**
 * The rail under the sentence field. Signed in: Looks shared (by link or publicly) by the people
 * in your circle. Signed out: public Looks only. Private Looks never appear.
 */
async function loadNetworkLooks(userId: string | null): Promise<HomeLook[]> {
  try {
    const { db } = getDb()
    let where = eq(looks.visibility, 'public')
    if (userId) {
      const network = await getUserNetwork(db, userId)
      const people = [...new Set(network.edges.map((edge) => edge.other.id))].filter(
        (id) => id !== userId,
      )
      if (people.length === 0) return []
      where = and(inArray(looks.ownerId, people), inArray(looks.visibility, ['link', 'public']))!
    }
    const rows = await db
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
      .where(where)
      .orderBy(desc(looks.createdAt))
      .limit(RAIL_LIMIT)
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
        id: products.id,
        name: products.name,
        price: products.price,
        colorName: products.colorName,
        brandName: brands.name,
      })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(gt(products.stock, 0))
      .orderBy(desc(products.trendScore), desc(products.popularity))
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
