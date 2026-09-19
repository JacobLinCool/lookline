/**
 * The origin this request arrived on, for absolute URLs in shared metadata.
 *
 * Taken from the request rather than from configuration: the app is served from whatever host the
 * Worker is routed to, and a canonical or Open Graph image pointing at localhost is worse than
 * none at all. `x-forwarded-proto` is trusted because the only thing in front of the Worker is
 * Cloudflare itself.
 */
import { headers } from 'next/headers'

export async function siteOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('host')
  if (!host) return 'https://lookline.app'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
