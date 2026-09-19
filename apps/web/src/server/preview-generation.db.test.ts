import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  brands,
  count,
  eq,
  insertAll,
  interactions,
  lookArticles,
  looks,
  previewArticles,
  previews,
  articles,
  users,
} from '@lookline/db'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import { fixtureBrands, makeProduct } from '@lookline/engine/testing'
import { setLlm, type LlmImageResult } from '@lookline/engine'

const scheduled = vi.hoisted(() => [] as (() => Promise<unknown>)[])
vi.mock('next/server', () => ({ after: (work: () => Promise<unknown>) => scheduled.push(work) }))

import {
  cancelPreviewImage,
  createPreviewDraft,
  getPreviewGeneration,
  queuePreviewImage,
  readPreviewGeneration,
} from './preview-generation'
import { setDb } from './db'
import { loadPreviewSourceLook } from './preview-source'
import { memoryStorage, setStorage } from './storage'

describe('temporary preview generation', () => {
  const ownerId = 'preview_owner'
  let handle: DbHandle
  let storage: ReturnType<typeof memoryStorage>
  let articleId: string

  beforeAll(async () => {
    handle = await createTestDb()
    setDb(handle.db)
    const brandRecords = fixtureBrands(1)
    await insertAll(
      handle.db,
      brands,
      brandRecords.map((brand) => ({
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        tier: brand.tier,
        homeAesthetics: brand.homeAesthetics,
        homeDepartments: brand.homeDepartments,
        priceMultiplier: brand.priceMultiplier,
        origin: null,
        description: null,
      })),
      { maxParams: 30_000 },
    )
    const { brandName: _brandName, ...product } = makeProduct(1, 1, brandRecords)
    await handle.db.insert(articles).values(product)
    articleId = product.id
    await handle.db.insert(users).values({
      id: ownerId,
      handle: ownerId,
      displayName: 'Preview Owner',
      avatarSeed: 3,
      isGuest: false,
    })
    await handle.db.insert(users).values({
      id: 'preview_viewer',
      handle: 'preview_viewer',
      displayName: 'Preview Viewer',
      avatarSeed: 4,
      isGuest: false,
    })
  })

  beforeEach(async () => {
    scheduled.length = 0
    storage = memoryStorage()
    setStorage(storage)
    await handle.db.delete(previews)
    setLlm({
      provider: 'offline',
      textModel: null,
      imageModel: 'test-image',
      generateJson: async () => null,
      generateImage: async () => ({
        data: Buffer.from('preview-image'),
        mimeType: 'image/png',
        provider: 'openai',
        model: 'test-image',
      }),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  afterAll(async () => {
    setLlm(null)
    setDb(null)
    setStorage(null)
    await handle.close()
  })

  const draft = () =>
    createPreviewDraft({
      ownerId,
      articleIds: [articleId],
      stylePreset: 'studio-minimal',
      title: 'Private preview',
      referencePhoto: { mimeType: 'image/png', data: Buffer.from('owner-photo') },
    })

  it.each(['timed out', 'expired'])('does not mutate another owner’s %s preview', async (state) => {
    const preview = await draft()
    await handle.db
      .update(previews)
      .set(
        state === 'expired'
          ? { expiresAt: new Date(Date.now() - 1_000) }
          : { imageStartedAt: new Date(Date.now() - 31_000) },
      )
      .where(eq(previews.id, preview.id))

    expect(await readPreviewGeneration(preview.id, 'preview_viewer')).toEqual({
      preview: null,
      expired: false,
    })
    await expect(queuePreviewImage(preview.id, 'preview_viewer')).rejects.toThrow(
      'Preview not found.',
    )
    expect(
      await cancelPreviewImage(preview.id, 'preview_viewer', preview.imageGenerationId!),
    ).toBeNull()
    const [untouched] = await handle.db.select().from(previews).where(eq(previews.id, preview.id))
    expect(untouched?.imageStatus).toBe('pending')
    expect(untouched?.imageGenerationId).toBe(preview.imageGenerationId)
    expect(storage.keys()).toEqual([preview.referencePath])

    const owned = await readPreviewGeneration(preview.id, ownerId)
    if (state === 'expired') {
      expect(owned).toEqual({ preview: null, expired: true })
      expect(storage.keys()).toEqual([])
    } else {
      expect(owned.preview?.imageStatus).toBe('failed')
    }
  })

  it('removes the previous image only after its replacement is ready', async () => {
    const preview = await draft()
    await scheduled.shift()!()
    const ready = await getPreviewGeneration(preview.id, ownerId)
    expect(ready?.imagePath).toBeTruthy()
    scheduled.length = 0
    await queuePreviewImage(preview.id, ownerId, 'paris-editorial')
    expect(storage.keys()).toContain(ready!.imagePath)
    await scheduled.shift()!()
    const replaced = await getPreviewGeneration(preview.id, ownerId)
    expect(replaced?.imageStatus).toBe('ready')
    expect(replaced?.imagePath).not.toBe(ready!.imagePath)
    expect(storage.keys().toSorted()).toEqual(
      [preview.referencePath, replaced!.imagePath].toSorted(),
    )
  })

  it('keeps the stored style when retrying a borrowed composition', async () => {
    const sourceId = 'lk_preview_style'
    await handle.db.insert(looks).values({
      id: sourceId,
      ownerId,
      title: 'Source',
      stylePreset: 'studio-minimal',
      visibility: 'public',
      shareToken: 'preview-style',
      imageStatus: 'ready',
    })
    const preview = await draft()
    await handle.db
      .update(previews)
      .set({ sourceLookId: sourceId })
      .where(eq(previews.id, preview.id))
    await scheduled.shift()!()
    const retried = await queuePreviewImage(preview.id, ownerId, 'paris-editorial')
    expect(retried.stylePreset).toBe('studio-minimal')
    await handle.db.delete(looks).where(eq(looks.id, sourceId))
  })

  it.each(['deadline', 'expiry'])('discards a result arriving after its %s', async (boundary) => {
    let resolveImage!: (value: LlmImageResult | null) => void
    setLlm({
      provider: 'offline',
      textModel: null,
      imageModel: 'test-image',
      generateJson: async () => null,
      generateImage: () =>
        new Promise((resolve) => {
          resolveImage = resolve
        }),
    })
    const preview = await draft()
    const work = scheduled.shift()!()
    await vi.waitFor(() => expect(resolveImage).toBeTypeOf('function'))
    await handle.db
      .update(previews)
      .set(
        boundary === 'expiry'
          ? { expiresAt: new Date(Date.now() - 1_000) }
          : { imageStartedAt: new Date(Date.now() - 31_000) },
      )
      .where(eq(previews.id, preview.id))
    resolveImage({
      data: Buffer.from('late-image'),
      mimeType: 'image/png',
      provider: 'openai',
      model: 'test-image',
    })
    await work
    const result = await getPreviewGeneration(preview.id, ownerId)
    expect(result?.imageStatus ?? null).toBe(boundary === 'expiry' ? null : 'failed')
    expect(storage.keys()).toEqual(boundary === 'expiry' ? [] : [preview.referencePath])
  })

  it('renders unpurchased articles without creating a Look or social event', async () => {
    const preview = await createPreviewDraft({
      ownerId,
      articleIds: [articleId],
      stylePreset: 'studio-minimal',
      title: 'Before checkout',
      referencePhoto: { mimeType: 'image/jpeg', data: Buffer.from('owner-photo') },
    })

    expect(preview.imageStatus).toBe('pending')
    expect(storage.keys()).toEqual([`preview-references/${preview.id}.jpg`])
    expect(scheduled).toHaveLength(2)
    await scheduled.shift()!()

    const ready = await getPreviewGeneration(preview.id, ownerId)
    expect(ready?.imageStatus).toBe('ready')
    expect(ready?.imagePath).toMatch(new RegExp(`^previews/${preview.id}-.*\\.png$`))
    expect((await handle.db.select({ n: count() }).from(looks))[0]?.n).toBe(0)
    expect((await handle.db.select({ n: count() }).from(interactions))[0]?.n).toBe(0)
    expect((await handle.db.select({ n: count() }).from(previewArticles))[0]?.n).toBe(1)

    await handle.db
      .update(previews)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(previews.id, preview.id))
    expect(await getPreviewGeneration(preview.id, ownerId)).toBeNull()
    expect(storage.keys()).toEqual([])
  })

  it('rejects a stale completion after cancellation', async () => {
    let resolveImage!: (value: LlmImageResult | null) => void
    setLlm({
      provider: 'offline',
      textModel: null,
      imageModel: 'test-image',
      generateJson: async () => null,
      generateImage: async () =>
        new Promise<LlmImageResult | null>((resolve) => {
          resolveImage = resolve
        }),
    })
    const preview = await createPreviewDraft({
      ownerId,
      articleIds: [articleId],
      stylePreset: 'studio-minimal',
      title: 'Cancelable preview',
      referencePhoto: { mimeType: 'image/png', data: Buffer.from('owner-photo') },
    })
    const work = scheduled.shift()!()
    await vi.waitFor(() => expect(resolveImage).toBeTypeOf('function'))
    await cancelPreviewImage(preview.id, ownerId, preview.imageGenerationId!)
    resolveImage({
      data: Buffer.from('stale'),
      mimeType: 'image/png',
      provider: 'openai',
      model: 'test-image',
    })
    await work

    const cancelled = await getPreviewGeneration(preview.id, ownerId)
    expect(cancelled?.imageStatus).toBe('failed')
    expect(cancelled?.imagePath).toBeNull()
    expect(storage.keys()).toEqual([`preview-references/${preview.id}.png`])
  })

  it('borrows exact articles only from a Look the viewer can open', async () => {
    await handle.db.insert(looks).values([
      {
        id: 'lk_preview_public',
        ownerId,
        title: 'Public source',
        stylePreset: 'paris-editorial',
        visibility: 'public',
        shareToken: 'preview-public',
        imageStatus: 'ready',
      },
      {
        id: 'lk_preview_link',
        ownerId,
        title: 'Link source',
        stylePreset: 'studio-minimal',
        visibility: 'link',
        shareToken: 'preview-link',
        imageStatus: 'ready',
      },
      {
        id: 'lk_preview_private',
        ownerId,
        title: 'Private source',
        stylePreset: 'studio-minimal',
        visibility: 'private',
        shareToken: 'preview-private',
        imageStatus: 'ready',
      },
    ])
    await handle.db.insert(lookArticles).values([
      { lookId: 'lk_preview_public', articleId, position: 0 },
      { lookId: 'lk_preview_link', articleId, position: 0 },
      { lookId: 'lk_preview_private', articleId, position: 0 },
    ])

    const publicSource = await loadPreviewSourceLook('lk_preview_public', 'preview_viewer')
    const linkSource = await loadPreviewSourceLook('lk_preview_link', 'preview_viewer')
    const privateSource = await loadPreviewSourceLook('lk_preview_private', 'preview_viewer')
    const ownerSource = await loadPreviewSourceLook('lk_preview_private', ownerId)

    expect(publicSource?.articleIds).toEqual([articleId])
    expect(publicSource?.look.stylePreset).toBe('paris-editorial')
    expect(linkSource?.articleIds).toEqual([articleId])
    expect(privateSource).toBeNull()
    expect(ownerSource?.articleIds).toEqual([articleId])

    await handle.db.delete(looks)
  })
})
