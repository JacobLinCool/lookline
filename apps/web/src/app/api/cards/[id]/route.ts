import { cardCandidates, cards, eq, personas, users } from '@lookline/db'
import { renderLookPosterSvg } from '@lookline/engine'
import { cardArtFromSnapshot, candidateSeed } from '@/server/card-art'
import { getDb } from '@/server/db'
import { svgResponse } from '@/server/svg'

/**
 * An issued card's artwork. Public — a card is meant to be shown — but composed only from what the
 * card itself recorded, so nothing about the persona's private reference material is exposed.
 *
 * It has to be the picture that was chosen. The composition is seeded from the chosen candidate
 * rather than from the card, because seeding it from the card laid the same garments out
 * differently: whoever picked the third of four candidates was issued a fourth arrangement they
 * had never seen. The signature is the author's name for the same reason — the candidate carried
 * it, and the verification code is printed under the card anyway.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params
  const { db } = getDb()

  const [card] = await db
    .select({
      id: cards.id,
      snapshot: cards.articleSnapshot,
      personaName: personas.displayName,
      authorName: users.displayName,
      candidateId: cardCandidates.id,
      candidatePosition: cardCandidates.position,
    })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .innerJoin(users, eq(users.id, cards.authorUserId))
    .innerJoin(cardCandidates, eq(cardCandidates.id, cards.candidateId))
    .where(eq(cards.id, id))
    .limit(1)
  if (!card) return new Response('Not found', { status: 404 })

  const art = await cardArtFromSnapshot(db, card.snapshot ?? [])
  const svg = renderLookPosterSvg({
    title: card.personaName,
    ownerName: card.authorName,
    stylePreset: 'studio',
    articles: art.articles,
    palette: art.palette,
    aesthetics: [],
    seed: candidateSeed(card.candidateId, card.candidatePosition),
  })
  return svgResponse(svg, { cacheControl: 'public, max-age=31536000, immutable' })
}
