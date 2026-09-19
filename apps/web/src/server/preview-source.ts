import { asc, eq, lookProducts, looks, type Look } from '@lookline/db'
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
    .select({ productId: lookProducts.productId, position: lookProducts.position })
    .from(lookProducts)
    .where(eq(lookProducts.lookId, look.id))
    .orderBy(asc(lookProducts.position))
  return { look, productIds: items.map(({ productId }) => productId) }
}
