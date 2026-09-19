import { loadEnv } from '@lookline/db/node'
import { resolveFilters, type FilterState } from '../../packages/engine/src/decisions/filters'
import { FILTER_HINTS } from '../../packages/engine/src/decisions/hints'
loadEnv()

/** Real Jev: which hints stay open for each sentence. `JEV_DEBUG=1` prints every hint answer. */
const cases: { id: string; text: string; base?: FilterState }[] = [
  { id: 'one-letter', text: 'a' },
  { id: 'zh-jacket-budget', text: '黑色外套，三千以內' },
  { id: 'en-wedding', text: 'a dress for a wedding' },
  { id: 'zh-gift', text: '送媽媽的禮物，上班穿的' },
  { id: 'en-office-full', text: 'navy trousers for a corporate office, under NT$3000, wide leg' },
  { id: 'zh-shoes', text: '旅行穿的鞋子' },
  { id: 'base-answered', text: 'something warm', base: { department: 'women', priceMax: 2000 } },
]
for (const fixture of cases) {
  const start = performance.now()
  try {
    const result = await resolveFilters(fixture.text, fixture.base ?? {}, {
      fetch: async (...args) => {
        const response = await fetch(...args)
        if (process.env.JEV_DEBUG) {
          const data = (await response.clone().json()) as {
            answers?: Record<string, { choice: string; confidence: number }>
          }
          console.log(
            JSON.stringify({
              id: fixture.id,
              hints: Object.fromEntries(
                FILTER_HINTS.map((h) => h.id).map((id) => {
                  const a = data.answers?.[`hint:${id}`]
                  return [id, a ? `${a.choice} ${a.confidence.toFixed(2)}` : 'absent']
                }),
              ),
            }),
          )
        }
        return response
      },
    })
    console.log(
      JSON.stringify({
        id: fixture.id,
        ms: Math.round(performance.now() - start),
        hints: result.hints,
        filters: result.filters,
        unresolved: result.unresolved,
      }),
    )
  } catch (error) {
    console.log(
      JSON.stringify({
        id: fixture.id,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}
