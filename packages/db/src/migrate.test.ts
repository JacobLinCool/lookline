import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { createLocalDb, migrateLocal, migrationsFolder } from './node'

/** 0013 creates one table and an index on it, so dropping the table undoes all of it. */
const TAG = '0013_collection_invites'
const TABLE = 'collection_invites'

const hasTable = async (handle: ReturnType<typeof createLocalDb>) =>
  (
    await handle.client.execute({
      sql: `select name from sqlite_master where type = 'table' and name = ?`,
      args: [TABLE],
    })
  ).rows.length === 1

/**
 * The regression that made `pnpm db:migrate` report success over a schema missing three tables.
 * Drizzle's own migrator keeps a single high-water `created_at` and runs only what sits above it,
 * so 0015 — whose journal `when` fell below the hand-written values 0003-0014 were given — was
 * skipped for good, and `pnpm d1:local` then failed on `no such table: seed.friendships`.
 * Whether a migration has already run here is a question only its recorded hash may answer.
 */
test('applies a migration the table has not recorded, whatever the journal timestamps say', async () => {
  const handle = createLocalDb(':memory:')
  try {
    await migrateLocal(handle)
    expect(await hasTable(handle)).toBe(true)

    const hash = createHash('sha256')
      .update(fs.readFileSync(path.join(migrationsFolder, `${TAG}.sql`), 'utf8'))
      .digest('hex')
    await handle.client.execute(`drop table ${TABLE}`)
    await handle.client.execute({
      sql: 'delete from __drizzle_migrations where hash = ?',
      args: [hash],
    })
    // Every remaining row now claims a time later than any entry in the journal.
    await handle.client.execute('update __drizzle_migrations set created_at = 9999999999999')

    await migrateLocal(handle)
    expect(await hasTable(handle)).toBe(true)
  } finally {
    await handle.close()
  }
})

test('re-running applies nothing', async () => {
  const handle = createLocalDb(':memory:')
  const count = async () =>
    (await handle.client.execute('select count(*) as n from __drizzle_migrations')).rows[0]?.['n']
  try {
    await migrateLocal(handle)
    const before = await count()
    await migrateLocal(handle)
    expect(await count()).toBe(before)
  } finally {
    await handle.close()
  }
})
