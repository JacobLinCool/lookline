import { nanoid } from 'nanoid'
import { after } from 'next/server'
import { and, asc, eq, isNull, looks, lookProducts, products, users, type Look } from '@lookline/db'
import { buildLookImagePrompt, createLook, getLlm, type CreateLookInput } from '@lookline/engine'
import { getDb } from './db'
import { getStorage, isSafeKey } from './storage'
import {
  DEFAULT_STYLE_PRESET,
  loadStoredPhoto,
  resolveStylePreset,
  type ReferencePhoto,
} from './looks'

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const GENERATION_DEADLINE_MS = 30_000

async function removeArtifact(key: string) {
  if (!isSafeKey(key)) return
  await getStorage()
    .delete(key)
    .catch(() => {})
}

async function composition(look: Look) {
  const { db } = getDb()
  const [items, owners] = await Promise.all([
    db
      .select({ product: products })
      .from(lookProducts)
      .innerJoin(products, eq(products.id, lookProducts.productId))
      .where(eq(lookProducts.lookId, look.id))
      .orderBy(asc(lookProducts.position)),
    db
      .select({ displayName: users.displayName, photoPath: users.photoPath })
      .from(users)
      .where(eq(users.id, look.ownerId))
      .limit(1),
  ])
  const owner = owners[0]
  if (!owner) throw new Error('The Look owner was not found.')
  return { products: items.map((i) => i.product), owner }
}

/** Expired persisted leases are retryable, including after a process restart. */
export async function getLookGeneration(id: string): Promise<Look | null> {
  const { db } = getDb()
  let [look] = await db.select().from(looks).where(eq(looks.id, id)).limit(1)
  if (!look) return null
  if (
    look.imageStatus === 'pending' &&
    (!look.imageStartedAt || Date.now() - look.imageStartedAt.getTime() >= GENERATION_DEADLINE_MS)
  ) {
    const [expired] = await db
      .update(looks)
      .set({
        imageStatus: 'failed',
        imageGenerationId: null,
        imageError: 'Rendering timed out. Your composition is saved; retry when ready.',
      })
      .where(
        and(
          eq(looks.id, id),
          eq(looks.imageStatus, 'pending'),
          look.imageGenerationId
            ? eq(looks.imageGenerationId, look.imageGenerationId)
            : isNull(looks.imageGenerationId),
        ),
      )
      .returning()
    // Another worker may have completed between the read and compare-and-set.
    look = expired ?? (await db.select().from(looks).where(eq(looks.id, id)).limit(1))[0]!
  }
  return look ?? null
}

async function finishImage(look: Look, referencePhoto?: ReferencePhoto | null) {
  const { db } = getDb()
  const current = and(
    eq(looks.id, look.id),
    eq(looks.imageGenerationId, look.imageGenerationId!),
    eq(looks.imageStatus, 'pending'),
  )
  let key: string | null = null
  try {
    const scene = await composition(look)
    const photo =
      referencePhoto === undefined ? await loadStoredPhoto(scene.owner.photoPath) : referencePhoto
    const prompt = buildLookImagePrompt({
      preset: resolveStylePreset(look.stylePreset),
      products: scene.products,
      ownerName: scene.owner.displayName,
      occasion: look.occasion,
      hasReferencePhoto: photo !== null,
    })
    const remaining = 25_000 - (Date.now() - look.imageStartedAt!.getTime())
    if (remaining <= 0) throw new Error('Rendering timed out. Your composition is saved.')
    const result = await getLlm().generateImage({
      prompt,
      referenceImages: photo ? [photo] : [],
      aspectRatio: '3:4',
      purpose: 'look',
      timeoutMs: remaining,
    })
    if (!result?.data.length)
      throw new Error('Rendering did not finish. Your composition is saved; you can retry.')
    const ext = IMAGE_EXT[result.mimeType]
    if (!ext) throw new Error('The renderer returned an unsupported image format.')
    if (Date.now() - look.imageStartedAt!.getTime() >= GENERATION_DEADLINE_MS)
      throw new Error('Rendering timed out. Your composition is saved.')
    key = `looks/${look.id}-${look.imageGenerationId}.${ext}`
    await getStorage().put(key, result.data, result.mimeType)
    if (Date.now() - look.imageStartedAt!.getTime() >= GENERATION_DEADLINE_MS)
      throw new Error('Rendering timed out. Your saved visual is available.')
    const [saved] = await db
      .update(looks)
      .set({
        imagePath: key,
        imageStatus: 'ready',
        imageProvider: result.provider,
        imageGenerationId: null,
        imageError: null,
        prompt,
      })
      .where(current)
      .returning({ id: looks.id })
    if (!saved) await removeArtifact(key)
  } catch (error) {
    if (key) await removeArtifact(key)
    await db
      .update(looks)
      .set({
        imageStatus: 'failed',
        imageGenerationId: null,
        imageError:
          error instanceof Error ? error.message : 'Rendering failed. Your composition is saved.',
      })
      .where(current)
  }
}

/** Claim one generation atomically. A repeated click reuses the current persisted job. */
export async function queueLookImage(
  id: string,
  options: { stylePreset?: string; referencePhoto?: ReferencePhoto | null } = {},
): Promise<Look> {
  const look = await getLookGeneration(id)
  if (!look) throw new Error('Look not found.')
  if (look.imageStatus === 'pending') return look
  const preset = resolveStylePreset(options.stylePreset ?? look.stylePreset)
  if (!getLlm().imageModel)
    throw new Error('Image rendering is unavailable. Your composition remains available.')
  const [claimed] = await getDb()
    .db.update(looks)
    .set({
      stylePreset: preset.slug,
      imageStatus: 'pending',
      imageGenerationId: nanoid(),
      imageStartedAt: new Date(),
      imageError: null,
    })
    .where(and(eq(looks.id, id), isNull(looks.imageGenerationId)))
    .returning()
  if (!claimed) return (await getLookGeneration(id))!
  after(() => finishImage(claimed, options.referencePhoto))
  return claimed
}

/**
 * Save a real product composition before scheduling any provider work. The composition poster is
 * rendered on demand by `GET /api/looks/[id]/image` (no `imagePath`), so nothing is stored until a
 * provider image exists.
 */
export async function createLookDraft(
  input: CreateLookInput & { referencePhoto?: ReferencePhoto | null },
): Promise<Look> {
  const { referencePhoto, ...fields } = input
  resolveStylePreset(fields.stylePreset || DEFAULT_STYLE_PRESET)
  const look = await createLook(
    getDb().db,
    {
      ...fields,
      stylePreset: fields.stylePreset || DEFAULT_STYLE_PRESET,
      imageStatus: 'ready',
      imageProvider: 'offline',
      imagePath: null,
    },
    { deferFeedback: after },
  )
  return getLlm().imageModel
    ? queueLookImage(look.id, { referencePhoto: referencePhoto ?? null })
    : look
}
