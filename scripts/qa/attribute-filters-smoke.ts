import { loadEnv } from '@lookline/db/node'
import { resolveFilters, type FilterState } from '../../packages/engine/src/decisions/filters'
loadEnv()
/**
 * Real Jev over the acceptance sentences of issue #31: construction facets from lexical
 * candidates, negation, and the free-text signal. `JEV_DEBUG=1` prints every non-neutral answer.
 */
const cases: { id: string; text: string; base?: FilterState }[] = [
  { id: 'zh-a-line', text: 'A 字裙' },
  { id: 'zh-pockets-no-lace', text: '有口袋、不要蕾絲邊' },
  { id: 'zh-cartoon-top', text: '卡通印花上衣' },
  { id: 'en-a-line', text: 'an a-line skirt' },
  { id: 'en-pockets-no-lace', text: 'with pockets, no lace trim' },
  { id: 'en-cartoon-top', text: 'cartoon print top' },
  { id: 'zh-whale', text: '鯨魚圖案的上衣' },
  { id: 'en-whale', text: 'a whale print hoodie' },
  { id: 'en-silk-long-coat', text: 'a silk long coat' },
  { id: 'zh-replace-sleeve', text: '改成長袖', base: { sleeves: ['short'], details: ['pockets'] } },
  { id: 'zh-plain-attributes', text: '黑色長袖高領毛衣，三千以內' },
]
for (const fixture of cases) {
  const start = performance.now()
  try {
    const result = await resolveFilters(fixture.text, fixture.base ?? {}, {
      fetch: async (...args) => {
        const response = await fetch(...args)
        if (process.env.JEV_DEBUG) {
          const data = (await response.clone().json()) as {
            answers?: Record<
              string,
              { type: string; choice?: string; confidence?: number; noul?: number }
            >
          }
          console.log(
            JSON.stringify({
              id: fixture.id,
              answers: Object.fromEntries(
                Object.entries(data.answers ?? {}).filter(
                  ([key, a]) =>
                    a.type === 'noul' ||
                    (!key.startsWith('hint:') && a.choice !== 'neutral' && a.choice !== 'keep'),
                ),
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
        text: fixture.text,
        filters: result.filters,
        unresolved: result.unresolved,
        freeText: result.freeText,
        ms: Math.round(result.latencyMs),
      }),
    )
  } catch (error) {
    console.log(
      JSON.stringify({
        id: fixture.id,
        error: error instanceof Error ? error.message : String(error),
        ms: Math.round(performance.now() - start),
      }),
    )
  }
}
