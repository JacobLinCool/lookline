/**
 * External search trends: what Taiwan is googling, read as a clothing brief.
 *
 * Google's daily trending list is culture, not catalogue — "名古屋亞運", "中秋連假", a shoe
 * collaboration, a drama title. The source is public and needs no key, which is why it is the one
 * we can actually reach; the cost is that every row may carry someone's intellectual property.
 *
 * So the raw list never leaves the engine lab. A model reads the batch as a whole and writes
 * abstract style directions — "運動機能風", not "名古屋亞運" — and those are what the storefront
 * renders. Nobody vets them by hand, so the guards are the ones that hold without a reader: the
 * instructions forbid naming a brand, person, work, character or team, and `withoutSource` throws
 * away any direction quoting anything from the batch, which is how the leak actually happens.
 */
import { z } from 'zod'
import type { LlmClient } from '../types'

export const TRENDS_RSS = 'https://trends.google.com/trending/rss'
export const MAX_TRENDS = 10
export const MAX_DIRECTIONS = 3
/**
 * An operator waiting at a dashboard, not a shopper waiting for a page: the 3.5 s text budget in
 * LATENCY_SPEC buys nothing here and a model asked to read a headline as clothing routinely takes
 * longer. The caller must build its client with this ceiling — `req.timeoutMs` can only lower the
 * client's own, never raise it.
 */
export const ANALYZE_TIMEOUT_MS = 20_000

/** One row of the public list, before any model has read it. */
export interface RawTrend {
  rank: number
  signal: string
  heat: string | null
  newsTitle: string | null
  sourceUrl: string | null
}

/** One clothing reading of a signal. Nothing here may name the signal. */
export interface StyleDirection {
  label: string
  styleQuery: string
  rationale: string
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m?.[1] ? decode(m[1]).trim() || null : null
}
const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
}
const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      const key = name.toLowerCase()
      if (ENTITIES[key]) return ENTITIES[key]
      if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16))
      if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)))
      return whole
    })

/** `<item>` rows in feed order; rank is the feed's own ordering, which is the popularity order. */
export function parseTrendsRss(xml: string): RawTrend[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
  const out: RawTrend[] = []
  for (const item of items) {
    const signal = tag(item, 'title')
    if (!signal) continue
    out.push({
      rank: out.length + 1,
      signal,
      heat: tag(item, 'ht:approx_traffic'),
      newsTitle: tag(item, 'ht:news_item_title'),
      sourceUrl: tag(item, 'ht:news_item_url') ?? tag(item, 'link'),
    })
    if (out.length >= MAX_TRENDS) break
  }
  return out
}

export async function fetchSearchTrends(geo = 'TW', signal?: AbortSignal): Promise<RawTrend[]> {
  const response = await fetch(`${TRENDS_RSS}?geo=${encodeURIComponent(geo)}`, {
    signal: signal ?? AbortSignal.timeout(10_000),
    headers: { accept: 'application/rss+xml' },
  })
  if (!response.ok) throw new Error(`Google Trends responded ${response.status}`)
  return parseTrendsRss(await response.text())
}

// ---------------------------------------------------------------------------
// Reading a signal as clothing
// ---------------------------------------------------------------------------

export const DIRECTION_INSTRUCTIONS = `These search terms are all trending in Taiwan today. Read the list as a whole — the season, the weather, the holidays, the activities and the collective mood it adds up to — and propose up to ${MAX_DIRECTIONS} ways a clothing shop could dress that mood this week.

Read the list, not any single entry. Ignore terms that carry no mood at all: names, lottery numbers, scores, one-off news. A term you ignore must not influence anything you write.

For each direction give:
- "label": the style in 2 to 6 Chinese characters, e.g. 運動機能風, 節慶暖色調.
- "styleQuery": what a shopper would type to find ONE garment in this style — a single garment word plus one or two plain modifiers (colour, material, silhouette, fit), e.g. "機能外套 黑色" or "針織外套 奶油色". Never a whole outfit: a query naming a top and trousers and shoes together matches nothing, because a garment is only one of them. Prefer common words over precise ones. No proper nouns.
- "rationale": one sentence in Chinese saying why the mood suits those clothes.

You must NOT name, spell, transliterate, abbreviate or paraphrase any brand, company, product line, person, athlete, celebrity, team, league, film, drama, song, game or fictional character — not in any field, not even as an example, and not the trending terms themselves. Write only about clothes and the feeling around them. An event may be described generically ("a major sporting event", "a long holiday weekend").

If the whole list is names, numbers and one-off news with no mood behind it, return no directions at all. Returning nothing is correct and expected.`

