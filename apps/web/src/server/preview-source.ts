import { cards, eq, personas } from '@lookline/db'
import { getDb } from './db'

export function canReadPreviewSourceCard(
  card: { visibility: 'private' | 'link' | 'public'; authorUserId: string; holderUserId: string },
  viewerId: string,
): boolean {
  return (
    card.visibility !== 'private' ||
    card.authorUserId === viewerId ||
    card.holderUserId === viewerId
  )
}

/** Load a card's immutable outfit snapshot only when the viewer may read that card. */
export async function loadPreviewSourceCard(sourceCardId: string, viewerId: string) {
  const { db } = getDb()
  const [row] = await db
    .select({
      id: cards.id,
      visibility: cards.visibility,
      authorUserId: cards.authorUserId,
      holderUserId: personas.ownerUserId,
      snapshot: cards.articleSnapshot,
    })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(eq(cards.id, sourceCardId))
    .limit(1)
  if (!row) return null
  if (!canReadPreviewSourceCard(row, viewerId)) return null
  return {
    card: row,
    articleIds: [...new Set((row.snapshot ?? []).map((entry) => entry.articleId))],
  }
}
