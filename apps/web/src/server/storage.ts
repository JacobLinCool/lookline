/**
 * Object storage for images: the R2 bucket bound as `STORAGE` (wrangler.jsonc). Keys are the
 * DB-stored relative paths (`looks/…`, `photos/…`, and private temporary `previews/…` assets).
 * Tests swap the bucket with `setStorage(memoryStorage())`.
 */
import { env } from 'cloudflare:workers'

export interface StoredObject {
  body: ReadableStream<Uint8Array>
  contentType: string
  size: number
  etag: string
  uploadedAt: Date
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface Storage {
  put(key: string, data: ArrayBuffer | Uint8Array | string, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(key: string): Promise<void>
}

let override: Storage | null = null
let cached: Storage | null = null

const SAFE_KEY = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)+$/

/** Only `dir/name.ext` style keys made of URL-safe characters; nothing that could traverse. */
export function isSafeKey(key: string): boolean {
  return SAFE_KEY.test(key) && !key.includes('..')
}

function r2Storage(bucket: LooklineR2Bucket): Storage {
  return {
    async put(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } })
    },
    async get(key) {
      const object = await bucket.get(key)
      if (!object) return null
      return {
        body: object.body as ReadableStream<Uint8Array>,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        size: object.size,
        etag: object.httpEtag,
        uploadedAt: object.uploaded,
        arrayBuffer: () => object.arrayBuffer(),
      }
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}

/** In-memory bucket for tests. */
export function memoryStorage(): Storage & { keys(): string[] } {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string; at: Date }>()
  return {
    keys: () => [...objects.keys()],
    async put(key, data, contentType) {
      const bytes =
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data)
      objects.set(key, { bytes: bytes.slice(), contentType, at: new Date() })
    },
    async get(key) {
      const entry = objects.get(key)
      if (!entry) return null
      const bytes = entry.bytes
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      return {
        body: new Blob([copy as ArrayBuffer]).stream() as ReadableStream<Uint8Array>,
        contentType: entry.contentType,
        size: bytes.byteLength,
        etag: `"${key}-${bytes.byteLength}"`,
        uploadedAt: entry.at,
        arrayBuffer: async () => copy as ArrayBuffer,
      }
    },
    async delete(key) {
      objects.delete(key)
    },
  }
}

/** Replace the storage for the current process (tests); `null` restores the R2 binding. */
export function setStorage(storage: Storage | null): void {
  override = storage
}

export function getStorage(): Storage {
  if (override) return override
  if (!cached) {
    const bucket = env.STORAGE
    if (!bucket) throw new Error('[lookline] R2 binding `STORAGE` is missing (see wrangler.jsonc)')
    cached = r2Storage(bucket)
  }
  return cached
}

/**
 * Stream a stored object back to the browser, honouring `If-None-Match`. Answers `null` when the
 * key is unusable, the object is gone or the read failed, which is the caller's cue to fall back
 * to whatever it can draw itself rather than to fail the request.
 */
export async function storedImageResponse(
  request: Request,
  key: string | null | undefined,
  cacheControl: string,
): Promise<Response | null> {
  if (!key || !isSafeKey(key)) return null
  try {
    const object = await getStorage().get(key)
    if (!object) return null
    if (request.headers.get('if-none-match') === object.etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: object.etag, 'Cache-Control': cacheControl },
      })
    }
    return new Response(object.body, {
      headers: {
        'Content-Type': object.contentType,
        'Content-Length': String(object.size),
        ETag: object.etag,
        'Cache-Control': cacheControl,
      },
    })
  } catch (error) {
    console.warn(`[lookline] could not read stored image ${key}`, error)
    return null
  }
}

/**
 * A stored image as a `data:` URI, for the one consumer that cannot fetch a URL: `ImageResponse`
 * renders the share image inside the worker and only inlines what it is handed. Answers `null`
 * when there is nothing to inline, and the caller draws its own poster instead.
 *
 * The bytes are encoded in chunks: `btoa(String.fromCharCode(...bytes))` spreads the whole image
 * across the argument list, and a card-sized photograph overflows the stack doing it.
 */
export async function storedDataUri(key: string | null | undefined): Promise<string | null> {
  if (!key || !isSafeKey(key)) return null
  try {
    const object = await getStorage().get(key)
    if (!object) return null
    const bytes = new Uint8Array(await object.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    return `data:${object.contentType};base64,${btoa(binary)}`
  } catch (error) {
    console.warn(`[lookline] could not inline stored image ${key}`, error)
    return null
  }
}
