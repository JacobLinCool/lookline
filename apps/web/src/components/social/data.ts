import {
  and,
  brands,
  desc,
  eq,
  inArray,
  interactions,
  lookArticles,
  looks,
  articles,
  users,
  type Database,
  type Look,
  type Article,
  type User,
} from '@lookline/db'
import {
  getUserNetwork,
  recordInteraction,
  STYLE_PRESETS,
  type InteractionInput,
  type UserSummary,
} from '@lookline/engine'
import type { Locale } from '@/i18n/config'
import { facetLabel } from '@/i18n/taxonomy'
import { getDb } from '@/server/db'

/**
 * Server-only data loaders shared by the social primitives (shared Look view, Make It Mine,
 * Together). Reads go straight to Drizzle; every engine call is wrapped by `attempt` so a stub
 * that throws "not implemented yet" degrades to a Notice instead of a crash.
 */

export type ShopProduct = Article & { brandName: string }

export interface LookBundle {
  look: Look
  owner: User
  articles: ShopProduct[]
}

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: string }

/** Run an engine call and capture its failure as a message instead of throwing. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Products (with brand name) by id, returned in the order of `ids`; unknown ids are dropped. */
export async function loadProductsByIds(ids: readonly string[]): Promise<ShopProduct[]> {
  const unique = [...new Set(ids.filter((id) => /^\d{10}$/.test(id)))]
  if (unique.length === 0) return []
  const rows = await getDb()
    .db.select({ product: articles, brandName: brands.name })
    .from(articles)
    .innerJoin(brands, eq(articles.brandId, brands.id))
    .where(inArray(articles.id, unique))
  const byId = new Map(rows.map((r) => [r.product.id, { ...r.product, brandName: r.brandName }]))
  return unique.flatMap((id) => {
    const p = byId.get(id)
    return p ? [p] : []
  })
}

/** Products of a Look in position order. */
export async function loadLookProducts(lookId: string): Promise<ShopProduct[]> {
  const rows = await getDb()
    .db.select({ product: articles, brandName: brands.name, position: lookArticles.position })
    .from(lookArticles)
    .innerJoin(articles, eq(lookArticles.articleId, articles.id))
    .innerJoin(brands, eq(articles.brandId, brands.id))
    .where(eq(lookArticles.lookId, lookId))
  return rows
    .toSorted((a, b) => a.position - b.position)
    .map((r) => ({ ...r.product, brandName: r.brandName }))
}

async function bundleLook(
  row: { look: Look; owner: User } | undefined,
): Promise<LookBundle | null> {
  if (!row) return null
  return { look: row.look, owner: row.owner, articles: await loadLookProducts(row.look.id) }
}

/** A Look by id with its owner and articles, or null. */
export async function loadLookById(id: string): Promise<LookBundle | null> {
  const [row] = await getDb()
    .db.select({ look: looks, owner: users })
    .from(looks)
    .innerJoin(users, eq(looks.ownerId, users.id))
    .where(eq(looks.id, id))
    .limit(1)
  return bundleLook(row)
}

/** A Look by share token. Private Looks are not reachable by token. */
export async function loadLookByToken(token: string): Promise<LookBundle | null> {
  const [row] = await getDb()
    .db.select({ look: looks, owner: users })
    .from(looks)
    .innerJoin(users, eq(looks.ownerId, users.id))
    .where(eq(looks.shareToken, token))
    .limit(1)
  if (!row || row.look.visibility === 'private') return null
  return bundleLook(row)
}

/** Latest Looks of one user (any visibility — the caller decides what to show). */
export async function loadUserLooks(userId: string, limit = 6): Promise<Look[]> {
  return getDb()
    .db.select()
    .from(looks)
    .where(eq(looks.ownerId, userId))
    .orderBy(desc(looks.createdAt))
    .limit(limit)
}

/** A user by id, or null. */
export async function loadUser(id: string): Promise<User | null> {
  const [row] = await getDb().db.select().from(users).where(eq(users.id, id)).limit(1)
  return row ?? null
}

/** A user by handle (case-insensitive, leading `@` tolerated), or null. */
export async function loadUserByHandle(handle: string): Promise<User | null> {
  const clean = handle.trim().replace(/^@/, '').toLowerCase()
  if (!clean) return null
  const [row] = await getDb().db.select().from(users).where(eq(users.handle, clean)).limit(1)
  return row ?? null
}

