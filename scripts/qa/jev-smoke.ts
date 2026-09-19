import { loadEnv } from '@lookline/db/node'
import { resolveFilters, type FilterState } from '../../packages/engine/src/decisions/filters'
loadEnv()
const cases: { id: string; text: string; base?: FilterState }[] = [
  { id: 'en-multi-negation', text: 'black or navy outerwear under TWD 3000, no red' },
  { id: 'zh-correction', text: '黑色外套，不要黑色，改成海軍藍，三千以內' },
  { id: 'mixed', text: '想要 minimalist 的外套，navy or black，預算 NT$3000' },
  { id: 'add-existing', text: 'also add navy', base: { colorFamilies: ['black'] } },
  { id: 'replace-existing', text: '改成紅色', base: { colorFamilies: ['black'] } },
  { id: 'exclude-existing', text: '不要黑色', base: { colorFamilies: ['black', 'blue'] } },
  {
    id: 'clear-existing',
    text: 'any colour is fine',
    base: { colorFamilies: ['black'], excludedColorFamilies: ['red'] },
  },
  {
    id: 'retain-unmentioned',
    text: 'under TWD 2000',
    base: { categoryGroups: ['outerwear'], colorFamilies: ['black'] },
  },
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
              { choice: string; confidence: number; probabilities: Record<string, number> }
            >
          }
          console.log(
            JSON.stringify({
              id: fixture.id,
              answers: Object.fromEntries(
                Object.entries(data.answers ?? {})
                  .filter(
                    ([key, a]) =>
                      !key.includes(':') || a.choice !== 'neutral' || a.confidence < 0.8,
                  )
                  .map(([key, a]) => [
                    key,
                    { choice: a.choice, confidence: a.confidence, p: a.probabilities[a.choice] },
                  ]),
              ),
            }),
          )
        }
        return response
      },
    })
    console.log(JSON.stringify({ id: fixture.id, ...result }))
  } catch (error) {
    console.log(
      JSON.stringify({
        id: fixture.id,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: performance.now() - start,
      }),
    )
  }
}
