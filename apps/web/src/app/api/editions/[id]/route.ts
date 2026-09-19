import { and, cardCopies, cardSessions, collectionEditions, collections, eq } from '@lookline/db'
import { renderLookPosterSvg } from '@lookline/engine'
import { cardArtFromSnapshot } from '@/server/card-art'
import { getDb } from '@/server/db'
import { svgResponse } from '@/server/svg'

/**
 * A collection edition's artwork: one picture, however many numbered copies were issued from it.
 *
 * Composed from the session's snapshot, which was frozen when the edition was issued. Editing the
 * collection afterwards — adding a persona, removing one — leaves this picture exactly as it was,
 * which is what makes the copies' numbering mean anything.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params
  const { db } = getDb()

  const [edition] = await db
    .select({
      id: collectionEditions.id,
      editionSize: collectionEditions.editionSize,
      title: collections.title,
      snapshot: cardSessions.articleSnapshot,
    })
    .from(collectionEditions)
    .innerJoin(collections, eq(collections.id, collectionEditions.collectionId))
    .innerJoin(cardSessions, eq(cardSessions.id, collectionEditions.sessionId))
    .where(eq(collectionEditions.id, id))
    .limit(1)
  if (!edition) return new Response('Not found', { status: 404 })

  // `?copy=<verification code>` is one holder's own numbered print of the same artwork, which is
  // what makes a shared image's number verifiable. The code has to belong to this edition — a
  // number taken straight from the query would let any picture claim to be 1/N.
  const code = new URL(request.url).searchParams.get('copy')
  const [copy] = code
    ? await db
        .select({ editionNumber: cardCopies.editionNumber })
        .from(cardCopies)
        .where(and(eq(cardCopies.editionId, id), eq(cardCopies.verificationCode, code)))
        .limit(1)
    : []

  const art = await cardArtFromSnapshot(db, edition.snapshot ?? [])
  const svg = renderLookPosterSvg({
    title: edition.title,
    ownerName: copy ? `${copy.editionNumber}/${edition.editionSize}` : `限量 ${edition.editionSize} 份`,
    stylePreset: 'studio',
    articles: art.articles,
    groups: art.groups.length > 0 ? art.groups : undefined,
    palette: art.palette,
    aesthetics: [],
    seed: hash(edition.id),
    editionNumber: copy?.editionNumber,
    editionOf: edition.editionSize,
  })
  return svgResponse(svg, { cacheControl: 'public, max-age=31536000, immutable' })
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
