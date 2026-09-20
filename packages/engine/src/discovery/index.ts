import {
  activitySharing,
  and,
  articles,
  brands,
  cards,
  desc,
  eq,
  friendships,
  gte,
  or,
  personas,
  purchases,
  recentArticleViews,
  sql,
  users,
  type Database,
} from '@lookline/db'
import { currentHomeTrend } from '../search-trends/queries'
import { searchProducts } from '../recommend/search'
import { discoveryDimensions } from './preferences'
export * from './friends'

export const HOME_LIMIT = 12
export const HOME_CANDIDATES = 400
export const HOME_FRIENDS = 32
export const HOME_ACTIVITY_DAYS = 30
const fields = {
  id: articles.id,
  name: articles.name,
  imagePath: articles.imagePath,
  price: articles.price,
  colorName: articles.colorName,
  brandName: brands.name,
}
export type HomeProduct = {
  id: string
  name: string
  imagePath: string | null
  price: number
  colorName: string | null
  brandName: string
}
export type PreferenceRail = { kind: 'aesthetic' | 'color'; value: string; items: HomeProduct[] }
export type FriendActivity =
  | { kind: 'purchase'; id: string; at: number; person: string; product: HomeProduct }
  | { kind: 'card'; id: string; at: number; person: string; title: string; code: string }

export async function trending(db: Database): Promise<HomeProduct[]> {
  return db
    .select(fields)
    .from(articles)
    .innerJoin(brands, eq(brands.id, articles.brandId))
    .orderBy(desc(articles.trendScore), desc(articles.popularity), desc(articles.id))
    .limit(HOME_LIMIT)
}

/**
 * The rail for what the country is searching for, read as a style by the model that wrote it. The
 * label and the sentence are that abstract reading; the trending terms behind them never reach
 * this far, so nothing here can look like an endorsement.
 *
 * `q` is free text the lexicon scans for taxonomy terms, which is why a phrase like
 * "運動風 機能外套 黑色" needs no parsing of its own here.
 */
export type SearchingRail = { label: string; rationale: string; items: HomeProduct[] } | null
export async function searching(db: Database): Promise<SearchingRail> {
  const trend = await currentHomeTrend(db)
  if (!trend) return null
  const { items } = await searchProducts(db, {
    q: trend.styleQuery,
    sort: 'popular',
    pageSize: HOME_LIMIT,
  })
  return {
    label: trend.label,
    rationale: trend.rationale,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      imagePath: item.imagePath,
      price: item.price,
      colorName: item.colorName,
      brandName: item.brandName,
    })),
  }
}

export async function recent(db: Database, userId: string): Promise<HomeProduct[]> {
  return db
    .select(fields)
    .from(recentArticleViews)
    .innerJoin(articles, eq(articles.id, recentArticleViews.articleId))
    .innerJoin(brands, eq(brands.id, articles.brandId))
    .where(eq(recentArticleViews.userId, userId))
    .orderBy(desc(recentArticleViews.viewedAt), desc(recentArticleViews.articleId))
    .limit(HOME_LIMIT)
}

export async function recordArticleView(
  db: Database,
  userId: string,
  articleId: string,
  at = new Date(),
) {
  await db
    .insert(recentArticleViews)
    .values({ userId, articleId, viewedAt: at })
    .onConflictDoUpdate({
      target: [recentArticleViews.userId, recentArticleViews.articleId],
      set: { viewedAt: sql`max(${recentArticleViews.viewedAt}, excluded.viewed_at)` },
    })
}

/** Shared public candidate pool, never a user response cache. No catalog-size vector scan. */
const pools = new WeakMap<
  Database,
  { expires: number; promise: ReturnType<typeof candidatePool> }
>()
const candidatePool = async (db: Database) =>
  db
    .select({
      ...fields,
      aesthetics: articles.aesthetics,
      color: articles.colorFamily,
      productCode: articles.productCode,
    })
    .from(articles)
    .innerJoin(brands, eq(brands.id, articles.brandId))
    .orderBy(desc(articles.popularity))
    .limit(HOME_CANDIDATES)
