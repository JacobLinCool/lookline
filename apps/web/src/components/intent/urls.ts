/**
 * URL contract of `/` (pure helpers, safe in server and client components).
 *
 *   /?q=<sentence>&clarify=<slot>:<value>&clarify=…&previous=<intentSessionId>&added=<outfitId>
 *
 * `q` is the visitor's sentence; every `clarify` is a quick-reply answer appended to it;
 * `previous` is the intent session the answer refines (dialogue state); `added` shows the
 * "added to bag" notice after `addOutfitToBagAction`.
 */

export interface IntentQuery {
  q: string
  clarify?: readonly string[]
  previous?: string | null
  added?: string | null
}

export function intentHref({ q, clarify = [], previous, added }: IntentQuery): string {
  const params = new URLSearchParams()
  params.set('q', q)
  for (const entry of clarify) params.append('clarify', entry)
  if (previous) params.set('previous', previous)
  if (added) params.set('added', added)
  return `/?${params.toString()}`
}

/** Link for a clarification option: keeps earlier answers, adds this one, points at the turn. */
export function clarifyHref(
  current: IntentQuery,
  slot: string,
  value: string,
  sessionId: string,
): string {
  const clarify = (current.clarify ?? []).filter((c) => !c.startsWith(`${slot}:`))
  clarify.push(`${slot}:${value}`)
  return intentHref({ q: current.q, clarify, previous: sessionId })
}

/** Article page link that lets `/p/[id]` log the click against the intent session. */
export function productHref(articleId: number, sessionId: string, position: number): string {
  const params = new URLSearchParams({ from: sessionId, pos: String(position) })
  return `/p/${articleId}?${params.toString()}`
}

/** "Ask a friend which is better" — owned by the Ask agent; we only link. */
export function askHref(articleIds: readonly number[], sessionId: string): string {
  const params = new URLSearchParams({ articles: articleIds.join(','), from: sessionId })
  return `/asks/new?${params.toString()}`
}

/** Normalise a `searchParams` value that may repeat. */
export function paramList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function paramString(value: string | string[] | undefined): string {
  if (value === undefined) return ''
  return Array.isArray(value) ? (value[0] ?? '') : value
}
