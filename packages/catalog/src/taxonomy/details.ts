/**
 * Construction details and print subjects — the two vocabularies a photograph can answer and the
 * H&M columns cannot.
 *
 * These are read by the vision pass in `@lookline/hm`, written into `articles.attributes` as
 * booleans, and turned into `attribute:` tokens by the engine's lexicon, so "不要蕾絲邊" and
 * "有口袋的" travel the same path. They live here because the catalogue owns every vocabulary the
 * other packages share, and because one table cannot drift from itself.
 *
 * Deliberately disjoint from the keys `@lookline/hm`'s `garmentDetails` sets from `detail_desc`
 * (`pockets`, `hood`, `zip`, `elasticWaist`, `lined`): the two sets merge by plain spread, so
 * there is no key in both and no rule about which wins.
 *
 * Synonyms avoid terms that already belong to another section — bare `lace` and `sequin` are
 * materials, `pleated` is a silhouette and `belt` is a subcategory — so a detail never shadows
 * the thing itself.
 */
import type { VocabEntry } from './fits'
import { splitSynonyms } from './categories'

type DetailTuple = readonly [slug: string, name: string, labelZh: string, synonyms: string]

const vocab = (rows: readonly DetailTuple[]): VocabEntry[] =>
  rows.map(([slug, name, labelZh, synonyms]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
  }))

/** Visible construction details, in the order the vision schema lists them. */
// prettier-ignore
export const DESIGN_DETAILS: readonly VocabEntry[] = vocab([
  ['ruffle', 'Ruffle', '荷葉邊', 'ruffles, ruffled, frill, frills, 荷葉, 荷葉袖'],
  ['pleats', 'Pleats', '褶襉', 'pleat, knife pleat, 打褶, 百褶, 褶子'],
  ['cutout', 'Cut-Out', '鏤空', 'cut-out, cut out, cutouts, 挖空, 挖洞'],
  ['slit', 'Slit', '開衩', 'slits, side slit, thigh slit, 開叉, 高衩'],
  ['belt', 'Belted', '附腰帶', 'belted, with a belt, 綁腰帶, 收腰帶'],
  ['embroidery', 'Embroidery', '刺繡', 'embroidered, 繡花, 電繡'],
  ['sequin', 'Sequinned', '亮片裝飾', 'sequinned, sequined, 亮片點綴'],
  ['distressed', 'Distressed', '刷破', 'ripped, destroyed, 破壞, 做舊, 破洞'],
  ['ribbed', 'Ribbed', '羅紋', 'rib knit, ribbing, 坑條, 螺紋'],
  ['cableKnit', 'Cable Knit', '麻花針織', 'cable knit, cable-knit, cableknit, 麻花, 麻花紋'],
  ['laceTrim', 'Lace Trim', '蕾絲邊', 'lace trim, lace-trimmed, 蕾絲滾邊, 蕾絲拼接'],
  ['asymmetric', 'Asymmetric', '不對稱', 'asymmetrical, 斜襬, 單肩'],
  ['sheer', 'Sheer', '透膚', 'see-through, see through, 透視, 薄透'],
  ['tieBow', 'Tie Bow', '蝴蝶結', 'tie bow, ribbon tie, 綁帶, 蝴蝶結綁帶'],
  ['fringe', 'Fringe', '流蘇', 'fringed, tassel, tassels, 流蘇裝飾'],
  ['buttonFront', 'Button Front', '前開扣', 'button front, button-front, 排扣, 前襟扣'],
  ['logo', 'Logo', '標誌', 'logos, branding, 品牌標, logo印花'],
])

export const DESIGN_DETAIL_SLUGS: readonly string[] = DESIGN_DETAILS.map((d) => d.slug)

/**
 * What a print depicts. H&M's `graphical_appearance_name` files a dinosaur, a slogan and a field
 * of daisies under the same "All over pattern", and kidswear — a third of the catalogue — is
 * almost entirely printed.
 */
// prettier-ignore
export const PRINT_SUBJECTS: readonly VocabEntry[] = vocab([
  ['none', 'None', '無圖案', 'unprinted, 素面'],
  ['slogan', 'Slogan', '標語', 'text print, lettering, 文字, 字母印花'],
  ['character', 'Character', '卡通角色', 'cartoon, mascot, 卡通, 角色圖案'],
  ['floral', 'Floral', '花卉圖案', 'flowers, botanical, 花朵圖案, 植物圖案'],
  ['animal', 'Animal', '動物圖案', 'animals, 動物'],
  ['abstract', 'Abstract', '抽象圖案', 'abstract print, 抽象'],
  ['landscape', 'Landscape', '風景圖案', 'scenery, 風景'],
  ['photo', 'Photo', '照片印花', 'photographic print, photo print, 寫真印花'],
])

export const PRINT_SUBJECT_SLUGS: readonly string[] = PRINT_SUBJECTS.map((p) => p.slug)
