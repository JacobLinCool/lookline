/**
 * Fonts for the share image.
 *
 * The rasteriser behind `ImageResponse` carries a Latin face and nothing else, so a persona
 * called 媽媽 comes out as a row of empty boxes. Google's `text=` parameter answers with a face
 * cut down to exactly the characters asked for — a few kilobytes for a card's worth of words
 * rather than the ten megabytes a whole Chinese family weighs.
 *
 * What leaves this worker is the handful of characters already printed on a public card, and it
 * leaves once: the subset is cached by the characters it covers, and a card's rendered image is
 * cached too. A failure here drops the Chinese face and keeps the Latin one rather than failing
 * the image — a share preview with a missing glyph beats a link with no preview at all.
 */
const cache = new Map<string, ArrayBuffer | null>()

/** Woff2 is smaller but satori cannot read it, so ask as a browser that only knows TrueType. */
const TRUETYPE_UA =
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.110 Safari/537.36'

const hasHan = (text: string): boolean => /[㐀-鿿豈-﫿]/.test(text)

export async function chineseFont(text: string): Promise<ArrayBuffer | null> {
  const wanted = [...new Set(text)]
    .filter((c) => c.trim())
    .sort()
    .join('')
  if (!wanted || !hasHan(wanted)) return null
  const cached = cache.get(wanted)
  if (cached !== undefined) return cached

  const font = await loadSubset(wanted).catch((error) => {
    console.warn('[og] Chinese subset unavailable, falling back to Latin only', error)
    return null
  })
  cache.set(wanted, font)
  return font
}

async function loadSubset(characters: string): Promise<ArrayBuffer | null> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&text=${encodeURIComponent(characters)}`,
    { headers: { 'user-agent': TRUETYPE_UA } },
  )
  if (!css.ok) return null
  const url = /src:\s*url\((https:\/\/[^)]+)\)/.exec(await css.text())?.[1]
  if (!url) return null
  const file = await fetch(url)
  return file.ok ? await file.arrayBuffer() : null
}
