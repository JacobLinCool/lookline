import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  brands,
  count,
  eq,
  insertAll,
  interactions,
  lookProducts,
  looks,
  previewProducts,
  previews,
  products,
  users,
} from '@lookline/db'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import { generateBrands, generateProduct } from '@lookline/catalog'
import { setLlm, type LlmImageResult } from '@lookline/engine'

const scheduled = vi.hoisted(() => [] as (() => Promise<unknown>)[])
vi.mock('next/server', () => ({ after: (work: () => Promise<unknown>) => scheduled.push(work) }))

import { cancelPreviewImage, createPreviewDraft, getPreviewGeneration } from './preview-generation'
import { setDb } from './db'
import { loadPreviewSourceLook } from './preview-source'
import { memoryStorage, setStorage } from './storage'

describe('temporary preview generation', () => {
  const ownerId = 'preview_owner'
  let handle: DbHandle
  let storage: ReturnType<typeof memoryStorage>
  let productId: number

  beforeAll(async () => {
    handle = await createTestDb()
    setDb(handle.db)
    const brandRecords = generateBrands(1)
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
        origin: brand.origin,
        description: brand.description,
      })),
      { maxParams: 30_000 },
    )
    const product = generateProduct(1, 1, brandRecords)
    await handle.db.insert(products).values(product)
    productId = product.id
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

  afterAll(async () => {
    setLlm(null)
    setDb(null)
    setStorage(null)
    await handle.close()
  })

  it('renders unpurchased products without creating a Look or social event', async () => {
    const preview = await createPreviewDraft({
      ownerId,
      productIds: [productId],
      stylePreset: 'studio-minimal',
      title: 'Before checkout',
      referencePhoto: { mimeType: 'image/jpeg', data: Buffer.from('owner-photo') },
    })

    expect(preview.imageStatus).toBe('pending')
    expect(storage.keys()).toEqual([`preview-references/${preview.id}.jpg`])
    expect(scheduled).toHaveLength(2)
    await scheduled.shift()!()

    const ready = await getPreviewGeneration(preview.id)
    expect(ready?.imageStatus).toBe('ready')
    expect(ready?.imagePath).toMatch(new RegExp(`^previews/${preview.id}-.*\\.png$`))
    expect((await handle.db.select({ n: count() }).from(looks))[0]?.n).toBe(0)
    expect((await handle.db.select({ n: count() }).from(interactions))[0]?.n).toBe(0)
    expect((await handle.db.select({ n: count() }).from(previewProducts))[0]?.n).toBe(1)

    await handle.db
      .update(previews)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(previews.id, preview.id))
    expect(await getPreviewGeneration(preview.id)).toBeNull()
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
      productIds: [productId],
      stylePreset: 'studio-minimal',
      title: 'Cancelable preview',
      referencePhoto: { mimeType: 'image/png', data: Buffer.from('owner-photo') },
    })
    const work = scheduled.shift()!()
    await vi.waitFor(() => expect(resolveImage).toBeTypeOf('function'))
    await cancelPreviewImage(preview.id, preview.imageGenerationId!)
    resolveImage({
      data: Buffer.from('stale'),
      mimeType: 'image/png',
      provider: 'openai',
      model: 'test-image',
    })
    await work

    const cancelled = await getPreviewGeneration(preview.id)
    expect(cancelled?.imageStatus).toBe('failed')
    expect(cancelled?.imagePath).toBeNull()
    expect(storage.keys()).toEqual([`preview-references/${preview.id}.png`])
  })

  it('borrows exact products only from a Look the viewer can open', async () => {
    await handle.db.insert(looks).values([
      {
        id: 'lk_preview_public',
        ownerId,
        title: 'Public source',
        stylePreset: 'editorial-warm',
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
    await handle.db.insert(lookProducts).values([
      { lookId: 'lk_preview_public', productId, position: 0 },
      { lookId: 'lk_preview_link', productId, position: 0 },
      { lookId: 'lk_preview_private', productId, position: 0 },
    ])

    const publicSource = await loadPreviewSourceLook('lk_preview_public', 'preview_viewer')
    const linkSource = await loadPreviewSourceLook('lk_preview_link', 'preview_viewer')
    const privateSource = await loadPreviewSourceLook('lk_preview_private', 'preview_viewer')
    const ownerSource = await loadPreviewSourceLook('lk_preview_private', ownerId)

    expect(publicSource?.productIds).toEqual([productId])
    expect(publicSource?.look.stylePreset).toBe('editorial-warm')
    expect(linkSource?.productIds).toEqual([productId])
    expect(privateSource).toBeNull()
    expect(ownerSource?.productIds).toEqual([productId])

    await handle.db.delete(looks)
  })
})
