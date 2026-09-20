import { createHmac, timingSafeEqual } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { customAlphabet, nanoid } from 'nanoid'
import { and, eq, gt, sessions, users, type User } from '@lookline/db'
import { hashString } from '@/lib/hash'
import { getDb } from './db'

/**
 * Cookie-session auth over the `sessions` table.
 *
 * Cookie `ll_session` = `${sessionId}.${hmacSha256Hex(sessionId, SESSION_SECRET)}`; httpOnly,
 * SameSite=Lax, 30-day expiry mirrored in `sessions.expires_at`. Only server actions and route
 * handlers may call the functions that set cookies (`loginAs`, `createGuest`, `logout`);
 * server components read through `getSessionUser` / `requireUser`.
 */

export const SESSION_COOKIE = 'll_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const LAST_SEEN_INTERVAL_MS = 10 * 60 * 1000
const DEV_SECRET = 'lookline-dev-secret-change-me'

let warnedSecret = false
let warnedDb = false

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 16) return secret
  if (!warnedSecret) {
    warnedSecret = true
    console.warn('[lookline] SESSION_SECRET is missing or short; using an insecure dev secret.')
  }
  return DEV_SECRET
}

function sign(sessionId: string): string {
  return createHmac('sha256', sessionSecret()).update(sessionId).digest('hex')
}

/** `${sessionId}.${signature}` — the raw cookie value. */
export function encodeSessionCookie(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`
}

/** Verify a cookie value and return the session id, or null when absent/tampered. */
export function decodeSessionCookie(value: string | undefined): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const sessionId = value.slice(0, dot)
  const signature = Buffer.from(value.slice(dot + 1), 'utf8')
  const expected = Buffer.from(sign(sessionId), 'utf8')
  if (signature.length !== expected.length) return null
  return timingSafeEqual(signature, expected) ? sessionId : null
}

async function touchLastSeen(user: User): Promise<void> {
  if (Date.now() - user.lastSeenAt.getTime() < LAST_SEEN_INTERVAL_MS) return
  try {
    await getDb().db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id))
  } catch (error) {
    console.warn('[lookline] could not update users.last_seen_at', error)
  }
}

/**
 * The signed-in user for the current request, or null. Cached per request (React `cache`), so
 * layouts, pages and components can all call it freely. Degrades to "signed out" (with a single
 * console warning) when the database is unreachable so the shell still renders.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const store = await cookies()
  const sessionId = decodeSessionCookie(store.get(SESSION_COOKIE)?.value)
  if (!sessionId) return null
  try {
    const rows = await getDb()
      .db.select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    await touchLastSeen(row.user)
    return row.user
  } catch (error) {
    if (!warnedDb) {
      warnedDb = true
      console.warn('[lookline] session lookup failed (is the D1 binding configured?)', error)
    }
    return null
  }
})

/**
 * Return the signed-in user or redirect to `/login?next=<next>`. Pass the current path as `next`
 * (server components have no pathname API) so the user lands back where they started.
 */
export async function requireUser(next: string = '/'): Promise<User> {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(next))}`)
  return user
}

/** Only allow same-origin absolute paths as post-login destinations. */
export function safeNextPath(value: unknown, fallback: string = '/'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}

/** Create a session for `userId` and set the cookie. Server actions / route handlers only. */
export async function loginAs(userId: string): Promise<User> {
  const { db } = getDb()
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]
  if (!user) throw new Error(`Unknown user: ${userId}`)
  const sessionId = nanoid()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt })
  const store = await cookies()
  store.set({
    name: SESSION_COOKIE,
    value: encodeSessionCookie(sessionId),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
  return user
}

const guestSuffix = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 4)

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${error.cause ?? ''}` : String(error)
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message)
}

/**
 * Create a guest `users` row (`isGuest = true`, handle `guest-xxxx`, avatar seed from the id)
 * and sign them in. Used by shared Cards and the login page.
 */
export async function createGuest(displayName: string): Promise<User> {
  const name = displayName.trim().slice(0, 40) || 'Guest'
  const { db } = getDb()
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = nanoid()
    try {
      const [user] = await db
        .insert(users)
        .values({
          id,
          handle: `guest-${guestSuffix()}`,
          displayName: name,
          isGuest: true,
          avatarSeed: hashString(id),
        })
        .returning()
      if (user) return loginAs(user.id)
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error
    }
  }
  throw new Error('Could not allocate a guest handle')
}

/** Delete the current session row and clear the cookie. */
export async function logout(): Promise<void> {
  const store = await cookies()
  const sessionId = decodeSessionCookie(store.get(SESSION_COOKIE)?.value)
  if (sessionId) {
    try {
      await getDb().db.delete(sessions).where(eq(sessions.id, sessionId))
    } catch (error) {
      console.warn('[lookline] could not delete session row', error)
    }
  }
  store.delete(SESSION_COOKIE)
}
