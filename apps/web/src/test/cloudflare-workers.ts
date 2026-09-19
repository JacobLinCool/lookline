/**
 * Vitest stand-in for the `cloudflare:workers` module. Unit tests never touch real bindings:
 * `setDb` / `setStorage` inject an in-memory database and bucket instead.
 */
export const env: Record<string, unknown> = {}
