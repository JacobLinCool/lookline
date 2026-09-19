import { nanoid } from 'nanoid'
import { after } from 'next/server'
import {
  and,
  asc,
  brands,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  previewArticles,
  previews,
  articles,
  users,
  type Preview,
} from '@lookline/db'
import { buildLookImagePrompt, getLlm } from '@lookline/engine'
import { getDb } from './db'
import { loadLookReferences, resolveStylePreset, type ReferencePhoto } from './looks'
import { getStorage, isSafeKey } from './storage'

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function isPreviewPhotoType(mimeType: string): boolean {
  return Object.hasOwn(IMAGE_EXT, mimeType)
}

export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1_000
const GENERATION_DEADLINE_MS = 30_000
const MAX_PREVIEW_ARTICLES = 8

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
  ownerId: string,
): Promise<{ preview: Preview | null; expired: boolean }> {
  const { db } = getDb()
  const owned = and(eq(previews.id, id), eq(previews.ownerId, ownerId))
  let [preview] = await db.select().from(previews).where(owned).limit(1)
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
    preview = expired ?? (await db.select().from(previews).where(owned).limit(1))[0]!
  }
  return { preview: preview ?? null, expired: false }
}

export async function getPreviewGeneration(id: string, ownerId: string): Promise<Preview | null> {
  return (await readPreviewGeneration(id, ownerId)).preview
}

async function loadComposition(preview: Preview) {
  const { db } = getDb()
  const [items, owners] = await Promise.all([
    db
      .select({ product: articles })
      .from(previewArticles)
      .innerJoin(articles, eq(previewArticles.articleId, articles.id))
      .where(eq(previewArticles.previewId, preview.id))
      .orderBy(asc(previewArticles.position)),
    db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, preview.ownerId))
      .limit(1),
  ])
  if (!owners[0] || items.length === 0) throw new Error('Preview composition is unavailable.')
  return { articles: items.map((item) => item.product), ownerName: owners[0].displayName }
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
    const refs = await loadLookReferences(scene.articles, referencePhoto)
    const prompt = buildLookImagePrompt({
      preset: resolveStylePreset(preview.stylePreset),
      articles: refs.articles,
      ownerName: scene.ownerName,
      occasion: preview.occasion,
      hasReferencePhoto: true,
    })
    const remaining = 25_000 - (Date.now() - preview.imageStartedAt!.getTime())
    if (remaining <= 0) throw new Error('Rendering timed out.')
    const result = await getLlm().generateImage({
      prompt,
      referenceImages: refs.referenceImages,
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
      .where(
        and(
          current,
          gt(previews.expiresAt, new Date()),
          gt(previews.imageStartedAt, new Date(Date.now() - GENERATION_DEADLINE_MS)),
        ),
      )
      .returning({ id: previews.id })
    if (saved) {
      await removeArtifact(preview.imagePath)
    } else {
      await removeArtifact(key)
      await readPreviewGeneration(preview.id, preview.ownerId)
    }
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

export async function queuePreviewImage(
  id: string,
  ownerId: string,
  stylePreset?: string,
): Promise<Preview> {
  const preview = await getPreviewGeneration(id, ownerId)
  if (!preview) throw new Error('Preview not found.')
  if (preview.imageStatus === 'pending') return preview
  if (!getLlm().imageModel) throw new Error('Image rendering is unavailable.')
  const preset = resolveStylePreset(
    preview.sourceLookId ? preview.stylePreset : (stylePreset ?? preview.stylePreset),
  )
  const [claimed] = await getDb()
    .db.update(previews)
    .set({
      stylePreset: preset.slug,
      imageStatus: 'pending',
      imageGenerationId: nanoid(),
      imageStartedAt: new Date(),
      imageError: null,
    })
    .where(
      and(
        eq(previews.id, id),
        eq(previews.ownerId, ownerId),
        gt(previews.expiresAt, new Date()),
        isNull(previews.imageGenerationId),
      ),
    )
    .returning()
  if (!claimed) {
    const current = await getPreviewGeneration(id, ownerId)
    if (!current) throw new Error('Preview not found.')
    return current
  }
  after(() => finishPreview(claimed))
  return claimed
}

export async function cancelPreviewImage(
  id: string,
  ownerId: string,
  generationId: string,
): Promise<Preview | null> {
  await getDb()
    .db.update(previews)
    .set({
      imageStatus: 'failed',
      imageGenerationId: null,
      imageError: 'Rendering cancelled. Retry while this preview is available.',
    })
    .where(
      and(
        eq(previews.id, id),
        eq(previews.ownerId, ownerId),
        eq(previews.imageGenerationId, generationId),
      ),
    )
  return getPreviewGeneration(id, ownerId)
}

export async function createPreviewDraft(input: {
  ownerId: string
  articleIds: readonly string[]
  sourceLookId?: string | null
  stylePreset: string
  title: string
  occasion?: string | null
  referencePhoto: ReferencePhoto
}): Promise<Preview> {
  if (!getLlm().imageModel) throw new Error('Image rendering is unavailable.')
  const articleIds = [...new Set(input.articleIds)].slice(0, MAX_PREVIEW_ARTICLES)
  if (articleIds.length === 0) throw new Error('Choose at least one product.')
  const found = await getDb()
    .db.select({ id: articles.id })
    .from(articles)
    .where(inArray(articles.id, articleIds))
  if (found.length !== articleIds.length) throw new Error('One or more articles are unavailable.')
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
      .db.insert(previewArticles)
      .values(articleIds.map((articleId, position) => ({ previewId: id, articleId, position })))
  } catch (error) {
    await getDb()
      .db.delete(previews)
      .where(eq(previews.id, id))
      .catch(() => {})
    await removeArtifact(referencePath)
    throw error
  }
  const preview = (await getPreviewGeneration(id, input.ownerId))!
  after(() => finishPreview(preview))
  after(() => purgeExpiredPreviews())
  return preview
}

export async function loadPreviewArticles(id: string) {
  return getDb()
    .db.select({
      product: articles,
      brandName: brands.name,
      position: previewArticles.position,
    })
    .from(previewArticles)
    .innerJoin(articles, eq(previewArticles.articleId, articles.id))
    .innerJoin(brands, eq(articles.brandId, brands.id))
    .where(eq(previewArticles.previewId, id))
    .orderBy(asc(previewArticles.position))
}
