/**
 * Materials (§2.4, 37), material priors per subcategory and kids exclusions of
 * docs/specs/CATALOG_SPEC.md.
 */
import type { CategoryGroup, Department, MaterialDef } from '../types'
import { findSubcategory, splitSynonyms } from './categories'

export type CareCode =
  | 'wash'
  | 'hand-wash'
  | 'dry-clean'
  | 'technical'
  | 'leather'
  | 'wipe'
  | 'metal'

/** `MaterialDef` plus the generator fields of §2.4. */
export interface MaterialRow extends MaterialDef {
  structure: number
  priceFactor: number
  formalityAdj: number
  /** Adjective used by the name grammar. */
  adj: string
  care: CareCode
}

type MaterialTuple = readonly [
  slug: string,
  name: string,
  labelZh: string,
  synonyms: string,
  groups: string,
  warmth: number,
  texture: number,
  structure: number,
  priceFactor: number,
  formalityAdj: number,
  adj: string,
  care: CareCode,
]

// prettier-ignore
const MATERIAL_ROWS: readonly MaterialTuple[] = [
  ['cotton-jersey', 'Cotton Jersey', '棉質', 'cotton, jersey, 純棉, 棉', 'tops bottoms dresses loungewear activewear swimwear accessories', 0.35, 0.15, 0.15, 1.00, -0.05, 'Cotton', 'wash'],
  ['cotton-poplin', 'Cotton Poplin', '府綢棉', 'poplin, 棉布, 襯衫布', 'tops dresses bottoms outerwear loungewear tailoring', 0.30, 0.20, 0.45, 1.05, 0.05, 'Poplin', 'wash'],
  ['linen', 'Linen', '亞麻', 'flax, 麻, 麻料', 'tops bottoms dresses outerwear loungewear swimwear tailoring', 0.20, 0.45, 0.30, 1.20, 0, 'Linen', 'wash'],
  ['denim', 'Denim', '丹寧', 'jean, 牛仔布', 'tops bottoms dresses outerwear bags accessories', 0.45, 0.45, 0.60, 1.10, -0.05, 'Denim', 'wash'],
  ['corduroy', 'Corduroy', '燈芯絨', 'cord, 條絨', 'bottoms outerwear tops tailoring accessories', 0.60, 0.65, 0.50, 1.15, 0, 'Corduroy', 'wash'],
  ['twill', 'Cotton Twill', '斜紋棉', 'chino cloth, 斜紋布', 'bottoms outerwear tops tailoring bags accessories', 0.45, 0.35, 0.55, 1.05, 0.03, 'Twill', 'wash'],
  ['silk', 'Silk', '真絲', '蠶絲, 絲', 'tops dresses accessories loungewear tailoring', 0.35, 0.25, 0.20, 2.20, 0.15, 'Silk', 'dry-clean'],
  ['satin', 'Satin', '緞面', 'sateen, 緞, 絲光', 'tops dresses loungewear footwear bags accessories', 0.30, 0.20, 0.20, 1.30, 0.10, 'Satin', 'dry-clean'],
  ['chiffon', 'Chiffon', '雪紡', '雪紡紗', 'tops dresses swimwear', 0.15, 0.30, 0.10, 1.20, 0.05, 'Chiffon', 'hand-wash'],
  ['viscose', 'Viscose', '嫘縈', 'rayon, lyocell, tencel, 人造絲, 天絲', 'tops dresses bottoms loungewear', 0.30, 0.20, 0.20, 1.00, 0, 'Viscose', 'hand-wash'],
  ['wool', 'Wool', '羊毛', '毛料, 毛呢', 'outerwear tailoring bottoms tops accessories', 0.85, 0.55, 0.70, 1.60, 0.12, 'Wool', 'dry-clean'],
  ['merino', 'Merino', '美麗諾羊毛', 'merino wool, 美麗諾', 'tops accessories loungewear activewear', 0.75, 0.30, 0.25, 1.50, 0.05, 'Merino', 'hand-wash'],
  ['cashmere', 'Cashmere', '喀什米爾', '羊絨, 開司米', 'tops accessories loungewear outerwear', 0.90, 0.35, 0.20, 2.80, 0.10, 'Cashmere', 'hand-wash'],
  ['mohair-blend', 'Mohair Blend', '馬海毛', 'mohair, fuzzy knit, 馬海毛混紡', 'tops outerwear accessories', 0.85, 0.85, 0.15, 1.60, 0, 'Mohair', 'hand-wash'],
  ['tweed', 'Tweed', '粗花呢', '花呢', 'tailoring outerwear bottoms bags accessories', 0.80, 0.80, 0.75, 1.70, 0.12, 'Tweed', 'dry-clean'],
  ['flannel', 'Flannel', '法蘭絨', 'brushed cotton, 法蘭絨布', 'tops loungewear outerwear bottoms', 0.65, 0.50, 0.30, 1.05, -0.05, 'Flannel', 'wash'],
  ['fleece', 'Fleece', '刷毛', 'polar fleece, 搖粒絨, 絨', 'outerwear tops loungewear activewear accessories', 0.75, 0.60, 0.20, 1.00, -0.10, 'Fleece', 'wash'],
  ['french-terry', 'French Terry', '毛圈棉', 'terry, loopback, 毛圈布', 'tops bottoms loungewear activewear', 0.55, 0.40, 0.20, 1.00, -0.08, 'Terry', 'wash'],
  ['nylon', 'Nylon', '尼龍', '尼龍布', 'outerwear bags bottoms activewear accessories footwear', 0.40, 0.20, 0.45, 1.10, -0.05, 'Nylon', 'technical'],
  ['recycled-polyester', 'Recycled Polyester', '再生聚酯', 'polyester, recycled poly, 聚酯纖維, 環保紗', 'outerwear activewear bags accessories swimwear tops', 0.45, 0.20, 0.40, 0.95, -0.05, 'Recycled', 'technical'],
  ['performance-knit', 'Performance Knit', '機能針織', 'stretch knit, lycra, spandex, 彈性布, 機能布', 'activewear swimwear tops bottoms loungewear', 0.35, 0.15, 0.20, 1.05, -0.10, 'Stretch', 'technical'],
  ['leather', 'Leather', '皮革', 'full-grain, 真皮, 牛皮', 'outerwear footwear bags accessories bottoms', 0.60, 0.40, 0.85, 2.40, 0.10, 'Leather', 'leather'],
  ['suede', 'Suede', '麂皮', 'nubuck, 麂皮絨', 'footwear outerwear bags accessories bottoms', 0.60, 0.60, 0.60, 2.00, 0.05, 'Suede', 'leather'],
  ['vegan-leather', 'Vegan Leather', '合成皮', 'faux leather, pu leather, 人造皮, PU', 'outerwear footwear bags accessories bottoms', 0.50, 0.35, 0.70, 1.15, 0, 'Faux-Leather', 'leather'],
  ['shearling', 'Shearling', '羊羔毛', 'sherpa, teddy, 羔羊毛, 泰迪絨', 'outerwear footwear accessories bags', 0.95, 0.90, 0.50, 2.60, 0.05, 'Shearling', 'leather'],
  ['canvas', 'Canvas', '帆布', '帆布料', 'bags footwear outerwear accessories bottoms', 0.40, 0.50, 0.65, 0.95, -0.05, 'Canvas', 'wash'],
  ['raffia', 'Raffia', '拉菲草', 'straw, woven straw, 草編, 藤編', 'bags accessories footwear', 0.20, 0.85, 0.55, 1.10, -0.03, 'Raffia', 'wipe'],
  ['rubber', 'Rubber / EVA', '橡膠', 'eva, foam, 橡膠底, 發泡', 'footwear accessories', 0.25, 0.30, 0.60, 0.80, -0.15, 'Rubber', 'wipe'],
  ['mesh', 'Mesh', '網布', '網眼, 透氣網', 'activewear footwear tops swimwear accessories', 0.15, 0.35, 0.15, 0.95, -0.10, 'Mesh', 'technical'],
  ['velvet', 'Velvet', '絲絨', 'velour, 天鵝絨, 絨布', 'dresses tops outerwear footwear bags accessories tailoring', 0.65, 0.75, 0.35, 1.50, 0.10, 'Velvet', 'dry-clean'],
  ['lace', 'Lace', '蕾絲', '蕾絲布', 'tops dresses loungewear accessories', 0.20, 0.70, 0.10, 1.40, 0.05, 'Lace', 'hand-wash'],
  ['sequin', 'Sequin', '亮片', 'sequined, 珠片', 'dresses tops bags accessories', 0.30, 0.90, 0.35, 1.60, 0.05, 'Sequin', 'dry-clean'],
  ['sterling-silver', 'Sterling Silver', '純銀', '925 silver, 925銀, 銀飾', 'jewelry accessories', 0.10, 0.30, 0.90, 1.60, 0.05, 'Silver', 'metal'],
  ['gold-vermeil', 'Gold Vermeil', '鍍金銀', 'gold plated, 14k, 鍍金, 金飾', 'jewelry accessories', 0.10, 0.30, 0.90, 2.00, 0.08, 'Gold', 'metal'],
  ['stainless-steel', 'Stainless Steel', '不鏽鋼', 'steel, 鋼', 'jewelry accessories', 0.10, 0.25, 0.95, 0.90, 0, 'Steel', 'metal'],
  ['acetate', 'Acetate', '醋酸纖維', '板材, 膠框', 'accessories', 0.10, 0.25, 0.90, 1.20, 0, 'Acetate', 'wipe'],
  ['pearl-resin', 'Pearl & Resin', '珍珠樹脂', 'pearl, resin, 珍珠, 樹脂', 'jewelry accessories', 0.10, 0.45, 0.70, 1.10, 0.05, 'Pearl', 'metal'],
]

