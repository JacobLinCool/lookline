/**
 * The lexical retriever for the sentence resolver: which values of the `lexical` search facets a
 * sentence names. It is exact and deterministic — a candidate exists because one of the value's
 * bilingual terms is literally in the sentence — and it decides nothing: every candidate becomes
 * one decision question (wanted, rejected, or merely mentioned) for the model, which is what
 * keeps "party dress" from wanting sequins and "不要蕾絲邊" from adding lace.
 *
 * Chinese has no word boundaries, so a term with CJK in it matches as a substring of the sentence
 * with the spaces next to CJK removed ("A 字裙" is "A字裙"); an all-Latin term must sit between
 * non-alphanumerics, so "silk" is not inside "silky" and "long" is not inside "longline".
 */
import { SEARCH_FACETS, type SearchFacet, type SearchFacetKey } from '@lookline/catalog'

/** A sentence longer than this names more than a filter can honestly apply at once. */
export const MAX_FILTER_CANDIDATES = 16

export interface FacetCandidate {
  key: SearchFacetKey
  value: string
  /** The term that matched, normalised. */
  term: string
  /** Where in the normalised sentence it starts. */
  position: number
}

const CJK = /[㐀-鿿]/

export function normaliseSentence(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim()
}

/** The sentence with the spaces beside CJK characters removed, for substring matches. */
const compact = (text: string): string => text.replace(/(?<=[㐀-鿿])\s+|\s+(?=[㐀-鿿])/g, '')

const isLatin = (c: string | undefined): boolean => c !== undefined && /[a-z0-9]/.test(c)

function findLatin(text: string, term: string): number {
  let from = 0
  while (from <= text.length - term.length) {
    const at = text.indexOf(term, from)
    if (at < 0) return -1
    if (!isLatin(text[at - 1]) && !isLatin(text[at + term.length])) return at
    from = at + 1
  }
  return -1
}

interface Entry {
  key: SearchFacetKey
  value: string
  terms: readonly string[]
}

const termsOf = (row: {
  slug: string
  name: string
  labelZh: string
  synonyms: readonly string[]
}) =>
  [
    ...new Set(
      [row.slug, row.slug.replaceAll('-', ' '), row.name, row.labelZh, ...row.synonyms]
        .map(normaliseSentence)
        .filter(Boolean),
    ),
  ] as readonly string[]

let entries: Entry[] | null = null
function lexicalEntries(): Entry[] {
  entries ??= SEARCH_FACETS.filter(
    (f): f is SearchFacet & { decision: 'lexical' } => f.decision === 'lexical',
  ).flatMap((facet) =>
    facet.values.map((v) => ({ key: facet.key, value: v.slug, terms: termsOf(v) })),
  )
  return entries
}

/** Every lexical facet value the sentence names, earliest first, at most `MAX_FILTER_CANDIDATES`. */
export function extractFacetCandidates(
  utterance: string,
  limit = MAX_FILTER_CANDIDATES,
): FacetCandidate[] {
  const text = normaliseSentence(utterance)
  if (!text) return []
  const dense = compact(text)
  const found: FacetCandidate[] = []
  for (const entry of lexicalEntries()) {
    let best: { term: string; position: number } | undefined
    for (const term of entry.terms) {
      const position = CJK.test(term) ? dense.indexOf(term) : findLatin(text, term)
      if (position >= 0 && (!best || term.length > best.term.length)) best = { term, position }
    }
    if (best) found.push({ key: entry.key, value: entry.value, ...best })
  }
  // Longest match wins its span: "lace trim" is a design detail, and the "lace" inside it is not
  // also a material; "crew neck" is a neckline, not a sock length. A term only loses to one that
  // fully contains it, so "silk long coat" still yields both the material and the sleeve.
  const ordered = found.toSorted(
    (a, b) =>
      a.position - b.position ||
      b.term.length - a.term.length ||
      a.key.localeCompare(b.key) ||
      a.value.localeCompare(b.value),
  )
  const accepted: FacetCandidate[] = []
  for (const candidate of ordered) {
    const end = candidate.position + candidate.term.length
    const covered = accepted.some(
      (other) =>
        other.term.length > candidate.term.length &&
        other.position <= candidate.position &&
        other.position + other.term.length >= end &&
        // Only terms of the same script share a coordinate system.
        CJK.test(other.term) === CJK.test(candidate.term),
    )
    if (!covered) accepted.push(candidate)
    if (accepted.length >= limit) break
  }
  return accepted
}
