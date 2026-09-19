/**
 * `pnpm analytics` — rebuild relationships, taste/social clusters, lineage stats, trend signals
 * and manufacturing recommendations from the raw tables of the local SQLite database
 * (docs/CONTRACTS.md).
 */
import { createLocalDb, loadEnv } from '@lookline/db/node'
import { runAnalytics } from '../src/analytics'

loadEnv()
const handle = createLocalDb()
try {
  const summary = await runAnalytics(handle.db)
  console.log(
    [
      `relationships  ${summary.relationships}`,
      `taste clusters ${summary.clusters}`,
      `lineages       ${summary.lineages}`,
      `trend signals  ${summary.trendSignals}`,
      `manufacturing  ${summary.manufacturing}`,
      `bandit slates  ${summary.banditSlates}`,
      `duration       ${summary.durationMs} ms`,
    ].join('\n'),
  )
} finally {
  await handle.close()
}
