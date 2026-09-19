/**
 * Turning a session's frozen article snapshot into poster input.
 *
 * A personal card is one flat lay. An edition is one band per persona, because #37 asks the
 * artwork to keep each subject with their own clothes rather than pooling everyone's into a heap.
 * Both read the snapshot rather than the wardrobe, so revoking a loan or editing a collection
 * afterwards never rewrites a picture that was already made.
 */
import { articles as articlesTable, inArray, personas as personasTable } from '@lookline/db'
import type { Database } from '@lookline/db'
import type { LookPosterInput } from '@lookline/engine'

export interface SnapshotEntry {
  articleId: string
  personaId?: string
}

type Worn = LookPosterInput['articles'][number]

export interface CardArt {
  articles: Worn[]
  groups: NonNullable<LookPosterInput['groups']>
  palette: string[]
}

export async function cardArtFromSnapshot(
  db: Database,
  snapshot: readonly SnapshotEntry[],
): Promise<CardArt> {
  const ids = [...new Set(snapshot.map((s) => s.articleId))]
  if (ids.length === 0) return { articles: [], groups: [], palette: [] }

  const rows = await db
    .select({
      id: articlesTable.id,
      name: articlesTable.name,
      colorHex: articlesTable.colorHex,
      subcategory: articlesTable.subcategory,
      pattern: articlesTable.pattern,
      categoryGroup: articlesTable.categoryGroup,
    })
    .from(articlesTable)
    .where(inArray(articlesTable.id, ids))
  const byId = new Map(rows.map((r) => [r.id, r]))

  // Snapshot order is the order the members were fixed in, so the bands read in edition order.
  const worn = snapshot.flatMap((s) => {
    const row = byId.get(s.articleId)
    return row ? [{ entry: s, row }] : []
  })
  const articles: Worn[] = worn.map((w) => w.row)
  const palette = articles.map((a) => a.colorHex ?? '#171717').filter(Boolean)

  const personaIds = [...new Set(worn.map((w) => w.entry.personaId).filter((p): p is string => !!p))]
  if (personaIds.length === 0) return { articles, groups: [], palette }

  const names = new Map(
    (
      await db
        .select({ id: personasTable.id, displayName: personasTable.displayName })
        .from(personasTable)
        .where(inArray(personasTable.id, personaIds))
    ).map((p) => [p.id, p.displayName]),
  )
  const groups = personaIds.map((id) => ({
    name: names.get(id) ?? id,
    articles: worn.filter((w) => w.entry.personaId === id).map((w) => w.row),
  }))
  return { articles, groups, palette }
}
