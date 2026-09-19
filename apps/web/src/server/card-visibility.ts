import { cards, eq, ne, or, personas } from '@lookline/db'
import { getSessionUser } from './auth'

/** Direct links permit link/public cards. Only the current holder can read a private card. */
export async function readableCard() {
  const viewer = await getSessionUser()
  return viewer
    ? or(ne(cards.visibility, 'private'), eq(personas.ownerUserId, viewer.id))!
    : ne(cards.visibility, 'private')
}
