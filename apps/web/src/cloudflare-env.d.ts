/**
 * Runtime types for the Cloudflare bindings this app uses (wrangler.jsonc). Kept minimal and
 * local on purpose: `@cloudflare/workers-types` redefines DOM globals (`Response.json()` becomes
 * `unknown`, `Buffer` loses its Node signature) and breaks the React client code that shares this
 * TypeScript program. Only the members we call are declared; the real objects are supersets.
 */

/** Cloudflare D1 binding (what `drizzle-orm/d1` needs). */
interface LooklineD1Database {
  prepare(query: string): unknown
  batch(statements: unknown[]): Promise<unknown>
  exec(query: string): Promise<unknown>
}

interface LooklineR2Object {
  key: string
  size: number
  httpEtag: string
  uploaded: Date
  httpMetadata?: { contentType?: string }
  body: ReadableStream<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
}

/** Cloudflare R2 bucket binding. */
interface LooklineR2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  get(key: string): Promise<LooklineR2Object | null>
  delete(keys: string | string[]): Promise<void>
}

declare namespace Cloudflare {
  interface Env {
    DB: LooklineD1Database
    STORAGE: LooklineR2Bucket
    ASSETS: unknown
    [name: string]: unknown
  }
}

declare module 'cloudflare:workers' {
  /** Bindings and vars of the running Worker (dev: wrangler.jsonc + .dev.vars). */
  export const env: Cloudflare.Env
}
