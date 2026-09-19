/**
 * Clarification policy (ENGINE_SPEC §1.5): at most 2, table order, `blocking` only for the first
 * two rows; `applyClarification` and `isClarificationAnswer`.
 */
import { normalizeText } from './normalize'
import type { Intent } from '../types'
import type { IntentClarificationExt, IntentExt } from './schema'

type Locale = IntentExt['locale']
const t = (locale: Locale, zh: string, en: string): string => (locale === 'en' ? en : zh)

const nonEmpty = (xs: readonly unknown[] | undefined): boolean => (xs?.length ?? 0) > 0

/** Ordered clarification rows of §1.5 evaluated against the finalised slots. */
export function buildClarifications(intent: IntentExt): IntentClarificationExt[] {
  const out: IntentClarificationExt[] = []
  const loc = intent.locale
  const assumption = (slot: string) => intent.assumptions.find((a) => a.slot === slot)
  const push = (c: IntentClarificationExt): void => {
    if (out.length < 2 && !out.some((x) => x.slot === c.slot)) out.push(c)
  }

  const dept = assumption('department')
  if (dept && dept.confidence <= 0.4 && dept.source === 'default') {
    push({
      slot: 'department',
      question: t(loc, '這件是女裝、男裝還是中性？', 'Which section should we shop?'),
      options: ['women', 'men', 'unisex'],
      blocking: true,
    })
  }
  const ref = intent.clarifications.find((c) => c.slot === 'referenceLookId')
  if (ref) push({ ...ref, blocking: true })

  const rd = assumption('recipient.department')
  if (
    intent.recipient.kind === 'other' &&
    !intent.recipient.department &&
    rd &&
    rd.confidence < 1 &&
    ['friend', 'colleague', 'boss', 'partner', 'unknown'].includes(
      intent.recipient.relation ?? 'unknown',
    )
  ) {
    push({
      slot: 'recipient.department',
      question: t(loc, '對方是男生還是女生？', 'Is it for a man or a woman?'),
      options: ['women', 'men', 'unisex'],
      blocking: false,
    })
  }
  if (
    intent.recipient.kind === 'other' &&
    intent.mode !== 'outfit' &&
    !nonEmpty(intent.categoryGroups)
  ) {
    const options = (
      intent.giftCategoryPrior ?? ['accessories', 'bags', 'loungewear', 'tops']
    ).slice(0, 4)
    push({
      slot: 'categoryGroups',
      question: t(loc, '想送哪一類？', 'What kind of gift?'),
      options,
      blocking: false,
    })
  }
  if (intent.mode === 'outfit' && !intent.budget) {
    push({
      slot: 'budget.max',
      question: t(loc, '預算大概多少？', 'Roughly what budget?'),
      options: ['3000', '6000', '12000', 'none'],
      blocking: false,
    })
  }
  const cur = assumption('budget.currency')
  if (intent.budget && cur && cur.confidence < 0.75) {
    push({
      slot: 'budget.currency',
      question: t(loc, '金額是台幣還是美金？', 'Is that TWD or USD?'),
      options: ['TWD', 'USD'],
      blocking: false,
    })
  }
  if (
    (intent.recipient.department === 'kids' || intent.department === 'kids') &&
    !intent.sizes?.alpha
  ) {
    push({
      slot: 'sizes.alpha',
      question: t(loc, '小朋友的尺寸？', "Kid's size?"),
      options: ['XS', 'S', 'M', 'L'],
      blocking: false,
    })
  }
  const nothingFilled =
    !nonEmpty(intent.categoryGroups) &&
    !nonEmpty(intent.subcategories) &&
    !nonEmpty(intent.colorFamilies) &&
    !nonEmpty(intent.aesthetics) &&
    !intent.occasion &&
    !intent.budget
  if (intent.mode === 'browse' && nothingFilled) {
    push({
      slot: 'occasion',
      question: t(loc, '想先看哪種場合？', 'What occasion?'),
      options: ['casual-daily', 'office', 'date', 'travel'],
      blocking: false,
    })
  }
  return out
}

const OPTION_LABELS: Readonly<Record<string, readonly string[]>> = {
  women: ['women', '女', '女裝', '女生', "women's"],
  men: ['men', '男', '男裝', '男生', "men's"],
  unisex: ['unisex', '中性', '都可以', 'either'],
  twd: ['twd', '台幣', 'nt', 'nt$'],
  usd: ['usd', '美金', '美元', 'dollars'],
  none: ['none', '不限', '無上限', 'no limit'],
}

/** True when `utterance` answers one of `previous.clarifications` (§1.5). */
export function isClarificationAnswer(
  utterance: string,
  previous: Intent | null | undefined,
): boolean {
  if (!previous || previous.clarifications.length === 0) return false
  const { text } = normalizeText(utterance)
  const norm = text.trim()
  if (norm.length === 0) return false
  for (const c of previous.clarifications) {
    for (const opt of c.options) {
      const labels = [opt.toLowerCase(), ...(OPTION_LABELS[opt.toLowerCase()] ?? [])]
      for (const label of labels) {
        if (norm === label) return true
        if (norm.length <= 12 && norm.includes(label)) return true
      }
    }
  }
  return false
}
