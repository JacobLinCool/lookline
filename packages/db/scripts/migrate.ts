/** `pnpm --filter @lookline/db migrate` — apply migrations to the local SQLite file. */
import { createLocalDb, loadEnv, migrateLocal } from '../src/node'

loadEnv()
const handle = createLocalDb()
try {
  await migrateLocal(handle)
  console.log(`migrations applied to ${handle.url}`)
} finally {
  await handle.close()
}