/** §2.4 — 37 materials in spec order. */
export const MATERIALS: readonly MaterialRow[] = MATERIAL_ROWS.map(
  ([
    slug,
    name,
    labelZh,
    synonyms,
    groups,
    warmth,
    texture,
    structure,
    priceFactor,
    formalityAdj,
    adj,
    care,
  ]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
    groups: groups.split(' ') as CategoryGroup[],
    warmth,
    texture,
    structure,
    priceFactor,
    formalityAdj,
    adj,
    care,
  }),
)

const MATERIAL_BY_SLUG: ReadonlyMap<string, MaterialRow> = new Map(
  MATERIALS.map((m) => [m.slug, m]),
)

export function findMaterial(slug: string): MaterialRow | undefined {
  return MATERIAL_BY_SLUG.get(slug)
}

/** Never used for kids articles; shearling is allowed on kids footwear (§2.4). */
export const KIDS_EXCLUDED_MATERIALS: readonly string[] = [
  'silk',
  'cashmere',
  'sequin',
  'lace',
  'mohair-blend',
  'shearling',
]

// ---------------------------------------------------------------------------
// Material priors per subcategory (§2.4)
// ---------------------------------------------------------------------------

function parsePrior(spec: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const token of spec.trim().split(/\s+/)) {
    const [slug, weight] = token.split(':')
    const w = Number(weight)
    if (!slug || !Number.isFinite(w))
      throw new Error(`@lookline/catalog: bad material prior "${spec}"`)
    out[slug] = w
  }
  return out
}

