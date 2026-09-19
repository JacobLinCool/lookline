/**
 * Outfit explanations (ENGINE_SPEC §3.4): pairing sentences, the outfit label and summary.
 */
import { AESTHETICS, axisIndex } from '@lookline/catalog'
import type { Season } from '@lookline/catalog'
import type { Product } from '@lookline/db'
import { aestheticLabel, colorFamilyLabel, seasonLabel, subcategoryLabel } from '../aesthetics'
import type { Locale } from '../intent-view'
import { formatTwd, round } from '../vector'
import { compat } from './compat'
import type { CompatBreakdown } from './compat'

const FORMALITY = axisIndex('formality')

export interface PairingSentence {
  a: Product
  b: Product
  compat: CompatBreakdown
  text: string
  caution: boolean
}

function shortName(p: Product, locale: Locale): string {
  const colour = colorFamilyLabel(p.colorFamily, locale)
  const sub = subcategoryLabel(p.subcategory, locale)
  return locale === 'zh'
    ? `${colour.endsWith('色') ? colour : `${colour}色`}${sub}`
    : `${colour} ${sub}`
}

/** The sentence for one pair, chosen by the dominant component (§3.4 table). */
export function pairingSentence(
  a: Product,
  b: Product,
  locale: Locale,
  season?: Season | null,
): PairingSentence {
  const c = compat(a, b, season)
  const A = shortName(a, locale)
  const B = shortName(b, locale)
  const famA = colorFamilyLabel(a.colorFamily, locale)
  const famB = colorFamilyLabel(b.colorFamily, locale)
  const zh = locale === 'zh'
  const fa = a.styleVector[FORMALITY] ?? 0.5
  const fb = b.styleVector[FORMALITY] ?? 0.5
  let text: string
  let caution = false
  if (c.score < 0.5) {
    caution = true
    if (Math.abs(fa - fb) > 0.35) {
      const dressier = fa > fb ? A : B
      const other = fa > fb ? B : A
      text = zh
        ? `注意：${dressier} 比 ${other} 正式很多`
        : `note: ${dressier} is much dressier than ${other}`
    } else if (c.colour.loud) {
      text = zh ? '注意：兩件都很搶眼' : 'note: two statement pieces'
    } else {
      text = zh ? '注意：色相衝突' : 'note: colours clash'
    }
    return { a, b, compat: c, text, caution }
  }
  const colourTerm = 0.35 * c.colour.score
  const aestheticTerm = 0.3 * c.aesthetic
  const formalityTerm = 0.2 * c.formality
  const seasonTerm = 0.15 * c.season
  const top = Math.max(colourTerm, aestheticTerm, formalityTerm, seasonTerm)
  if (top === colourTerm) {
    switch (c.colour.relation) {
      case 'one-neutral': {
        const neutralIsA = ['black', 'white', 'grey', 'neutral', 'brown'].includes(a.colorFamily)
        const N = neutralIsA ? A : B
        const O = neutralIsA ? B : A
        const famO = neutralIsA ? famB : famA
        text = zh
          ? `${N} 是中性色，撐住 ${O} 的${famO}`
          : `${N} is neutral, so it anchors the ${famO} ${O}`
        break
      }
      case 'both-neutral':
        text =
          famA === famB
            ? zh
              ? `${famA}同色系：中性配色`
              : `${famA} on ${famB}: neutral pairing`
            : zh
              ? `${famA} × ${famB}：中性配色`
              : `${famA} × ${famB}: neutral pairing`
        break
      case 'same-family':
        text = zh ? '同色系不同深淺，有層次' : 'tonal pairing'
        break
      case 'analogous':
        text = zh ? `${famA} 配 ${famB} 是鄰近色` : `${famA} and ${famB} are analogous`
        break
      case 'complementary':
        text = zh
          ? `${famA} 配 ${famB} 是互補色，有記憶點`
          : `${famA} and ${famB} are complementary`
        break
      case 'metallic':
        text = zh ? `${famA} 配 ${famB}，金屬感點綴` : `${famA} with ${famB} as a metallic accent`
        break
      default:
        text = zh ? `${famA} 配 ${famB}` : `${famA} with ${famB}`
    }
  } else if (top === aestheticTerm) {
    const shared =
      a.aesthetics.find((t) => b.aesthetics.includes(t)) ?? a.aesthetics[0] ?? b.aesthetics[0] ?? ''
    const tag = aestheticLabel(shared, locale)
    text = zh ? `都是${tag}路線` : `both lean ${tag}`
  } else if (top === formalityTerm) {
    text = zh ? '正式度一致' : 'same level of dressiness'
  } else {
    const s = season ?? a.seasons.find((x) => b.seasons.includes(x)) ?? 'all-season'
    text = zh ? `都適合${seasonLabel(s, 'zh')}穿` : `both suit ${seasonLabel(s, 'en')}`
  }
  return { a, b, compat: c, text, caution }
}

