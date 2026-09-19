import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { assertGrounded, groundingViolations } from './guard'
import { createLlmClient, resolveProviderChain } from './client'
import { prepareSchema } from './json-schema'
import type { ImageAdapter, TextAdapter } from './types'
import { withTimeout } from './timeout'

afterEach(() => vi.useRealTimers())

describe('shared deadline and cancellation', () => {
  it('does not give a second provider a fresh text budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const first = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 70))
      throw new Error('busy')
    })
    let secondSignal: AbortSignal | undefined
    const second = vi.fn(({ signal }: { signal: AbortSignal }) => {
      secondSignal = signal
      return new Promise<never>(() => {})
    })
    const client = createLlmClient({
      textTimeoutMs: 100,
      warn: () => {},
      textAdapters: [
        { provider: 'openai', model: 'first', generateJson: first },
        { provider: 'gemini', model: 'second', generateJson: second },
      ],
    })
    const result = client.generateJson({ schema: Schema, system: '', prompt: '' })
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBeNull()
    expect(second).toHaveBeenCalledOnce()
    expect(secondSignal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts a hanging provider on caller cancellation without trying another provider', async () => {
    const controller = new AbortController()
    const signals: AbortSignal[] = []
    const generateJson = vi.fn(({ signal }: { signal: AbortSignal }) => {
      signals.push(signal)
      return new Promise<never>(() => {})
    })
    const client = createLlmClient({
      warn: () => {},
      textAdapters: [
        { provider: 'openai', model: 'first', generateJson },
        { provider: 'gemini', model: 'second', generateJson },
      ],
    })
    const result = client.generateJson({
      schema: Schema,
      system: '',
      prompt: '',
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort(new Error('superseded'))
    expect(await result).toBeNull()
    expect(signals[0]?.aborted).toBe(true)
    expect(generateJson).toHaveBeenCalledOnce()
  })

  it('handles synchronous failures and already-aborted requests without leaking timers', async () => {
    vi.useFakeTimers()
    await expect(
      withTimeout(100, () => {
        throw new Error('sync')
      }),
    ).rejects.toThrow('sync')
    const fn = vi.fn(async () => 1)
    await expect(withTimeout(100, fn, AbortSignal.abort(new Error('cancelled')))).rejects.toThrow(
      'cancelled',
    )
    expect(fn).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shares the image budget and ignores a late provider completion', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    let complete!: (value: {
      data: Buffer
      mimeType: string
      model: string
      provider: 'openai'
    }) => void
    const backup = vi.fn()
    const client = createLlmClient({
      imageTimeoutMs: 100,
      warn: () => {},
      imageAdapters: [
        {
          provider: 'openai',
          model: 'first',
          generateImage: () =>
            new Promise((resolve) => {
              complete = resolve
            }),
        },
        { provider: 'gemini', model: 'second', generateImage: backup },
      ],
    })
    const result = client.generateImage({ prompt: 'image' })
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBeNull()
    complete({
      data: Buffer.from('late'),
      mimeType: 'image/png',
      model: 'first',
      provider: 'openai',
    })
    expect(backup).not.toHaveBeenCalled()
    expect(await result).toBeNull()
  })
})

const Schema = z.object({
  colour: z.enum(['black', 'white']),
  amount: z.number().int(),
  note: z.string().optional(),
  tags: z.array(z.string()).max(3).default([]),
})

const adapter = (
  provider: 'openai' | 'gemini',
  impl: () => Promise<unknown>,
  calls: string[],
): TextAdapter => ({
  provider,
  model: `${provider}-model`,
  generateJson: async () => {
    calls.push(provider)
    return impl()
  },
})

const rateLimited = (): Promise<never> => {
  const e = new Error('Rate limit') as Error & { status: number }
  e.status = 429
  return Promise.reject(e)
}

describe('provider resolution', () => {
  it('orders openai → gemini by configured keys, honours overrides', () => {
    expect(resolveProviderChain({ OPENAI_API_KEY: 'a', GEMINI_API_KEY: 'b' }, undefined)).toEqual([
      'openai',
      'gemini',
    ])
    expect(resolveProviderChain({ GEMINI_API_KEY: 'b' }, undefined)).toEqual(['gemini'])
    expect(resolveProviderChain({ OPENAI_API_KEY: 'a', GEMINI_API_KEY: 'b' }, 'gemini')).toEqual([
      'gemini',
      'openai',
    ])
    expect(resolveProviderChain({ OPENAI_API_KEY: 'a' }, 'gemini')).toEqual(['openai'])
    expect(resolveProviderChain({ OPENAI_API_KEY: 'a' }, 'offline')).toEqual([])
    expect(resolveProviderChain({}, undefined)).toEqual([])
  })

  it('offline client without keys', async () => {
    const client = createLlmClient({ env: {}, warn: () => {} })
    expect(client.provider).toBe('offline')
    expect(client.textModel).toBeNull()
    expect(client.imageModel).toBeNull()
    expect(await client.generateJson({ schema: Schema, system: '', prompt: '' })).toBeNull()
    expect(await client.generateImage({ prompt: 'x' })).toBeNull()
  })
})

