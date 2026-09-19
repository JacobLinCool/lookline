import { notFound } from 'next/navigation'
import { cardCandidates, cards, eq, personas, users } from '@lookline/db'
import { tierForRatio } from '@lookline/engine'
import { cardArtFromSnapshot, candidateSeed } from '@/server/card-art'
import { getDb } from '@/server/db'
import { OG_CONTENT_TYPE, OG_SIZE, shareCardImage } from '@/server/og-card'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Lookline card'

/** The picture a shared card link shows. Same artwork the card page does, laid out to be cropped. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = getDb()
  const [card] = await db
    .select({
      snapshot: cards.articleSnapshot,
      ownedRatio: cards.ownedRatio,
      verificationCode: cards.verificationCode,
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
  if (!card) notFound()

  const art = await cardArtFromSnapshot(db, card.snapshot ?? [])
  return shareCardImage({
    title: card.personaName,
    subtitle: `by ${card.authorName}`,
    badge: tierForRatio(card.ownedRatio).labelEn,
    verificationCode: card.verificationCode,
    artwork: {
      title: card.personaName,
      ownerName: card.authorName,
      stylePreset: 'studio',
      articles: art.articles,
      palette: art.palette,
      aesthetics: [],
      seed: candidateSeed(card.candidateId, card.candidatePosition),
    },
  })
}