const outputSchema = z.object({
  directions: z
    .array(
      z.object({
        label: z.string().max(40),
        styleQuery: z.string().max(80),
        rationale: z.string().max(200),
      }),
    )
    .max(6),
})

/** Letter/digit runs, lower-cased: the unit we compare a direction against its signal by. */
const TOKEN = /[\p{L}\p{N}]+/gu
const tokens = (s: string): string[] => (s.toLowerCase().match(TOKEN) ?? []).filter(Boolean)

/**
 * Drops directions that quote anything in the batch back — the way a leak actually happens,
 * because a model asked to explain a trend loves to name it in the rationale it writes. Latin
 * words match whole (so "game" in a signal does not veto a direction about gamine cuts); a run of
 * Chinese is compared by substring, since it carries no spaces to split a name on.
 *
 * ponytail: verbatim quoting only. A name the model transliterates or translates ("巴黎聖日耳曼"
 * for a headline that said "Paris Saint-Germain") shares no token with the batch and passes —
 * only the instructions stop that one. Catching it needs name detection, which is a model, not a
 * filter; add one if a leak is ever observed in practice.
 */
export function withoutSource(
  directions: readonly StyleDirection[],
  trends: readonly Pick<RawTrend, 'signal' | 'newsTitle'>[],
): StyleDirection[] {
  const words = new Set<string>()
  const phrases: string[] = []
  for (const trend of trends)
    for (const source of [trend.signal, trend.newsTitle ?? '']) {
      for (const token of tokens(source)) {
        if (
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token)
        ) {
          if (token.length >= 2) phrases.push(token)
        } else if (token.length >= 3) words.add(token)
      }
    }
  return directions.filter((direction) => {
    const text = `${direction.label} ${direction.styleQuery} ${direction.rationale}`.toLowerCase()
    if (phrases.some((phrase) => text.includes(phrase))) return false
    return !tokens(text).some((token) => words.has(token))
  })
}

export interface ReadOptions {
  llm: LlmClient
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * Style directions for a whole batch, already stripped of anything naming any of its signals. An
 * empty array is a real answer: a list of names and lottery numbers has no mood to dress, and
 * publishing nothing is the correct outcome.
 */
export async function readSearchTrends(
  trends: readonly Pick<RawTrend, 'signal' | 'newsTitle'>[],
  options: ReadOptions,
): Promise<StyleDirection[]> {
  const { llm } = options
  if (llm.provider === 'offline' || trends.length === 0) return []
  const raw = await llm.generateJson({
    schema: outputSchema,
    system: DIRECTION_INSTRUCTIONS,
    prompt: JSON.stringify({
      terms: trends.map((t) => ({ term: t.signal, context: t.newsTitle ?? undefined })),
    }),
    purpose: 'search-trend-directions',
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? ANALYZE_TIMEOUT_MS,
  })
  if (!raw) return []
  const cleaned = raw.directions
    .map((d) => ({
      label: d.label.trim(),
      styleQuery: d.styleQuery.trim(),
      rationale: d.rationale.trim(),
    }))
    .filter((d) => d.label && d.styleQuery && d.rationale)
  return withoutSource(cleaned, trends).slice(0, MAX_DIRECTIONS)
}