/**
 * Record an interaction unless an identical one (actor, type, look, target) already exists.
 * Used for the edges the web layer writes itself (VIEW, REACT, INSPIRE, STYLE) so a
 * page refresh or an engine that also writes the edge cannot double-count. Never throws.
 */
export async function ensureInteraction(
  db: Database,
  input: InteractionInput,
): Promise<{ ok: boolean; existed: boolean; error?: string }> {
  try {
    const conditions = [
      eq(interactions.actorUserId, input.actorUserId),
      eq(interactions.type, input.type),
    ]
    if (input.lookId) conditions.push(eq(interactions.lookId, input.lookId))
    if (input.targetUserId) conditions.push(eq(interactions.targetUserId, input.targetUserId))
    if (input.articleId) conditions.push(eq(interactions.articleId, input.articleId))
    const existing = await db
      .select({ id: interactions.id })
      .from(interactions)
      .where(and(...conditions))
      .limit(1)
    if (existing.length > 0) return { ok: true, existed: true }
    await recordInteraction(db, input)
    return { ok: true, existed: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[social] recordInteraction(${input.type}) failed: ${message}`)
    return { ok: false, existed: false, error: message }
  }
}

/** Record an interaction every time (VIEW). Never throws. */
export async function logInteraction(db: Database, input: InteractionInput): Promise<boolean> {
  try {
    await recordInteraction(db, input)
    return true
  } catch (error) {
    console.warn(
      `[social] recordInteraction(${input.type}) failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}

export interface NetworkPeople {
  people: UserSummary[]
  error: string | null
}

/** People connected to `userId` through interaction-derived relationships, deduplicated. */
export async function loadNetworkPeople(userId: string): Promise<NetworkPeople> {
  const result = await attempt(() => getUserNetwork(getDb().db, userId))
  if (!result.ok) return { people: [], error: result.error }
  const seen = new Map<string, UserSummary>()
  for (const edge of result.value.edges) {
    if (edge.other.id !== userId && !seen.has(edge.other.id)) seen.set(edge.other.id, edge.other)
  }
  return { people: [...seen.values()], error: null }
}

/** `{ value, label }` options for a preset `<Select>`; empty while the engine ships no presets. */
export function presetOptions(locale: Locale = 'en'): Array<{ value: string; label: string }> {
  return STYLE_PRESETS.map((p) => ({
    value: p.slug,
    label: locale === 'zh-TW' ? p.labelZh : p.name,
  }))
}

/** The preset's own label in the reader's language. */
export function presetLabel(slug: string, locale: Locale = 'en'): string {
  const preset = STYLE_PRESETS.find((p) => p.slug === slug)
  if (!preset) return slug.replace(/[-_]+/g, ' ')
  return locale === 'zh-TW' ? preset.labelZh : preset.name
}

/**
 * Together occasions offered in the UI (product language from ref/). `facet` names the
 * catalog occasion whose label the option shows; `graduation` and `seasonal` are not catalog
 * occasions, so those two read from the `social` messages instead.
 */
export const OCCASION_OPTIONS = [
  { value: 'travel', facet: 'travel' },
  { value: 'wedding', facet: 'wedding-guest' },
  { value: 'festival', facet: 'festival' },
  { value: 'date', facet: 'date-night' },
  { value: 'graduation', facet: null },
  { value: 'party', facet: 'party' },
  { value: 'seasonal', facet: null },
] as const

type OwnOccasions = Record<'graduation' | 'seasonal', string>

/** The occasion `<Select>` options in the reader's language, in offered order. */
export function occasionOptions(
  locale: Locale,
  own: OwnOccasions,
): Array<{ value: string; label: string }> {
  return OCCASION_OPTIONS.map((option) => ({
    value: option.value,
    label: option.facet ? facetLabel(locale, option.facet) : own[option.value],
  }))
}

/** The label of a stored occasion value, whether or not it is one we offer. */
export function occasionOptionLabel(locale: Locale, value: string, own: OwnOccasions): string {
  return (
    occasionOptions(locale, own).find((option) => option.value === value)?.label ??
    facetLabel(locale, value)
  )
}

/** Parse `articles=0108775015,0110065011` (or repeated params) into article ids. */
export function parseIdList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '')
  return [...new Set(raw.split(/[,\s]+/).filter((s) => /^\d{10}$/.test(s)))]
}

/** First string of a search param. */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Absolute share URL when the request origin is known, otherwise the path. */
export function shareUrl(path: string, origin?: string | null): string {
  return origin ? `${origin.replace(/\/$/, '')}${path}` : path
}