// prettier-ignore
const PRIOR_ROWS: ReadonlyArray<readonly [subcategories: string, prior: string]> = [
  ['tee, tank-top, crop-top, bodysuit', 'cotton-jersey:60 performance-knit:10 viscose:10 linen:6 satin:5'],
  ['performance-tee', 'performance-knit:60 recycled-polyester:25 mesh:15'],
  ['camisole', 'satin:30 cotton-jersey:25 silk:15 viscose:15 lace:10 chiffon:5'],
  ['polo-shirt', 'cotton-jersey:55 merino:15 performance-knit:15 linen:8'],
  ['button-down-shirt', 'cotton-poplin:55 twill:12 flannel:12 linen:8 denim:6 silk:4'],
  ['dress-shirt', 'cotton-poplin:80 twill:10 linen:10'],
  ['linen-shirt', 'linen:100'],
  ['blouse', 'viscose:30 cotton-poplin:25 silk:20 satin:12 chiffon:8 lace:5'],
  ['crewneck-sweater, cardigan, turtleneck', 'merino:30 wool:22 cotton-jersey:18 cashmere:12 mohair-blend:10'],
  ['hoodie, sweatshirt, sweatpants, joggers, lounge-shorts', 'french-terry:55 fleece:25 cotton-jersey:20'],
  ['jeans, denim-jacket', 'denim:100'],
  ['chinos, casual-shorts', 'twill:55 cotton-poplin:15 linen:12 nylon:10 corduroy:8'],
  ['cargo-pants', 'twill:40 nylon:25 cotton-poplin:15 linen:10 corduroy:10'],
  ['wide-leg-trousers, tailored-trousers', 'wool:25 twill:22 viscose:18 linen:15 cotton-poplin:12 corduroy:8'],
  ['leggings, training-tights, bike-shorts, sports-bra', 'performance-knit:70 cotton-jersey:20 mesh:10'],
  ['mini-skirt, midi-skirt, maxi-skirt, pleated-skirt, overalls', 'cotton-poplin:25 denim:22 viscose:18 twill:12 satin:8 wool:8 corduroy:7'],
  ['pencil-skirt', 'wool:35 twill:30 viscose:20 cotton-poplin:15'],
  ['mini-dress, midi-dress, maxi-dress, wrap-dress, shirt-dress', 'viscose:28 cotton-poplin:22 linen:14 cotton-jersey:10 chiffon:10 satin:8 silk:8'],
  ['slip-dress', 'satin:50 silk:30 viscose:20'],
  ['knit-dress', 'merino:35 cotton-jersey:30 wool:20 mohair-blend:15'],
  ['evening-gown', 'satin:30 silk:22 chiffon:15 velvet:12 sequin:11 wool:10'],
  ['sheath-dress', 'wool:40 viscose:30 cotton-poplin:20 satin:10'],
  ['jumpsuit', 'linen:25 twill:25 viscose:22 denim:15 satin:13'],
  ['bomber-jacket', 'nylon:50 recycled-polyester:28 satin:12 leather:10'],
  ['windbreaker, track-jacket', 'nylon:55 recycled-polyester:45'],
  ['biker-jacket', 'leather:55 vegan-leather:35 suede:10'],
  ['puffer-jacket, parka', 'nylon:55 recycled-polyester:35 shearling:5 canvas:5'],
  ['fleece-jacket', 'fleece:100'],
  ['overshirt', 'flannel:30 twill:25 corduroy:20 wool:15 denim:10'],
  ['trench-coat', 'twill:55 cotton-poplin:30 nylon:15'],
  ['wool-coat', 'wool:75 cashmere:15 tweed:10'],
  ['blazer, two-piece-suit, tuxedo, waistcoat', 'wool:50 twill:18 linen:14 tweed:10 velvet:8'],
  ['sneaker, running-shoe', 'mesh:30 canvas:25 leather:20 recycled-polyester:15 suede:10'],
  ['loafer, derby, pump, heeled-sandal, ballet-flat, chelsea-boot, ankle-boot, knee-high-boot, combat-boot', 'leather:55 suede:25 vegan-leather:15 velvet:5'],
  ['hiking-boot', 'leather:60 nylon:20 suede:15 vegan-leather:5'],
  ['flat-sandal, slide', 'leather:30 rubber:30 vegan-leather:20 raffia:10 shearling:10'],
  ['slipper', 'shearling:40 fleece:30 rubber:15 cotton-jersey:15'],
  ['tote, shoulder-bag, crossbody, mini-bag, clutch, bucket-bag, backpack, belt-bag, duffle', 'leather:35 vegan-leather:22 canvas:18 nylon:15 suede:5 raffia:5'],
  ['baseball-cap, bucket-hat', 'twill:50 cotton-poplin:20 nylon:15 canvas:10 corduroy:5'],
  ['beanie, scarf', 'merino:35 wool:25 cashmere:15 mohair-blend:10 cotton-jersey:15'],
  ['belt', 'leather:60 vegan-leather:25 canvas:15'],
  ['watch', 'stainless-steel:60 leather:30 nylon:10'],
  ['tie', 'silk:60 wool:20 cotton-poplin:20'],
  ['sunglasses', 'acetate:75 stainless-steel:25'],
  ['socks', 'cotton-jersey:70 merino:20 performance-knit:10'],
  ['hair-clip', 'acetate:50 satin:25 pearl-resin:25'],
  ['necklace, earrings, bracelet, ring, brooch', 'gold-vermeil:35 sterling-silver:35 stainless-steel:15 pearl-resin:15'],
  ['running-shorts', 'performance-knit:60 recycled-polyester:25 mesh:15'],
  ['bikini-top, bikini-bottom, one-piece, swim-trunks, rash-guard', 'performance-knit:75 recycled-polyester:20 mesh:5'],
  ['cover-up', 'linen:40 viscose:35 chiffon:25'],
  ['pajama-set, nightgown', 'cotton-jersey:35 cotton-poplin:25 satin:20 silk:10 flannel:10'],
  ['robe', 'cotton-jersey:35 fleece:25 satin:20 silk:10 linen:10'],
]

