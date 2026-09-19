/**
 * Recipient and department resolution (ENGINE_SPEC §1.4.4).
 */
import type { Department } from '@lookline/catalog'
import type { Hit, RecipientMeta } from './lexicon'
import type { Locale } from './normalize'
import type { IntentAssumptionExt, IntentContextExt, Relation } from './schema'

export interface RecipientResult {
  recipient: {
    kind: 'self' | 'other' | 'undisclosed'
    relation?: Relation
    department?: Department
    label?: string
  }
  department?: Department
  /** Confidence of `department` (1 = explicit). */
  departmentConfidence: number
  assumptions: IntentAssumptionExt[]
  explicitSlots: string[]
  /** True when the recipient department needs the non-blocking `recipient.department` question. */
  askRecipientDepartment: boolean
  /** True when no department could be resolved at all (blocking `department` question). */
  departmentUnresolved: boolean
  giftVerb: boolean
}

const t = (locale: Locale, zh: string, en: string): string => (locale === 'en' ? en : zh)

const DEPT_LABEL: Record<Department, string> = {
  women: '女裝',
  men: '男裝',
  unisex: '中性',
  kids: '童裝',
}

export function detectRecipient(input: {
  raw: string
  hits: readonly Hit[]
  locale: Locale
  ctx: IntentContextExt
  ageHint?: number
  /** Spans already claimed by references (a contact used as a reference is not a recipient). */
  referenceSpans: ReadonlyArray<[number, number]>
}): RecipientResult {
  const { raw, hits, locale, ctx, ageHint, referenceSpans } = input
  const assumptions: IntentAssumptionExt[] = []
  const explicitSlots: string[] = []
  const inReference = (h: Hit): boolean => referenceSpans.some(([s, e]) => h.start < e && h.end > s)

  const giftVerb =
    hits.some((h) => h.section === 'gift') ||
    hits.some((h) => /[送給買]/.test(h.term) && h.section !== 'self' && h.section !== 'followup')
  const adult = hits.some((h) => h.section === 'adult') || (ageHint !== undefined && ageHint >= 18)

  const surfaces = hits.filter((h) => h.section === 'recipient' && !h.negated && !inReference(h))
  const selfHits = hits.filter(
    (h) =>
      h.section === 'self' &&
      !surfaces.some((s) => s.start >= h.end && s.start <= h.end + 2) &&
      !hits.some((d) => d.section === 'deptWord' && d.start >= h.end && d.start <= h.end + 1),
  )
  const deptWords = hits.filter((h) => h.section === 'deptWord' && !h.negated)
  const deptTokens = hits.filter((h) => h.section === 'department' && !h.negated)
  const undisclosed = hits.find((h) => h.section === 'undisclosed')

  // contact names used as recipients ("gift for Alice", "送 Alice")
  let contactRecipient: { label: string; department?: Department } | undefined
  for (const c of ctx.contacts ?? []) {
    for (const name of [c.displayName, c.handle]) {
      if (!name) continue
      const re = new RegExp(`(?:for|送給|送|給|幫)\\s*${escapeRe(name)}(?![a-z0-9])`, 'i')
      const m = re.exec(raw)
      if (!m) continue
      const start = m.index + m[0].length - name.length
      if (referenceSpans.some(([s, e]) => start < e && start + name.length > s)) continue
      contactRecipient = { label: c.displayName, department: c.department }
      break
    }
    if (contactRecipient) break
  }

  let recipient: RecipientResult['recipient'] = { kind: 'self' }
  let relationDepartment: Department | undefined
  let relationDeptConfidence = 0
  let askRecipientDepartment = false

  const labelFor = (h: Hit): string => {
    const term = raw.slice(h.start, h.end)
    const prefixZh = raw.slice(Math.max(0, h.start - 2), h.start)
    const prefixEn = raw.slice(Math.max(0, h.start - 3), h.start).toLowerCase()
    if (/^(我的|我家)$/.test(prefixZh)) return raw.slice(h.start - 2, h.end)
    if (prefixZh.endsWith('我')) return raw.slice(h.start - 1, h.end)
    if (prefixEn === 'my ') return raw.slice(h.start - 3, h.end)
    return term.replace(/^for /, '')
  }

  if (undisclosed) {
    recipient = { kind: 'undisclosed', label: raw.slice(undisclosed.start, undisclosed.end) }
    explicitSlots.push('recipient')
  } else {
    const chosen = surfaces.find((s) => {
      const meta = s.meta as RecipientMeta
      return !meta.needsGift || giftVerb
    })
    if (chosen) {
      const meta = chosen.meta as RecipientMeta
      recipient = { kind: meta.kind, relation: meta.relation, label: labelFor(chosen) }
      explicitSlots.push('recipient')
      const dept = adult && meta.adultDepartment ? meta.adultDepartment : meta.department
      if (dept) {
        relationDepartment = dept
        relationDeptConfidence = meta.confidence
        recipient.department = dept
      } else {
        askRecipientDepartment = true
      }
    } else if (contactRecipient) {
      recipient = { kind: 'other', relation: 'friend', label: contactRecipient.label }
      explicitSlots.push('recipient')
      if (contactRecipient.department) {
        relationDepartment = contactRecipient.department
        relationDeptConfidence = 0.9
        recipient.department = contactRecipient.department
      } else askRecipientDepartment = true
    } else if (surfaces.length > 0) {
      // friend without a gift verb: self (朋友婚禮)
      recipient = { kind: 'self' }
      assumptions.push({
        slot: 'recipient.kind',
        value: 'self',
        confidence: 0.85,
        reason: t(
          locale,
          '提到朋友但沒有送禮動詞，視為自己穿',
          'Mentions a friend without a gift verb; shopping for yourself',
        ),
        source: 'utterance',
      })
    } else if (deptWords.length > 0 && selfHits.length === 0) {
      const w = deptWords[0]!
      const dept = w.value as Department
      const sameAsUser = ctx.user?.department === dept && !giftVerb
      if (sameAsUser) {
        recipient = { kind: 'self' }
        assumptions.push({
          slot: 'recipient.kind',
          value: 'self',
          confidence: 0.8,
          reason: t(
            locale,
            '與你的部門相同，視為自己穿',
            'Matches your own section; shopping for yourself',
          ),
          source: 'context',
        })
      } else {
        recipient = { kind: 'other', relation: 'unknown', label: labelFor(w), department: dept }
        assumptions.push({
          slot: 'recipient.kind',
          value: 'other',
          confidence: 0.8,
          reason: t(
            locale,
            `「${raw.slice(w.start, w.end)}」暗示是幫別人買`,
            `"${raw.slice(w.start, w.end)}" suggests it is for someone else`,
          ),
          source: 'utterance',
        })
      }
    } else if (selfHits.length > 0) {
      recipient = { kind: 'self' }
      explicitSlots.push('recipient')
    } else {
      recipient = { kind: 'self' }
      assumptions.push({
        slot: 'recipient.kind',
        value: 'self',
        confidence: 0.85,
        reason: t(
          locale,
          '沒有提到別人，預設是自己穿',
          'Nobody else mentioned; assuming it is for you',
        ),
        source: 'default',
      })
    }
  }

  // department precedence: explicit token → relation → ctx.user (self) → unisex
  let department: Department | undefined
  let departmentConfidence = 0
  let departmentUnresolved = false
  const explicitDept = deptTokens[0] ?? undefined
  const deptWord = deptWords[0] ?? undefined
  if (explicitDept) {
    department = explicitDept.value as Department
    departmentConfidence = 1
    explicitSlots.push('department')
    if (recipient.kind === 'other') recipient.department = department
    askRecipientDepartment = false
  } else if (deptWord) {
    department = deptWord.value as Department
    departmentConfidence = (deptWord.meta as { confidence: number }).confidence
    if (recipient.kind === 'other') recipient.department = department
    askRecipientDepartment = false
    assumptions.push({
      slot: 'department',
      value: department,
      confidence: departmentConfidence,
      reason: t(
        locale,
        `「${raw.slice(deptWord.start, deptWord.end)}」→ ${DEPT_LABEL[department]}`,
        `"${raw.slice(deptWord.start, deptWord.end)}" → ${department}`,
      ),
      source: 'utterance',
    })
  } else if (recipient.kind === 'undisclosed') {
    department = 'unisex'
    departmentConfidence = 1
  } else if (relationDepartment) {
    department = relationDepartment
    departmentConfidence = relationDeptConfidence
    if (relationDeptConfidence < 1) {
      assumptions.push({
        slot: 'department',
        value: department,
        confidence: relationDeptConfidence,
        reason: t(
          locale,
          `對象是${recipient.label ?? recipient.relation}，推測${DEPT_LABEL[department]}`,
          `Recipient is ${recipient.label ?? recipient.relation}; inferring ${department}`,
        ),
        source: 'utterance',
      })
    }
  } else if (recipient.kind === 'self' && ctx.user?.department) {
    department = ctx.user.department
    departmentConfidence = 0.9
    assumptions.push({
      slot: 'department',
      value: department,
      confidence: 0.9,
      reason: t(locale, '依你的個人資料', 'From your profile'),
      source: 'context',
    })
  } else if (recipient.kind === 'other' && askRecipientDepartment) {
    department = 'unisex'
    departmentConfidence = 0.5
    assumptions.push({
      slot: 'recipient.department',
      value: 'unisex',
      confidence: 0.5,
      reason: t(
        locale,
        '不確定對方性別，先用中性',
        'Recipient section unknown; defaulting to unisex',
      ),
      source: 'default',
    })
  } else {
    department = 'unisex'
    departmentConfidence = 0.4
    departmentUnresolved = true
    assumptions.push({
      slot: 'department',
      value: 'unisex',
      confidence: 0.4,
      reason: t(locale, '沒有部門線索，先用中性', 'No section cue; defaulting to unisex'),
      source: 'default',
    })
  }

  return {
    recipient,
    department,
    departmentConfidence,
    assumptions,
    explicitSlots,
    askRecipientDepartment:
      askRecipientDepartment && recipient.kind === 'other' && !explicitDept && !deptWord,
    departmentUnresolved,
    giftVerb,
  }
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
