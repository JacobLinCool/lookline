/**
 * Worker entry: vinext's request handler, plus the cron that keeps the home page's reading of the
 * country's search box current.
 *
 * `vinext/server/fetch-handler` is what `main` pointed at before; everything it exports is passed
 * through untouched, so the only difference between this module and the framework's own entry is
 * the `scheduled` export below.
 */
import { createD1Db, type D1Like } from '@lookline/db'
import { ANALYZE_TIMEOUT_MS, createLlmClient, refreshSearchTrends } from '@lookline/engine'
import handler from 'vinext/server/fetch-handler'

export * from 'vinext/server/fetch-handler'

// Structural, like `D1Like` in @lookline/db: the Workers runtime types are not a dependency here
// and the two fields this entry touches do not justify adding them.
interface Env {
  DB: D1Like
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

export default {
  ...handler,
  /**
   * The same cycle the engine lab's button runs, from the same function. It carries no token,
   * because a cron is not a request: the secret exists to keep the public off the HTTP route, and
   * there is no public here.
   *
   * A failure is left to Cloudflare's own retry and the logs. Yesterday's reading stays on the
   * home page until a run succeeds, which is the better of the two wrong answers — a day-old mood
   * beats no rail at all.
   */
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const llm = createLlmClient({ textTimeoutMs: ANALYZE_TIMEOUT_MS })
        if (llm.provider === 'offline') {
          console.error('[cron] search-trends: no text model configured')
          return
        }
        const published = await refreshSearchTrends(createD1Db(env.DB), llm)
        console.log(
          published
            ? `[cron] search-trends: published ${published.label} (${published.matches} pieces)`
            : "[cron] search-trends: nothing to publish from today's list",
        )
      })(),
    )
  },
}