/** `MATERIAL_PRIOR[subcategory][material]` (§2.4). Unlisted-but-group-applicable materials weigh 1. */
export const MATERIAL_PRIOR: Readonly<Record<string, Readonly<Record<string, number>>>> = (() => {
  const out: Record<string, Record<string, number>> = {}
  for (const [subs, spec] of PRIOR_ROWS) {
    const prior = parsePrior(spec)
    for (const sub of splitSynonyms(subs)) out[sub] = prior
  }
  return out
})()

/**
 * Weighted material list for a subcategory in a department: the §2.4 prior plus every other
 * material applicable to the group at weight 1, minus the kids exclusions (shearling stays on
 * kids footwear). Empty for an unknown subcategory.
 */
export function materialsFor(
  subcategory: string,
  department: Department,
): Array<readonly [material: MaterialRow, weight: number]> {
  const sub = findSubcategory(subcategory)
  if (!sub) return []
  const prior = MATERIAL_PRIOR[subcategory] ?? {}
  const out: Array<readonly [MaterialRow, number]> = []
  for (const m of MATERIALS) {
    const listed = prior[m.slug]
    if (listed === undefined && !m.groups.includes(sub.group)) continue
    if (department === 'kids' && KIDS_EXCLUDED_MATERIALS.includes(m.slug)) {
      if (!(m.slug === 'shearling' && sub.group === 'footwear')) continue
    }
    out.push([m, listed ?? 1])
  }
  return out
}