/** All pairs (unscored pairs skipped), best first. */
export function pairingSentences(
  products: readonly Product[],
  locale: Locale,
  season?: Season | null,
): PairingSentence[] {
  const out: PairingSentence[] = []
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const s = pairingSentence(products[i]!, products[j]!, locale, season)
      if (s.compat.skipped) continue
      out.push(s)
    }
  }
  return out.toSorted((x, y) => y.compat.score - x.compat.score)
}

export function formalityBucket(f: number, locale: Locale): string {
  if (f < 0.35) return locale === 'zh' ? '休閒' : 'Casual'
  if (f > 0.65) return locale === 'zh' ? '正式' : 'Formal'
  return locale === 'zh' ? '半正式' : 'Smart'
}

/** Label = top aesthetic of the mean A block + formality bucket. */
export function outfitLabel(styleVector: readonly number[], locale: Locale): string {
  let best = 0
  for (let i = 1; i < 32; i++) if ((styleVector[i] ?? 0) > (styleVector[best] ?? 0)) best = i
  const slug = AESTHETICS[best]?.slug ?? 'minimalist'
  const tag = aestheticLabel(slug, locale)
  const bucket = formalityBucket(styleVector[FORMALITY] ?? 0.5, locale)
  return locale === 'zh' ? `${tag}・${bucket}` : `${AESTHETICS[best]?.name ?? tag} · ${bucket}`
}

export interface OutfitSummaryInput {
  styleVector: readonly number[]
  total: number
  budget: number | null
  pairings: readonly PairingSentence[]
  /** Evidence of the strongest item factor (already localised). */
  strongestItemReason: string | null
  overBudget: boolean
  caveats?: readonly string[]
}

/** label + budget sentence + best pairing sentence + strongest item reason (§3.4). */
export function outfitSummary(input: OutfitSummaryInput, locale: Locale): string {
  const zh = locale === 'zh'
  const parts: string[] = []
  const label = outfitLabel(input.styleVector, locale)
  let budget: string
  if (input.budget) {
    const pct = Math.round((input.total / input.budget) * 100)
    budget = zh
      ? `總價 ${formatTwd(input.total)}（預算 ${formatTwd(input.budget).replace('NT$', '')} 的 ${pct}%）`
      : `${formatTwd(input.total)} (${pct}% of ${formatTwd(input.budget).replace('NT$', '')})`
  } else {
    budget = zh ? `總價 ${formatTwd(input.total)}` : `${formatTwd(input.total)} total`
  }
  parts.push(budget)
  const best = input.pairings.find((p) => !p.caution)
  if (best) parts.push(best.text)
  if (input.strongestItemReason) parts.push(input.strongestItemReason)
  const caveats = [...(input.caveats ?? [])]
  if (input.overBudget && input.budget) {
    const over = input.total - input.budget
    caveats.push(zh ? `超出預算 ${formatTwd(over)}` : `${formatTwd(over)} over budget`)
  }
  let text = zh ? `${label}：${parts.join('；')}` : `${label}: ${parts.join('; ')}`
  if (caveats.length > 0) text += zh ? `（${caveats.join('；')}）` : ` (${caveats.join('; ')})`
  return text
}

export { round }
