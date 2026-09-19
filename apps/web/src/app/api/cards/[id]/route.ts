import { articles as articlesTable, cards, eq, inArray, personas } from '@lookline/db'
import { renderLookPosterSvg } from '@lookline/engine'
import { getDb } from '@/server/db'
import { svgResponse } from '@/server/svg'

/**
 * An issued card's artwork. Public — a card is meant to be shown — but composed only from what the
 * card itself recorded, so nothing about the persona's private reference material is exposed.
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
      verificationCode: cards.verificationCode,
      personaName: personas.displayName,
    })
    .from(cards)
    .innerJoin(personas, eq(personas.id, cards.personaId))
    .where(eq(cards.id, id))
    .limit(1)
  if (!card) return new Response('Not found', { status: 404 })

  const ids = (card.snapshot ?? []).map((s) => s.articleId)
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

  const svg = renderLookPosterSvg({
    title: card.personaName,
    ownerName: card.verificationCode,
    stylePreset: 'studio',
    articles: worn,
    palette: worn.map((w) => w.colorHex ?? '#171717').filter(Boolean),
    aesthetics: [],
    seed: hash(card.id),
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
