import { asc, eq, lookArticles, looks, type Look } from '@lookline/db'
import { getDb } from './db'

export function canPreviewSourceLook(look: Pick<Look, 'ownerId' | 'visibility'>, viewerId: string) {
  return look.ownerId === viewerId || look.visibility !== 'private'
}

/** Loads the exact source composition only when this viewer may legitimately open the Look. */
export async function loadPreviewSourceLook(sourceLookId: string, viewerId: string) {
  const { db } = getDb()
  const [look] = await db.select().from(looks).where(eq(looks.id, sourceLookId)).limit(1)
  if (!look || !canPreviewSourceLook(look, viewerId)) return null
  const items = await db
    .select({ articleId: lookArticles.articleId, position: lookArticles.position })
    .from(lookArticles)
    .where(eq(lookArticles.lookId, look.id))
    .orderBy(asc(lookArticles.position))
  return { look, articleIds: items.map(({ articleId }) => articleId) }
}
