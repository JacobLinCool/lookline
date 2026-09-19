import { notFound } from 'next/navigation'
import {
  cardCandidates,
  cardCopies,
  cardSessions,
  collectionEditions,
  collections,
  eq,
  personas,
} from '@lookline/db'
import { cardArtFromSnapshot, candidateSeed } from '@/server/card-art'
import { getDb } from '@/server/db'
import { OG_CONTENT_TYPE, OG_SIZE, shareCardImage } from '@/server/og-card'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Lookline edition'

/** The picture a shared edition link shows: one artwork, and how many numbered copies exist. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = getDb()
  const [edition] = await db
    .select({
      editionSize: collectionEditions.editionSize,
      title: collections.title,
      snapshot: cardSessions.articleSnapshot,
      candidateId: cardCandidates.id,
      candidatePosition: cardCandidates.position,
    })
    .from(collectionEditions)
    .innerJoin(collections, eq(collections.id, collectionEditions.collectionId))
    .innerJoin(cardSessions, eq(cardSessions.id, collectionEditions.sessionId))
    .innerJoin(cardCandidates, eq(cardCandidates.id, collectionEditions.imagePath))
    .where(eq(collectionEditions.id, id))
    .limit(1)
  if (!edition) notFound()

  // The bands on the artwork are captioned in the card itself, and the share variant draws no
  // words at all — so the subjects are named here instead, where the font is one we chose.
  const copies = await db
    .select({ personaName: personas.displayName })
    .from(cardCopies)
    .innerJoin(personas, eq(personas.id, cardCopies.beneficiaryPersonaId))
    .where(eq(cardCopies.editionId, id))
    .orderBy(cardCopies.editionNumber)

  const art = await cardArtFromSnapshot(db, edition.snapshot ?? [])
  return shareCardImage({
    title: edition.title,
    subtitle: copies.map((c) => c.personaName).join(' · ') || `限量 ${edition.editionSize} 份`,
    badge: `Edition of ${edition.editionSize}`,
    verificationCode: `${edition.editionSize} numbered copies`,
    artwork: {
      title: edition.title,
      ownerName: `限量 ${edition.editionSize} 份`,
      stylePreset: 'studio',
      articles: art.articles,
      groups: art.groups.length > 0 ? art.groups : undefined,
      palette: art.palette,
      aesthetics: [],
      seed: candidateSeed(edition.candidateId, edition.candidatePosition),
    },
  })
}
