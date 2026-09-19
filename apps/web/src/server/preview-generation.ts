import { nanoid } from 'nanoid'
import { after } from 'next/server'
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  previewProducts,
  previews,
  products,
  users,
  type Preview,
} from '@lookline/db'
import { buildLookImagePrompt, getLlm } from '@lookline/engine'
import { getDb } from './db'
import { resolveStylePreset, type ReferencePhoto } from './looks'
import { getStorage, isSafeKey } from './storage'

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1_000
const GENERATION_DEADLINE_MS = 30_000
const MAX_PREVIEW_PRODUCTS = 8

async function removeArtifact(key: string | null) {
  if (!key || !isSafeKey(key)) return
  await getStorage()
    .delete(key)
    .catch(() => {})
}

async function removePreviewArtifacts(preview: Pick<Preview, 'referencePath' | 'imagePath'>) {
  await Promise.all([removeArtifact(preview.referencePath), removeArtifact(preview.imagePath)])
}

export async function deletePreview(id: string): Promise<void> {
  const [preview] = await getDb()
    .db.select({ referencePath: previews.referencePath, imagePath: previews.imagePath })
    .from(previews)
    .where(eq(previews.id, id))
    .limit(1)
  if (!preview) return
  await getDb().db.delete(previews).where(eq(previews.id, id))
  await removePreviewArtifacts(preview)
}

/** Opportunistic bounded cleanup; expired records are inaccessible even before this runs. */
export async function purgeExpiredPreviews(now = new Date()): Promise<number> {
  const expired = await getDb()
    .db.select({
      id: previews.id,
      referencePath: previews.referencePath,
      imagePath: previews.imagePath,
    })
    .from(previews)
    .where(lt(previews.expiresAt, now))
    .limit(50)
  if (expired.length === 0) return 0
  await getDb()
    .db.delete(previews)
    .where(
      inArray(
        previews.id,
        expired.map((row) => row.id),
      ),
    )
  await Promise.all(expired.map(removePreviewArtifacts))
  return expired.length
}

export async function readPreviewGeneration(
  id: string,
): Promise<{ preview: Preview | null; expired: boolean }> {
  const { db } = getDb()
  let [preview] = await db.select().from(previews).where(eq(previews.id, id)).limit(1)
  if (!preview) return { preview: null, expired: false }
  if (preview.expiresAt.getTime() <= Date.now()) {
    await deletePreview(preview.id)
    return { preview: null, expired: true }
  }
  if (
    preview.imageStatus === 'pending' &&
    (!preview.imageStartedAt ||
      Date.now() - preview.imageStartedAt.getTime() >= GENERATION_DEADLINE_MS)
  ) {
    const [expired] = await db
      .update(previews)
      .set({
        imageStatus: 'failed',
        imageGenerationId: null,
        imageError: 'Rendering timed out. Retry while this preview is available.',
      })
      .where(
        and(
          eq(previews.id, preview.id),
          eq(previews.imageStatus, 'pending'),
          preview.imageGenerationId
            ? eq(previews.imageGenerationId, preview.imageGenerationId)
            : isNull(previews.imageGenerationId),
        ),
      )
      .returning()
    preview = expired ?? (await db.select().from(previews).where(eq(previews.id, id)).limit(1))[0]!
  }
  return { preview: preview ?? null, expired: false }
}

export async function getPreviewGeneration(id: string): Promise<Preview | null> {
  return (await readPreviewGeneration(id)).preview
}

async function loadComposition(preview: Preview) {
  const { db } = getDb()
  const [items, owners] = await Promise.all([
    db
      .select({ product: products })
      .from(previewProducts)
      .innerJoin(products, eq(previewProducts.productId, products.id))
      .where(eq(previewProducts.previewId, preview.id))
      .orderBy(asc(previewProducts.position)),
    db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, preview.ownerId))
      .limit(1),
  ])
  if (!owners[0] || items.length === 0) throw new Error('Preview composition is unavailable.')
  return { products: items.map((item) => item.product), ownerName: owners[0].displayName }
}

async function loadReference(preview: Preview): Promise<ReferencePhoto> {
  if (!isSafeKey(preview.referencePath)) throw new Error('Reference photo is unavailable.')
  const object = await getStorage().get(preview.referencePath)
  if (!object) throw new Error('Reference photo is unavailable.')
  return { mimeType: object.contentType, data: Buffer.from(await object.arrayBuffer()) }
}

