/**
 * Rebuild canonical demand signals and manufacturing recommendations from the local database.
 */
import { createLocalDb, loadEnv } from '@lookline/db/node'
import { runAnalytics } from '../src/analytics'

loadEnv()
const handle = createLocalDb()
try {
  const summary = await runAnalytics(handle.db)
  console.log(
    [
      `taste clusters ${summary.clusters}`,
      `trend signals  ${summary.trendSignals}`,
      `manufacturing  ${summary.manufacturing}`,
      `bandit slates  ${summary.banditSlates}`,
      `duration       ${summary.durationMs} ms`,
    ].join('\n'),
  )
} finally {
  await handle.close()
}
