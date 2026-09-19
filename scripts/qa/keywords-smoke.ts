import { loadEnv } from '@lookline/db/node'
import { getLlm } from '../../packages/engine/src/llm'
import { extractSearchKeywords } from '../../packages/engine/src/decisions/keywords'
loadEnv()
/** The configured fast model over sentences the filter decision reports as free text. */
const llm = getLlm()
console.log(JSON.stringify({ provider: llm.provider, model: llm.textModel }))
for (const text of [
  '鯨魚圖案的上衣',
  'a whale print hoodie',
  '有恐龍的童裝 T 恤，不要黑色',
  'Hello Kitty 聯名的粉紅色洋裝',
  '黑色長袖高領毛衣，三千以內',
  'a top that says good vibes only',
]) {
  try {
    const result = await extractSearchKeywords(text, { llm })
    console.log(
      JSON.stringify({
        text,
        keywords: result?.keywords ?? null,
        ms: Math.round(result?.latencyMs ?? 0),
      }),
    )
  } catch (error) {
    console.log(JSON.stringify({ text, error: String(error) }))
  }
}
