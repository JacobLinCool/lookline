/**
 * Patterns (§2.3, 15) and the material/pattern compatibility rules of docs/specs/CATALOG_SPEC.md.
 */
import type { CategoryGroup, PatternDef } from '../types'
import { CATEGORY_GROUPS, splitSynonyms } from './categories'

/** Secondary-colour rule applied when the pattern needs a second colour (§7.6). */
export type SecondaryColorRule =
  | 'none'
  | 'contrast'
  | 'contrast-soft'
  | 'white'
  | 'harmony'
  | 'leopard'
  | 'camo'

/** `PatternDef` plus the generator fields of §2.3 (`boldness` = the spec's `bold`). */
export interface PatternRow extends PatternDef {
  /** Groups the pattern may appear in (`*` in the spec = every group). */
  groups: readonly CategoryGroup[]
  /** Global weight before aesthetic boosts. */
  prior: number
  secondary: SecondaryColorRule
  texture: number
  formalityAdj: number
  trend: number
}

type PatternTuple = readonly [
  slug: string,
  name: string,
  labelZh: string,
  synonyms: string,
  groups: string,
  prior: number,
  secondary: SecondaryColorRule,
  bold: number,
  tex: number,
  fAdj: number,
  trend: number,
]

// prettier-ignore
const PATTERN_ROWS: readonly PatternTuple[] = [
  ['solid', 'Solid', '素色', 'plain, 純色, 單色', '*', 58, 'none', 0, 0, 0, 0.5],
  ['breton-stripe', 'Breton Stripe', '條紋', 'stripe, striped, 橫條, 條紋', 'tops bottoms dresses loungewear swimwear accessories activewear', 6, 'contrast', 0.35, 0.10, 0, 0.5],
  ['pinstripe', 'Pinstripe', '細直條', 'pin stripe, 西裝條紋', 'tailoring tops bottoms outerwear', 3, 'contrast-soft', 0.20, 0.10, 0.10, 0.5],
  ['gingham', 'Gingham', '格紋', 'check, picnic check, 方格, 小格紋', 'tops dresses bottoms accessories loungewear', 3, 'white', 0.40, 0.10, -0.02, 0.55],
  ['plaid', 'Plaid', '蘇格蘭格紋', 'tartan, flannel check, 格子, 大格紋', 'tops outerwear bottoms accessories loungewear tailoring', 5, 'harmony', 0.45, 0.25, 0, 0.5],
  ['houndstooth', 'Houndstooth', '千鳥格', 'dogtooth, 千鳥紋', 'tailoring outerwear bags accessories bottoms', 2, 'contrast', 0.40, 0.25, 0.08, 0.55],
  ['polka-dot', 'Polka Dot', '圓點', 'dots, spotted, 點點, 波點', 'dresses tops accessories loungewear swimwear', 3, 'contrast', 0.40, 0.05, 0, 0.5],
  ['ditsy-floral', 'Ditsy Floral', '小碎花', 'small floral, 碎花', 'dresses tops bottoms loungewear swimwear accessories', 4, 'harmony', 0.45, 0.10, -0.02, 0.55],
  ['bold-floral', 'Bold Floral', '大花卉', 'floral, tropical print, 花卉, 大花', 'dresses tops swimwear bottoms accessories', 3, 'harmony', 0.75, 0.15, -0.05, 0.6],
  ['leopard', 'Leopard', '豹紋', 'animal print, cheetah, 豹點', 'outerwear footwear bags accessories dresses tops', 2, 'leopard', 0.80, 0.35, -0.05, 0.7],
  ['tie-dye', 'Tie-Dye', '紮染', 'tiedye, 渲染', 'tops loungewear swimwear activewear', 2, 'harmony', 0.80, 0.15, -0.10, 0.55],
  ['camo', 'Camo', '迷彩', 'camouflage, 迷彩紋', 'outerwear bottoms bags accessories tops', 2, 'camo', 0.60, 0.15, -0.08, 0.5],
  ['colour-block', 'Colour-Block', '撞色', 'color block, panelled, 拼色', 'tops outerwear activewear swimwear bags footwear accessories', 3, 'harmony', 0.65, 0.05, -0.03, 0.65],
  ['monogram', 'Monogram', '老花', 'logo print, 字母印花, 滿版logo', 'bags accessories tops outerwear footwear', 2, 'contrast-soft', 0.55, 0.15, 0, 0.7],
  ['geometric', 'Geometric', '幾何', 'abstract, geo print, 幾何圖形', 'tops dresses bottoms accessories bags swimwear activewear jewelry', 2, 'harmony', 0.60, 0.15, -0.02, 0.6],
]

/** §2.3 — 15 patterns in spec order. */
export const PATTERNS: readonly PatternRow[] = PATTERN_ROWS.map(
  ([
    slug,
    name,
    labelZh,
    synonyms,
    groups,
    prior,
    secondary,
    boldness,
    texture,
    formalityAdj,
    trend,
  ]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
    groups: groups === '*' ? CATEGORY_GROUPS : (groups.split(' ') as CategoryGroup[]),
    prior,
    secondary,
    boldness,
    texture,
    formalityAdj,
    trend,
  }),
)

const PATTERN_BY_SLUG: ReadonlyMap<string, PatternRow> = new Map(PATTERNS.map((p) => [p.slug, p]))

export function findPattern(slug: string): PatternRow | undefined {
  return PATTERN_BY_SLUG.get(slug)
}

/** Materials that only ever carry `solid` (§2.3). */
export const PATTERNLESS_MATERIALS: readonly string[] = [
  'leather',
  'suede',
  'vegan-leather',
  'shearling',
  'rubber',
  'sterling-silver',
  'gold-vermeil',
  'stainless-steel',
  'pearl-resin',
  'sequin',
  'lace',
  'acetate',
]

/**
 * Materials with a restricted pattern list (§2.3). `denim` allows `breton-stripe` only in tops
 * (shirts) and `camo` only in bottoms; the group condition is encoded per pattern.
 */
export const MATERIAL_PATTERN_RULES: Readonly<
  Record<string, ReadonlyArray<{ pattern: string; groups?: readonly CategoryGroup[] }>>
> = {
  velvet: [{ pattern: 'solid' }, { pattern: 'leopard' }],
  denim: [
    { pattern: 'solid' },
    { pattern: 'breton-stripe', groups: ['tops'] },
    { pattern: 'camo', groups: ['bottoms'] },
  ],
}

/** Patterns allowed for a (group, material) pair, in spec order; always contains `solid`. */
export function patternsFor(group: CategoryGroup, material?: string | null): PatternRow[] {
  const byGroup = PATTERNS.filter((p) => p.groups.includes(group))
  if (!material) return byGroup
  if (PATTERNLESS_MATERIALS.includes(material)) return byGroup.filter((p) => p.slug === 'solid')
  const rules = MATERIAL_PATTERN_RULES[material]
  if (!rules) return byGroup
  return byGroup.filter((p) =>
    rules.some((r) => r.pattern === p.slug && (r.groups === undefined || r.groups.includes(group))),
  )
}