async function finishPreview(preview: Preview) {
  const { db } = getDb()
  const current = and(
    eq(previews.id, preview.id),
    eq(previews.imageGenerationId, preview.imageGenerationId!),
    eq(previews.imageStatus, 'pending'),
  )
  let key: string | null = null
  try {
    const [scene, referencePhoto] = await Promise.all([
      loadComposition(preview),
      loadReference(preview),
    ])
    const prompt = buildLookImagePrompt({
      preset: resolveStylePreset(preview.stylePreset),
      products: scene.products,
      ownerName: scene.ownerName,
      occasion: preview.occasion,
      hasReferencePhoto: true,
    })
    const remaining = 25_000 - (Date.now() - preview.imageStartedAt!.getTime())
    if (remaining <= 0) throw new Error('Rendering timed out.')
    const result = await getLlm().generateImage({
      prompt,
      referenceImages: [referencePhoto],
      aspectRatio: '3:4',
      purpose: 'look',
      timeoutMs: remaining,
    })
    if (!result?.data.length) throw new Error('Rendering did not finish. Retry this preview.')
    const ext = IMAGE_EXT[result.mimeType]
    if (!ext) throw new Error('The renderer returned an unsupported image format.')
    key = `previews/${preview.id}-${preview.imageGenerationId}.${ext}`
    await getStorage().put(key, result.data, result.mimeType)
    const [saved] = await db
      .update(previews)
      .set({
        imagePath: key,
        imageStatus: 'ready',
        imageProvider: result.provider,
        imageGenerationId: null,
        imageError: null,
      })
      .where(current)
      .returning({ id: previews.id })
    if (!saved) await removeArtifact(key)
  } catch (error) {
    if (key) await removeArtifact(key)
    await db
      .update(previews)
      .set({
        imageStatus: 'failed',
        imageGenerationId: null,
        imageError: error instanceof Error ? error.message : 'Rendering failed.',
      })
      .where(current)
  }
}

export async function queuePreviewImage(id: string, stylePreset?: string): Promise<Preview> {
  const preview = await getPreviewGeneration(id)
  if (!preview) throw new Error('Preview not found.')
  if (preview.imageStatus === 'pending') return preview
  if (!getLlm().imageModel) throw new Error('Image rendering is unavailable.')
  const preset = resolveStylePreset(stylePreset ?? preview.stylePreset)
  const [claimed] = await getDb()
    .db.update(previews)
    .set({
      stylePreset: preset.slug,
      imageStatus: 'pending',
      imageGenerationId: nanoid(),
      imageStartedAt: new Date(),
      imageError: null,
    })
    .where(and(eq(previews.id, id), isNull(previews.imageGenerationId)))
    .returning()
  if (!claimed) return (await getPreviewGeneration(id))!
  after(() => finishPreview(claimed))
  return claimed
}

export async function cancelPreviewImage(
  id: string,
  generationId: string,
): Promise<Preview | null> {
  await getDb()
    .db.update(previews)
    .set({
      imageStatus: 'failed',
      imageGenerationId: null,
      imageError: 'Rendering cancelled. Retry while this preview is available.',
    })
    .where(and(eq(previews.id, id), eq(previews.imageGenerationId, generationId)))
  return getPreviewGeneration(id)
}

export async function createPreviewDraft(input: {
  ownerId: string
  productIds: readonly number[]
  sourceLookId?: string | null
  stylePreset: string
  title: string
  occasion?: string | null
  referencePhoto: ReferencePhoto
}): Promise<Preview> {
  if (!getLlm().imageModel) throw new Error('Image rendering is unavailable.')
  const productIds = [...new Set(input.productIds)].slice(0, MAX_PREVIEW_PRODUCTS)
  if (productIds.length === 0) throw new Error('Choose at least one product.')
  const found = await getDb()
    .db.select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds))
  if (found.length !== productIds.length) throw new Error('One or more products are unavailable.')
  const preset = resolveStylePreset(input.stylePreset)
  const id = `pv_${nanoid()}`
  const generationId = nanoid()
  const ext = IMAGE_EXT[input.referencePhoto.mimeType]
  if (!ext) throw new Error('Use a PNG, JPEG, or WebP reference photo.')
  const referencePath = `preview-references/${id}.${ext}`
  await getStorage().put(referencePath, input.referencePhoto.data, input.referencePhoto.mimeType)
  try {
    await getDb()
      .db.insert(previews)
      .values({
        id,
        ownerId: input.ownerId,
        sourceLookId: input.sourceLookId ?? null,
        title: input.title.trim().slice(0, 120) || 'Outfit preview',
        stylePreset: preset.slug,
        occasion: input.occasion?.trim().slice(0, 80) || null,
        referencePath,
        imageStatus: 'pending',
        imageGenerationId: generationId,
        imageStartedAt: new Date(),
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
      })
    await getDb()
      .db.insert(previewProducts)
      .values(productIds.map((productId, position) => ({ previewId: id, productId, position })))
  } catch (error) {
    await getDb()
      .db.delete(previews)
      .where(eq(previews.id, id))
      .catch(() => {})
    await removeArtifact(referencePath)
    throw error
  }
  const preview = (await getPreviewGeneration(id))!
  after(() => finishPreview(preview))
  after(() => purgeExpiredPreviews())
  return preview
}

export async function loadPreviewProducts(id: string) {
  return getDb()
    .db.select({ product: products, position: previewProducts.position })
    .from(previewProducts)
    .innerJoin(products, eq(previewProducts.productId, products.id))
    .where(eq(previewProducts.previewId, id))
    .orderBy(asc(previewProducts.position))
}
