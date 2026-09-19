/**
 * Free-text keywords for the sentence resolver — the part of a request the closed attribute
 * vocabulary cannot carry. "鯨魚圖案的上衣" resolves `tops` and `printSubject: animal` from the
 * catalog, but nothing in it says whale; that word lives only in the English caption the vision
 * pass wrote for the photograph, which the full-text index holds.
 *
 * The decision model answers whether such a word exists (a Noul question in the filter request);
 * only then does a fast generative model translate the sentence's motifs, characters, brands and
 * slogans into English search terms. The output is treated as text to look up, never as a filter:
 * every term is sanitised to index tokens, anything the catalog vocabulary already expresses is
 * dropped, and the result is capped. A missing or failed model simply yields no keywords.
 */
import { LEXICON, LEXICON_SECTIONS, SEARCH_FACETS } from '@lookline/catalog'
import { z } from 'zod'
import { TEXT_TIMEOUT_MS } from '../llm/types'
import type { LlmClient } from '../types'
import { normaliseSentence } from './candidates'

export const KEYWORDS_CONTRACT_VERSION = 'keywords-v1'
export const MAX_KEYWORD_CONCEPTS = 4
export const MAX_KEYWORD_TERMS = 3
/**
 * Index tokens are letter-or-digit runs (`unicode61`); a keyword is one to three of them. A run
 * of Chinese is one token here and a phrase over its characters in the index (`search_zh` is
 * written with a space between every character, see `@lookline/db` fts.ts), so "鯨魚" finds the
 * captions that say it without a translation in between.
 */
const MAX_TERM_TOKENS = 3
const MAX_TERM_LENGTH = 32
const TOKEN = /[\p{L}\p{N}]+/gu

/** One concept the shopper named, as alternative English spellings joined by `|` in a URL. */
export type KeywordConcept = string[]

const outputSchema = z.object({
  concepts: z.array(z.object({ terms: z.array(z.string().max(64)).max(6) })).max(8),
})

export interface KeywordExtraction {
  /** Concepts to AND together, each a list of alternative terms to OR. */
  keywords: KeywordConcept[]
  provider: string
  model: string | null
  contractVersion: typeof KEYWORDS_CONTRACT_VERSION
  latencyMs: number
}

let vocabulary: Set<string> | null = null
/** Every term the closed vocabularies already answer for, so a keyword never duplicates a facet. */
function catalogTerms(): Set<string> {
  if (vocabulary) return vocabulary
  const set = new Set<string>()
  for (const facet of SEARCH_FACETS)
    for (const value of facet.values)
      for (const term of [
        value.slug,
        value.slug.replaceAll('-', ' '),
        value.name,
        ...value.synonyms,
      ])
        set.add(normaliseSentence(term))
  for (const section of LEXICON_SECTIONS)
    for (const entry of LEXICON[section])
      for (const term of entry.terms) set.add(normaliseSentence(term))
  vocabulary = set
  return set
}

/** Lower-case index tokens only (Latin or CJK), deduplicated, catalog vocabulary removed, capped. */
export function sanitizeKeywords(concepts: ReadonlyArray<readonly string[]>): KeywordConcept[] {
  const known = catalogTerms()
  const seen = new Set<string>()
  const out: KeywordConcept[] = []
  for (const concept of concepts) {
    const terms: string[] = []
    for (const raw of concept) {
      const tokens = normaliseSentence(raw).match(TOKEN) ?? []
      if (tokens.length === 0 || tokens.length > MAX_TERM_TOKENS) continue
      const term = tokens.join(' ')
      if (term.length > MAX_TERM_LENGTH) continue
      if (known.has(term) || seen.has(term) || terms.includes(term)) continue
      terms.push(term)
      if (terms.length >= MAX_KEYWORD_TERMS) break
    }
    if (terms.length === 0) continue
    for (const term of terms) seen.add(term)
    out.push(terms)
    if (out.length >= MAX_KEYWORD_CONCEPTS) break
  }
  return out
}

/** `whale|orca` ↔ `['whale', 'orca']`, for URLs and `ProductSearch.keywords`. */
export const formatKeyword = (concept: readonly string[]): string => concept.join('|')
export function parseKeywords(values: readonly string[]): KeywordConcept[] {
  return sanitizeKeywords(values.map((value) => value.split('|')))
}

export const KEYWORD_INSTRUCTIONS = `You extract search keywords from a fashion shopping request for an English-language catalogue (product names, product copy and one English sentence describing each photograph).
The catalogue's closed attributes are handled elsewhere and must NOT be output: garment types and categories, departments (women/men/kids), colours, materials and fabrics, patterns (stripes, floral, checks…), fits, silhouettes, lengths, necklines, sleeves, closures, construction details (pockets, ruffles, lace trim…), print subject classes (animal, character, floral, slogan, logo…), occasions, seasons, sizes, prices and budgets, and sort preferences.
Output only the specific things the attributes cannot say: a motif or subject (whale, dinosaur, strawberry, rainbow), a named character or franchise, a brand or collaboration, printed words or slogans, a sport or team, a specific object or place, or another concrete descriptive noun.
For each concept give 1 to 3 terms a product caption might use, lower-case, without punctuation: the English word and its plural or a synonym, plus the term in the request's own language when that is Chinese (the captions exist in both). If the request names nothing of that kind, return no concepts.`

export interface ExtractKeywordsOptions {
  llm: LlmClient
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * Keywords from the sentence, or `null` when no generative provider is configured or the call
 * failed. An empty `keywords` is a real answer: the model read the sentence and found nothing the
 * attributes had not already taken.
 */
export async function extractSearchKeywords(
  utterance: string,
  options: ExtractKeywordsOptions,
): Promise<KeywordExtraction | null> {
  const text = utterance.trim()
  if (!text || text.length > 500) throw new Error('Describe filters in 1–500 characters.')
  return extractKeywordContext(text, KEYWORD_INSTRUCTIONS, options)
}

/** The caller validates its input contract; transport and sanitization stay shared. */
export async function extractKeywordContext(
  context: unknown,
  instructions: string,
  options: ExtractKeywordsOptions,
): Promise<KeywordExtraction | null> {
  const start = performance.now()
  const { llm } = options
  if (llm.provider === 'offline') return null
  const raw = await llm.generateJson({
    schema: outputSchema,
    system: instructions,
    prompt: `Request: ${JSON.stringify(context)}`,
    purpose: 'search-keywords',
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? TEXT_TIMEOUT_MS,
  })
  if (!raw) return null
  return {
    keywords: sanitizeKeywords(raw.concepts.map((c) => c.terms)),
    provider: llm.provider,
    model: llm.textModel,
    contractVersion: KEYWORDS_CONTRACT_VERSION,
    latencyMs: performance.now() - start,
  }
}
