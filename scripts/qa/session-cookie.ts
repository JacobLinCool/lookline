/**
 * QA helper: create a session for a user handle and print the `ll_session` cookie value.
 *   pnpm exec tsx scripts/qa/session-cookie.ts jacob
 * Use it with curl: curl -b "ll_session=<value>" http://localhost:3000/me
 */
import { createHmac } from 'node:crypto'
import { eq, sessions, users } from '@lookline/db'
import { createLocalDb, findLocalD1File, loadEnv, localDbPath } from '@lookline/db/node'

loadEnv()
const handle = process.argv[2]
if (!handle) {
  console.error('usage: tsx scripts/qa/session-cookie.ts <handle>')
  process.exit(1)
}
const secret = process.env.SESSION_SECRET ?? 'lookline-dev-secret-change-me'
// The dev server reads the local D1 file; fall back to the seed database.
const { db, close } = createLocalDb(findLocalD1File() ?? localDbPath())
try {
  const [user] = await db.select().from(users).where(eq(users.handle, handle)).limit(1)
  if (!user) {
    console.error(`no user with handle ${handle}`)
    process.exit(2)
  }
  const id = `qa_${Math.random().toString(36).slice(2, 12)}`
  await db.insert(sessions).values({
    id,
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })
  const sig = createHmac('sha256', secret).update(id).digest('hex')
  console.log(`${id}.${sig}`)
} finally {
  await close()
}
