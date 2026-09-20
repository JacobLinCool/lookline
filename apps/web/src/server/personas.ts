/**
 * A persona's reference photograph.
 *
 * `personas.reference_path` has existed since #35 and nothing ever wrote to it: a card was drawn
 * as a vector composition, so there was no picture for a photograph to be a reference for. Now
 * that a card is rendered by the image model, this is what keeps a card of your mother looking
 * like your mother.
 *
 * It lives on the persona rather than on the session because a persona is reused: one upload
 * serves every card that persona is ever the subject of. It is private — the key is never public
 * and `GET /api/personas/[id]/photo` answers only its manager — and a card made from it carries
 * the rendered artwork, never the photograph itself.
 */
import { eq, personas } from '@lookline/db'
import { getDb } from './db'
import { MAX_PHOTO_BYTES, photoExtension, type ReferencePhoto } from './imagery'
import { getStorage, isSafeKey } from './storage'

export const PERSONA_PHOTO_PREFIX = 'persona-references'

/**
 * Read an uploaded file from a form. An empty field is not an error — most submissions of the
 * persona form carry no photo at all — so it answers `null` for both "nothing sent" and "sent
 * something unusable", with the message saying which.
 */
export async function readPersonaPhoto(
  value: FormDataEntryValue | null,
): Promise<{ photo: ReferencePhoto | null; error: string | null }> {
  if (!(value instanceof File) || value.size === 0) return { photo: null, error: null }
  if (!value.type.startsWith('image/')) {
    return { photo: null, error: '參考照片必須是圖片檔。' }
  }
  if (value.size > MAX_PHOTO_BYTES) {
    return {
      photo: null,
      error: `參考照片請小於 ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB。`,
    }
  }
  return {
    photo: { mimeType: value.type, data: Buffer.from(await value.arrayBuffer()) },
    error: null,
  }
}

/**
 * Store a persona's reference photo and return its key. The extension comes from the file's type,
 * so replacing a JPEG with a PNG writes a different key — the caller saves the returned one and
 * deletes whatever the persona held before.
 */
export async function savePersonaPhoto(personaId: string, photo: ReferencePhoto): Promise<string> {
  const safeId = personaId.replace(/[^A-Za-z0-9_-]/g, '_')
  const key = `${PERSONA_PHOTO_PREFIX}/${safeId}.${photoExtension(photo.mimeType)}`
  await getStorage().put(key, photo.data, photo.mimeType)
  return key
}

/** Forget a stored reference photo. Never touches anything outside this persona's own prefix. */
export async function removePersonaPhoto(key: string | null | undefined): Promise<void> {
  if (!key || !isSafeKey(key) || !key.startsWith(`${PERSONA_PHOTO_PREFIX}/`)) return
  await getStorage()
    .delete(key)
    .catch((error: unknown) => {
      console.warn(`[personas] could not delete reference ${key}`, error)
    })
}

/**
 * Point a persona at a new reference photo, cleaning up the one it held. Ownership is the
 * caller's to check; this only writes.
 */
export async function replacePersonaPhoto(
  persona: { id: string; referencePath: string | null },
  photo: ReferencePhoto | null,
): Promise<void> {
  const key = photo ? await savePersonaPhoto(persona.id, photo) : null
  await getDb().db.update(personas).set({ referencePath: key }).where(eq(personas.id, persona.id))
  // Only after the row points somewhere else, and only when it is not the same key overwritten.
  if (persona.referencePath && persona.referencePath !== key) {
    await removePersonaPhoto(persona.referencePath)
  }
}