function candidates(db: Database) {
  let entry = pools.get(db)
  if (!entry || entry.expires <= Date.now()) {
    const promise = candidatePool(db)
    entry = { expires: Date.now() + 60_000, promise }
    pools.set(db, entry)
    void promise.catch(() => {
      if (pools.get(db)?.promise === promise) pools.delete(db)
    })
  }
  return entry.promise
}
export async function preferences(db: Database, userId: string): Promise<PreferenceRail[]> {
  const dimensions = await discoveryDimensions(db, userId)
  if (!dimensions.length) return []
  const pool = await candidates(db)
  const used = new Set<string>()
  const rails: PreferenceRail[] = []
  for (const dimension of dimensions) {
    const items = pool
      .filter(
        (row) =>
          !used.has(row.productCode) &&
          (dimension.kind === 'aesthetic'
            ? row.aesthetics.includes(dimension.value)
            : row.color === dimension.value),
      )
      .filter(
        (row, i, rows) => rows.findIndex((other) => other.productCode === row.productCode) === i,
      )
      .slice(0, HOME_LIMIT)
    if (!items.length) continue
    for (const item of items) used.add(item.productCode)
    rails.push({
      ...dimension,
      items: items.map(({ aesthetics: _a, color: _c, productCode: _p, ...item }) => item),
    })
    if (rails.length === 2) break
  }
  return rails
}

/** Fresh authorization per request: no cached social permissions or inferred trust edges. */
export async function friendActivity(
  db: Database,
  userId: string,
  now = new Date(),
): Promise<{ friendCount: number; items: FriendActivity[] }> {
  const friends = await db
    .select({ id: users.id, name: users.displayName, purchases: activitySharing.purchases })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(eq(friendships.lowUserId, userId), eq(users.id, friendships.highUserId)),
        and(eq(friendships.highUserId, userId), eq(users.id, friendships.lowUserId)),
      ),
    )
    .leftJoin(activitySharing, eq(activitySharing.userId, users.id))
    .where(
      and(
        eq(friendships.state, 'accepted'),
        or(eq(friendships.lowUserId, userId), eq(friendships.highUserId, userId)),
      ),
    )
    .orderBy(desc(friendships.updatedAt))
    .limit(HOME_FRIENDS)
  const since = new Date(now.getTime() - HOME_ACTIVITY_DAYS * 86_400_000)
  const groups = await Promise.all(
    friends.map(async (friend) => {
      const [bought, made] = await Promise.all([
        friend.purchases
          ? db
              .select({ ...fields, purchaseId: purchases.id, at: purchases.createdAt })
              .from(purchases)
              .innerJoin(articles, eq(articles.id, purchases.articleId))
              .innerJoin(brands, eq(brands.id, articles.brandId))
              .where(and(eq(purchases.userId, friend.id), gte(purchases.createdAt, since)))
              .orderBy(desc(purchases.createdAt))
              .limit(HOME_LIMIT)
          : [],
        db
          .select({
            id: cards.id,
            at: cards.issuedAt,
            title: personas.displayName,
            code: cards.verificationCode,
          })
          .from(cards)
          .innerJoin(personas, eq(personas.id, cards.personaId))
          .where(
            and(
              eq(cards.authorUserId, friend.id),
              eq(cards.visibility, 'public'),
              gte(cards.issuedAt, since),
            ),
          )
          .orderBy(desc(cards.issuedAt))
          .limit(HOME_LIMIT),
      ])
      return [
        ...bought.map(({ purchaseId, at, ...product }): FriendActivity => ({
          kind: 'purchase',
          id: purchaseId,
          at: at.getTime(),
          person: friend.name,
          product,
        })),
        ...made.map(({ at, ...card }): FriendActivity => ({
          kind: 'card',
          ...card,
          at: at.getTime(),
          person: friend.name,
        })),
      ]
    }),
  )
  return {
    friendCount: friends.length,
    items: groups
      .flat()
      .toSorted((a, b) => b.at - a.at || a.id.localeCompare(b.id))
      .slice(0, HOME_LIMIT),
  }
}
