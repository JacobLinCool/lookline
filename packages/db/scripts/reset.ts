/** Deletes the local SQLite file and re-applies every migration. Destructive by design. */
import fs from 'node:fs'
import { createLocalDb, loadEnv, localDbPath, migrateLocal } from '../src/node'

loadEnv()
const file = localDbPath()
for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true })
const handle = createLocalDb(file)
try {
  await migrateLocal(handle)
  console.log(`database reset and migrated: ${file}`)
} finally {
  await handle.close()
}
