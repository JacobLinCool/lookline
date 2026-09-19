import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { brands, eq, insertAll, looks, articles, users } from '@lookline/db'
import { createTestDb, type DbHandle } from '@lookline/db/node'
import { generateBrands, generateProduct } from '@lookline/catalog'
import { setLlm, type LlmImageResult } from '@lookline/engine'

const scheduled = vi.hoisted(() => [] as (() => Promise<void>)[])
vi.mock('next/server', () => ({ after: (work: () => Promise<void>) => scheduled.push(work) }))
import { createLookDraft, getLookGeneration, queueLookImage } from './look-generation'
import { setDb } from './db'
import { memoryStorage, setStorage } from './storage'

/**
 * Persisted image operations against an in-memory SQLite database and an in-memory bucket: the
 * draft is a plain composition (no stored object), a claimed generation writes `looks/<id>-<gen>`
 * to storage, stale completions are rejected, abandoned leases become retryable failures.
 */
describe('persisted image operations', () => {
  const ownerId = 'qa_latency_owner'
  let handle: DbHandle
  let storage: ReturnType<typeof memoryStorage>
  let articleId: number
  beforeAll(async () => {
    handle = await createTestDb()
    setDb(handle.db)
    storage = memoryStorage()
    setStorage(storage)
    const brandRecords = generateBrands(1)
    await insertAll(
      handle.db,
      brands,
      brandRecords.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        tier: b.tier,
        homeAesthetics: b.homeAesthetics,
        homeDepartments: b.homeDepartments,
        priceMultiplier: b.priceMultiplier,
        origin: b.origin,
        description: b.description,
      })),
      { maxParams: 30_000 },
    )
    const product = generateProduct(1, 1, brandRecords)
    await handle.db.insert(articles).values(product)
    articleId = product.id
    await handle.db.insert(users).values({
      id: ownerId,
      handle: ownerId,
      displayName: 'Latency QA',
      avatarSeed: 42,
      isGuest: true,
    })
  })
  afterAll(async () => {
    setLlm(null)
    setDb(null)
    setStorage(null)
    await handle.close()
  })

  it('returns a composition before the provider runs, deduplicates jobs, and rejects stale completion', async () => {
    let resolveImage!: (result: LlmImageResult | null) => void
    const generateImage = vi.fn(
      () =>
        new Promise<LlmImageResult | null>((resolve) => {
          resolveImage = resolve
        }),
    )
    setLlm({
      provider: 'offline',
      textModel: null,
      imageModel: 'test-image',
      generateJson: async () => null,
      generateImage,
    })
    const id = 'qa_look_1'
    const draft = await createLookDraft({
      id,
      ownerId,
      articleIds: [articleId],
      stylePreset: 'studio-minimal',
      title: 'Latency composition',
    })
    expect(draft.imageStatus).toBe('pending')
    expect(draft.imagePath).toBeNull()
    expect(storage.keys()).toEqual([])
    expect(generateImage).not.toHaveBeenCalled()
    expect((await queueLookImage(id)).imageGenerationId).toBe(draft.imageGenerationId)
    expect(scheduled).toHaveLength(2) // preference update + one render
    const render = scheduled.pop()!
    scheduled.length = 0 // this test does not train preferences
    const work = render()
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledOnce())
    await handle.db
      .update(looks)
      .set({ imageGenerationId: null, imageStatus: 'failed', imageError: 'Cancelled' })
      .where(eq(looks.id, id))
    resolveImage({
      data: Buffer.from('stale'),
      mimeType: 'image/png',
      provider: 'openai',
      model: 'test-image',
    })
    await work
    const preserved = await getLookGeneration(id)
    expect(preserved?.imagePath).toBeNull()
    expect(preserved?.imageStatus).toBe('failed')
    expect(storage.keys()).toEqual([])

    setLlm({
      provider: 'offline',
      textModel: null,
      imageModel: 'test-image',
      generateJson: async () => null,
      generateImage: async () => ({
        data: Buffer.from('new'),
        mimeType: 'image/png',
        provider: 'openai',
        model: 'test-image',
      }),
    })
    const retry = await queueLookImage(id)
    expect(retry.imageGenerationId).not.toBe(draft.imageGenerationId)
    await scheduled.pop()!()
    const completed = await getLookGeneration(id)
    expect(completed?.imageStatus).toBe('ready')
    expect(completed?.imageGenerationId).toBeNull()
    expect(completed?.imagePath).toBe(`looks/${id}-${retry.imageGenerationId}.png`)
    const stored = await storage.get(completed!.imagePath!)
    expect(stored?.contentType).toBe('image/png')
    expect(new TextDecoder().decode(await stored!.arrayBuffer())).toBe('new')
  })

  it('turns a lease abandoned by a worker into a retryable failure without losing its visual', async () => {
    const id = 'qa_look_1'
    const previous = await getLookGeneration(id)
    await handle.db
      .update(looks)
      .set({
        imageStatus: 'pending',
        imageGenerationId: 'abandoned',
        imageStartedAt: new Date(Date.now() - 31_000),
      })
      .where(eq(looks.id, id))
    const expired = await getLookGeneration(id)
    expect(expired?.imageStatus).toBe('failed')
    expect(expired?.imageGenerationId).toBeNull()
    expect(expired?.imageError).toContain('timed out')
    expect(expired?.imagePath).toBe(previous?.imagePath)
  })
})
