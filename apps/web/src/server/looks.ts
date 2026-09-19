import { STYLE_PRESETS, type StylePreset } from '@lookline/engine'
import { getStorage, isSafeKey } from './storage'

export interface ReferencePhoto {
  mimeType: string
  data: Buffer
}

export const DEFAULT_STYLE_PRESET = 'studio-minimal'

const PHOTO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/** Unknown presets are rejected rather than inventing an unsupported style. */
export function resolveStylePreset(slug: string): StylePreset {
  const preset = STYLE_PRESETS.find((p) => p.slug === slug)
  if (!preset) throw new Error('Choose a supported style preset.')
  return preset
}

/** Human preset name for a slug (used by captions and cards). */
export function presetName(slug: string): string {
  return resolveStylePreset(slug).name
}

/**
 * Store an uploaded owner photo in R2 under `photos/<userId>.<ext>` and return that key (the value
 * of `users.photoPath`). Does not touch `users.photoPath`; the caller decides.
 */
export async function savePhoto(userId: string, photo: ReferencePhoto): Promise<string> {
  const ext = PHOTO_EXT[photo.mimeType.toLowerCase()] ?? 'jpg'
  const safeId = userId.replace(/[^A-Za-z0-9_-]/g, '_')
  const key = `photos/${safeId}.${ext}`
  await getStorage().put(key, photo.data, photo.mimeType)
  return key
}

/** Load a stored photo (`users.photoPath`) as a reference photo, or null when missing. */
export async function loadStoredPhoto(
  photoPath: string | null | undefined,
): Promise<ReferencePhoto | null> {
  if (!photoPath || !isSafeKey(photoPath)) return null
  try {
    const object = await getStorage().get(photoPath)
    if (!object) return null
    return { mimeType: object.contentType, data: Buffer.from(await object.arrayBuffer()) }
  } catch (error) {
    console.warn(`[looks] could not read stored photo ${photoPath}`, error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Purchase attribution (cookies + searchParams read by /checkout)
// ---------------------------------------------------------------------------

/** Last Look the visitor added to the bag from; read by `/checkout` for `sourceLookId`. */
export const SOURCE_LOOK_COOKIE = 'll_source_look'
/** Ask the visitor last answered / opened; read by `/checkout` for `sourceAskId`. */
export const SOURCE_ASK_COOKIE = 'll_source_ask'
/** Latest "say it in one sentence" turn; read by `/checkout` for `intentSessionId`. */
export const INTENT_SESSION_COOKIE = 'll_intent_session'

/** App ids are nanoid / `lk_000001`-style: keep only URL-safe id characters, max 64. */
export function sanitizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null
}

/** Keep service diagnostics in server logs and show a useful action failure. */
export function describeEngineError(
  action: 'look' | 'reaction' | 'purchase',
  error: unknown,
): string {
  console.warn(`[looks] ${action} failed`, error)
  const messages = {
    look: 'Your Look could not be saved. Please try again.',
    reaction: 'Your reaction could not be saved. Please try again.',
    purchase: 'Your order could not be placed. Please try again.',
  }
  return messages[action]
}