describe('generateJson chain', () => {
  it('429 on the first provider falls through to the next; validated output is returned', async () => {
    const calls: string[] = []
    const warnings: string[] = []
    const client = createLlmClient({
      textAdapters: [
        adapter('openai', rateLimited, calls),
        adapter(
          'gemini',
          async () => ({ colour: 'black', amount: 5, note: null, tags: ['a'] }),
          calls,
        ),
      ],
      warn: (m) => warnings.push(m),
    })
    expect(client.provider).toBe('openai')
    const out = await client.generateJson({
      schema: Schema,
      system: 's',
      prompt: 'p',
      purpose: 'test',
    })
    expect(out).toEqual({ colour: 'black', amount: 5, tags: ['a'] })
    expect(calls).toEqual(['openai', 'gemini'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('429')
  })

  it('every provider failing (429, invalid schema) → null with one warning each', async () => {
    const calls: string[] = []
    const warnings: string[] = []
    const client = createLlmClient({
      textAdapters: [
        adapter('openai', rateLimited, calls),
        adapter('gemini', async () => ({ colour: 'purple' }), calls),
      ],
      warn: (m) => warnings.push(m),
    })
    expect(await client.generateJson({ schema: Schema, system: 's', prompt: 'p' })).toBeNull()
    expect(warnings).toHaveLength(2)
  })

  it('timeouts abort and return null', async () => {
    const warnings: string[] = []
    const slow: TextAdapter = {
      provider: 'openai',
      model: 'm',
      generateJson: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    }
    const client = createLlmClient({
      textAdapters: [slow],
      textTimeoutMs: 5,
      warn: (m) => warnings.push(m),
    })
    expect(await client.generateJson({ schema: Schema, system: 's', prompt: 'p' })).toBeNull()
    expect(warnings[0]).toContain('timed out')
  })

  it('image chain falls back and reports the provider that produced the image', async () => {
    const failing: ImageAdapter = { provider: 'gemini', model: 'g-img', generateImage: rateLimited }
    const ok: ImageAdapter = {
      provider: 'openai',
      model: 'o-img',
      generateImage: async () => ({
        mimeType: 'image/png',
        data: Buffer.from('x'),
        provider: 'openai',
        model: 'o-img',
      }),
    }
    const client = createLlmClient({
      textAdapters: [],
      imageAdapters: [failing, ok],
      warn: () => {},
    })
    expect(client.imageModel).toBe('g-img')
    const img = await client.generateImage({ prompt: 'p' })
    expect(img?.provider).toBe('openai')
  })
})

describe('prepareSchema', () => {
  it('produces a strict schema with nullable optionals and strips nulls back', () => {
    const { jsonSchema, stripOptionalNulls } = prepareSchema(Schema)
    expect(jsonSchema.additionalProperties).toBe(false)
    expect(jsonSchema.required).toEqual(['colour', 'amount', 'note', 'tags'])
    const note = (jsonSchema.properties as Record<string, unknown>).note as { anyOf: unknown[] }
    expect(note.anyOf).toHaveLength(2)
    expect(JSON.stringify(jsonSchema)).not.toContain('maxItems')
    expect(stripOptionalNulls({ colour: 'black', amount: 1, note: null, tags: [] })).toEqual({
      colour: 'black',
      amount: 1,
      tags: [],
    })
    const nested = z.object({
      items: z.array(z.object({ a: z.string().optional(), b: z.string().nullable() })),
    })
    const p = prepareSchema(nested)
    expect(p.stripOptionalNulls({ items: [{ a: null, b: null }] })).toEqual({
      items: [{ b: null }],
    })
  })
})

describe('assertGrounded', () => {
  const evidence = ['matches quiet luxury (0.82)', 'brand Northline, NT$3,200', 'for Alice']
  it('accepts grounded text', () => {
    expect(
      assertGrounded('Quiet luxury piece from Northline at NT$3,200 for Alice.', evidence),
    ).toBe(true)
  })
  it('rejects a foreign number and a foreign brand name', () => {
    expect(groundingViolations('Northline at NT$2,900.', evidence)).toEqual(['2,900'])
    expect(groundingViolations('A great pick from Zara.', evidence)).toEqual(['Zara'])
    expect(assertGrounded('Perfect for gorpcore weekends.', evidence)).toBe(false)
  })
})
