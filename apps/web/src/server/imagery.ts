import type { Article } from '@lookline/db'
import {
  compositeReferenceLabels,
  PREVIEW_ART_PRESETS,
  type ReferenceImage,
  type PreviewArtPreset,
} from '@lookline/engine'
import type { Locale } from '@/i18n/config'
import { getStorage, isSafeKey } from './storage'

/** The largest reference photo an image flow accepts; `vite.config.ts` keeps transport above it. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024

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

/** The file extension a stored photo of this type gets; anything unknown is stored as a JPEG. */
export function photoExtension(mimeType: string): string {
  return PHOTO_EXT[mimeType.toLowerCase()] ?? 'jpg'
}

/** Unknown presets are rejected rather than inventing an unsupported style. */
export function resolvePreviewArtPreset(slug: string): PreviewArtPreset {
  const preset = PREVIEW_ART_PRESETS.find((p) => p.slug === slug)
  if (!preset) throw new Error('Choose a supported style preset.')
  return preset
}

/**
 * A preset in the reader's language. The engine ships the Chinese label with the preset, so this
 * picks one; it never translates.
 */
export function presetLabel(locale: Locale, slug: string): string {
  const preset = PREVIEW_ART_PRESETS.find((p) => p.slug === slug)
  if (!preset) return slug
  return locale === 'zh-TW' ? preset.labelZh : preset.name
}

/** `{ value, label }` options for a preset `<Select>` in the reader's language. */
export function presetOptions(locale: Locale): Array<{ value: string; label: string }> {
  return PREVIEW_ART_PRESETS.map((p) => ({ value: p.slug, label: presetLabel(locale, p.slug) }))
}

/**
 * Store an uploaded owner photo in R2 under `photos/<userId>.<ext>` and return that key (the value
 * of `users.photoPath`). Does not touch `users.photoPath`; the caller decides.
 */
export async function savePhoto(userId: string, photo: ReferencePhoto): Promise<string> {
  const ext = photoExtension(photo.mimeType)
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
    console.warn(`[imagery] could not read stored photo ${photoPath}`, error)
    return null
  }
}

/** The most product photos one render attaches; past this, garments fall back to text only. */
export const MAX_GARMENT_IMAGES = 6

/**
 * Outfit pieces ready for `buildPreviewImagePrompt`, with their product photos loaded, and the
 * reference images in the order `previewReferenceLabels` names them (garments, then the person).
 * An article whose photo is missing or unreadable is still described in words.
 */
export async function loadPreviewReferences<A extends Pick<Article, 'imagePath'>>(
  articles: readonly A[],
  person: ReferencePhoto | null,
): Promise<{ articles: (A & { hasImage: boolean })[]; referenceImages: ReferenceImage[] }> {
  const photos = await Promise.all(
    articles.map((a, i) => (i < MAX_GARMENT_IMAGES ? loadStoredPhoto(a.imagePath) : null)),
  )
  const garments = photos.filter((p): p is ReferencePhoto => p !== null)
  const labels = compositeReferenceLabels(garments.length, person ? 1 : 0)
  return {
    articles: articles.map((a, i) => ({ ...a, hasImage: photos[i] !== null })),
    referenceImages: [...garments, ...(person ? [person] : [])].map((image, i) => ({
      ...image,
      label: labels[i],
    })),
  }
}

// ---------------------------------------------------------------------------
// Purchase attribution (cookies + searchParams read by /checkout)
// ---------------------------------------------------------------------------

/** Last Card the visitor added to the bag from; read by `/checkout` for `sourceCardId`. */
export const SOURCE_CARD_COOKIE = 'll_source_card'
/** Latest "say it in one sentence" turn; read by `/checkout` for `intentSessionId`. */
export const INTENT_SESSION_COOKIE = 'll_intent_session'

/** App ids are nanoid / `lk_000001`-style: keep only URL-safe id characters, max 64. */
export function sanitizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null
}
