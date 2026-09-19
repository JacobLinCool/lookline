import {
  and,
  articles as articlesTable,
  cardCandidates,
  cardSessions,
  eq,
  inArray,
  personas,
} from '@lookline/db'
import { renderLookPosterSvg } from '@lookline/engine'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { svgResponse } from '@/server/svg'

/**
 * A candidate's artwork, composed from the session's own articles and its persona.
 *
 * Private: candidates belong to the session's owner until one of them is issued as a card, so this
 * answers 404 to anyone else rather than revealing that the id exists.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params
  const user = await getSessionUser()
  if (!user) return new Response('Not found', { status: 404 })
  const { db } = getDb()

  const [row] = await db
    .select({
      candidateId: cardCandidates.id,
      position: cardCandidates.position,
      sessionId: cardSessions.id,
      ownerUserId: cardSessions.ownerUserId,
      snapshot: cardSessions.articleSnapshot,
      personaName: personas.displayName,
    })
    .from(cardCandidates)
    .innerJoin(cardSessions, eq(cardSessions.id, cardCandidates.sessionId))
    .innerJoin(personas, eq(personas.id, cardSessions.personaId))
    .where(eq(cardCandidates.id, id))
    .limit(1)
  if (!row || row.ownerUserId !== user.id) return new Response('Not found', { status: 404 })

  const ids = (row.snapshot ?? []).map((s) => s.articleId)
  const worn = ids.length
    ? await db
        .select({
          name: articlesTable.name,
          colorHex: articlesTable.colorHex,
          subcategory: articlesTable.subcategory,
          pattern: articlesTable.pattern,
          categoryGroup: articlesTable.categoryGroup,
        })
        .from(articlesTable)
        .where(inArray(articlesTable.id, ids))
    : []

  // Each candidate gets its own seed, so the four differ without any of them being a redraw of
  // another — they are alternatives, not revisions.
  const svg = renderLookPosterSvg({
    title: row.personaName,
    ownerName: user.displayName,
    stylePreset: 'studio',
    articles: worn,
    palette: worn.map((w) => w.colorHex ?? '#171717').filter(Boolean),
    aesthetics: [],
    seed: hash(`${row.candidateId}:${row.position}`),
  })
  return svgResponse(svg, { cacheControl: 'private, max-age=300' })
}

/** FNV-1a, so a candidate always composes the same way. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
