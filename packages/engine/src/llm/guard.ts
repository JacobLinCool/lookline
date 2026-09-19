/**
 * Grounding guard (ENGINE_SPEC §2.5): every digit sequence and every capitalised token / brand /
 * person / aesthetic name in an LLM sentence must appear in the evidence it was produced from.
 */
import { AESTHETICS } from '@lookline/catalog'

const SENTENCE_SPLIT = /(?<=[.!?。！？])\s+/

const normaliseNumber = (s: string): string => s.replace(/[,\s]/g, '')

/** Tokens of `text` that are not backed by `evidence` (empty when grounded). */
export function groundingViolations(text: string, evidence: readonly string[]): string[] {
  const joined = evidence.join(' \n ')
  const joinedLower = joined.toLowerCase()
  const numbersInEvidence = new Set(
    Array.from(joined.matchAll(/\d[\d,.]*\d|\d/g), (m) => normaliseNumber(m[0])),
  )
  const violations: string[] = []
  const seen = new Set<string>()
  const flag = (token: string): void => {
    const key = token.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    violations.push(token)
  }

  for (const m of text.matchAll(/\d[\d,.]*\d|\d/g)) {
    const num = normaliseNumber(m[0])
    if (!numbersInEvidence.has(num) && !numbersInEvidence.has(num.replace(/\.0+$/, ''))) {
      flag(m[0])
    }
  }

  for (const sentence of text.split(SENTENCE_SPLIT)) {
    const tokens = Array.from(sentence.matchAll(/[A-Za-z][A-Za-z'’-]*/g), (m) => ({
      token: m[0],
      index: m.index ?? 0,
    }))
    tokens.forEach(({ token }, i) => {
      if (!/^[A-Z]/.test(token) || token.length < 2) return
      if (i === 0 && !/^[A-Z]{2,}$/.test(token)) {
        // Sentence-initial capitalisation is ordinary English unless the whole token is upper-case.
        return
      }
      if (!joinedLower.includes(token.toLowerCase())) flag(token)
    })
  }

  const lower = text.toLowerCase()
  for (const a of AESTHETICS) {
    for (const name of [a.name, a.slug, a.labelZh]) {
      const n = name.toLowerCase()
      if (n.length >= 2 && lower.includes(n) && !joinedLower.includes(n)) flag(name)
    }
  }
  return violations
}

/** True when `groundingViolations` is empty. */
export function assertGrounded(text: string, evidence: readonly string[]): boolean {
  return groundingViolations(text, evidence).length === 0
}
