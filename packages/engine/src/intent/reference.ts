/**
 * Reference detection and resolution (ENGINE_SPEC §1.4.8): "like Alice's look", 「跟 Jacob 一起」.
 */
import type { Locale } from './normalize'
import { escapeRe } from './recipient'
import type {
  IntentAssumptionExt,
  IntentClarificationExt,
  IntentContact,
  IntentContextExt,
} from './schema'

export interface ReferenceDetection {
  handle?: string
  role?: 'style-source' | 'coordinate-with'
  /** Character spans of the name and trigger words, to be consumed. */
  spans: Array<[number, number]>
}

const STYLE_PATTERNS = (n: string): RegExp[] => [
  new RegExp(
    `(?:something|anything)?\\s*like\\s+${n}(?:'s)?(?:\\s+(?:look|outfit|style|vibe|fit))?`,
    'i',
  ),
  new RegExp(`${n}'s\\s+(?:look|outfit|style|vibe|fit)`, 'i'),
  new RegExp(`${n}\\s*的\\s*(?:look|穿搭|風格|那套|造型)`, 'i'),
  new RegExp(`${n}\\s*那套`, 'i'),
  new RegExp(`像\\s*${n}\\s*(?:那樣|一樣|那種)?`, 'i'),
  new RegExp(`(?:copy|same as|similar to)\\s+${n}(?:'s)?(?:\\s+(?:look|outfit|style))?`, 'i'),
]

const COORD_PATTERNS = (n: string): RegExp[] => [
  new RegExp(`(?:跟|和|與)\\s*${n}\\s*一起`, 'i'),
  new RegExp(`with\\s+${n}(?![a-z0-9])`, 'i'),
  new RegExp(`match(?:ing)?\\s+${n}(?:'s)?(?:\\s+(?:look|outfit))?`, 'i'),
  new RegExp(`(?:搭配|配合|配)\\s*${n}(?:\\s*的)?`, 'i'),
  new RegExp(`跟\\s*${n}\\s*(?:的\\s*)?(?:look|穿搭)?\\s*(?:搭|配)`, 'i'),
]

const GENERIC_COORD: RegExp[] = [
  /跟\s*(?:他|她)\s*的\s*(?:look|穿搭|那套)\s*(?:搭|配)/i,
  /match(?:ing)?\s+(?:his|her|their)\s+(?:look|outfit|style)/i,
  /(?:go|goes)\s+with\s+(?:his|her|their)\s+(?:look|outfit)/i,
]

function candidateNames(
  raw: string,
  ctx: IntentContextExt,
): Array<{ name: string; contact?: IntentContact }> {
  const out: Array<{ name: string; contact?: IntentContact }> = []
  for (const c of ctx.contacts ?? []) {
    for (const name of [c.displayName, c.handle]) {
      if (name && name.length >= 2) out.push({ name, contact: c })
    }
  }
  for (const m of raw.matchAll(/(?<![A-Za-z])([A-Z][a-z]{1,20})(?![a-z])/g)) {
    const name = m[1] ?? ''
    if (name === 'I') continue
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase())) continue
    out.push({ name })
  }
  // longest names first so "Alice Chen" beats "Alice"
  return out.toSorted((a, b) => b.name.length - a.name.length)
}

export function detectReference(
  raw: string,
  ctx: IntentContextExt,
): ReferenceDetection & { contact?: IntentContact } {
  const spans: Array<[number, number]> = []
  for (const cand of candidateNames(raw, ctx)) {
    const n = escapeRe(cand.name)
    for (const re of STYLE_PATTERNS(n)) {
      const m = re.exec(raw)
      if (m) {
        spans.push([m.index, m.index + m[0].length])
        return {
          handle: cand.contact?.displayName ?? cand.name,
          role: 'style-source',
          spans,
          contact: cand.contact,
        }
      }
    }
    for (const re of COORD_PATTERNS(n)) {
      const m = re.exec(raw)
      if (m) {
        spans.push([m.index, m.index + m[0].length])
        for (const g of GENERIC_COORD) {
          const gm = g.exec(raw)
          if (gm) spans.push([gm.index, gm.index + gm[0].length])
        }
        return {
          handle: cand.contact?.displayName ?? cand.name,
          role: 'coordinate-with',
          spans,
          contact: cand.contact,
        }
      }
    }
  }
  return { spans }
}

export interface ReferenceResolution {
  referenceLookId?: string
  referenceHandle?: string
  referenceRole?: 'style-source' | 'coordinate-with'
  assumptions: IntentAssumptionExt[]
  clarifications: IntentClarificationExt[]
}

const t = (locale: Locale, zh: string, en: string): string => (locale === 'en' ? en : zh)

export function resolveReference(
  det: ReturnType<typeof detectReference>,
  ctx: IntentContextExt,
  locale: Locale,
): ReferenceResolution {
  const out: ReferenceResolution = { assumptions: [], clarifications: [] }
  if (!det.handle || !det.role) {
    const kept = ctx.previousIntent?.referenceLookId
    if (kept) out.referenceLookId = kept
    return out
  }
  out.referenceHandle = det.handle
  out.referenceRole = det.role
  const contact = det.contact
  const confidence = det.role === 'style-source' ? 0.9 : 0.7
  if (contact && contact.latestLookIds && contact.latestLookIds.length > 1) {
    out.clarifications.push({
      slot: 'referenceLookId',
      question: t(locale, '你指的是哪一個 Look？', 'Which Look do you mean?'),
      options: contact.latestLookIds.slice(0, 4),
      blocking: true,
    })
    out.referenceLookId = contact.latestLookIds[0]
    out.assumptions.push({
      slot: 'referenceLookId',
      value: contact.latestLookIds[0] ?? '',
      confidence: 0.5,
      reason: t(
        locale,
        `${det.handle} 有多個 Look，先用最新的`,
        `${det.handle} has several Looks; using the latest`,
      ),
      source: 'context',
    })
    return out
  }
  const lookId = contact?.latestLookId ?? contact?.latestLookIds?.[0]
  if (lookId) {
    out.referenceLookId = lookId
    out.assumptions.push({
      slot: 'referenceLookId',
      value: lookId,
      confidence,
      reason: t(locale, `${det.handle} 最新的 Look`, `${det.handle}'s latest Look`),
      source: 'context',
    })
    return out
  }
  out.assumptions.push({
    slot: 'referenceLookId',
    value: '',
    confidence: 0.3,
    reason: t(locale, `找不到 ${det.handle}`, `Could not resolve ${det.handle}`),
    source: 'context',
  })
  return out
}
