import { cardCandidates, cardSessions, collections, eq, personas } from '@lookline/db'
import { renderLookPosterSvg } from '@lookline/engine'
import { getSessionUser } from '@/server/auth'
import { cardArtFromSnapshot, candidateSeed } from '@/server/card-art'
import { getDb } from '@/server/db'
import { storedImageResponse } from '@/server/storage'
import { svgResponse } from '@/server/svg'

/**
 * A candidate's artwork, composed from the session's own articles and its persona.
 *
 * Private: candidates belong to the session's owner until one of them is issued as a card, so this
 * answers 404 to anyone else rather than revealing that the id exists.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params
  const user = await getSessionUser()
  if (!user) return new Response('Not found', { status: 404 })
  const { db } = getDb()

  const [row] = await db
    .select({
      candidateId: cardCandidates.id,
      imagePath: cardCandidates.imagePath,
      position: cardCandidates.position,
      sessionId: cardSessions.id,
      ownerUserId: cardSessions.ownerUserId,
      snapshot: cardSessions.articleSnapshot,
      personaName: personas.displayName,
      collectionTitle: collections.title,
    })
    .from(cardCandidates)
    .innerJoin(cardSessions, eq(cardSessions.id, cardCandidates.sessionId))
    .innerJoin(personas, eq(personas.id, cardSessions.personaId))
    .leftJoin(collections, eq(collections.id, cardSessions.collectionId))
    .where(eq(cardCandidates.id, id))
    .limit(1)
  if (!row || row.ownerUserId !== user.id) return new Response('Not found', { status: 404 })

  // A rendered candidate is a photograph stored in R2. Everything else — an older candidate, a
  // render whose image has since been swept — still draws as the composition poster below.
  const rendered = await storedImageResponse(request, row.imagePath, 'private, max-age=300')
  if (rendered) return rendered

  const art = await cardArtFromSnapshot(db, row.snapshot ?? [])

  // Each candidate gets its own seed, so the four differ without any of them being a redraw of
  // another — they are alternatives, not revisions.
  const svg = renderLookPosterSvg({
    // The preview is titled like the card it would become: a collection by its name, a personal
    // card by its subject.
    title: row.collectionTitle ?? row.personaName,
    ownerName: user.displayName,
    stylePreset: 'studio',
    articles: art.articles,
    groups: art.groups.length > 0 ? art.groups : undefined,
    palette: art.palette,
    aesthetics: [],
    // The issued card is drawn from this same seed, so what was picked is what is issued.
    seed: candidateSeed(row.candidateId, row.position),
  })
  return svgResponse(svg, { cacheControl: 'private, max-age=300' })
}
