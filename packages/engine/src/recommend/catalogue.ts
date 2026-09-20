/**
 * Taxonomy subcategory → the rows the catalogue actually stocks it as.
 *
 * `@lookline/catalog` describes 109 garments; `articles.subcategory` holds H&M's own
 * `product_type_name`, of which there are 106 and they are coarser — one `Trousers` for jeans,
 * chinos, cargos and wide-legs, one `Skirt` for every length, one `Jacket` for denim, biker and
 * puffer. Comparing the two vocabularies by name matched 24 of the 109, so a word the lexicon
 * recognised — 牛仔褲, 高領毛衣, 短裙 — narrowed to zero rows and the search fell through to
 * matching the query against the caption text, which is how a search for jeans came back
 * t-shirts.
 *
 * The bridge is the product type plus whatever column carries the distinction the type has
 * dropped: the vision pass filled `material`, `fit`, `length`, `neckline`, `silhouette`, `rise`,
 * `pocket_style`, `padding` and `knit_gauge`, so `jeans` is denim trousers and `mini-skirt` is a
 * skirt whose length is mini. Where the catalogue keeps no such distinction the entry is the
 * broad type alone — 3 934 jackets is a worse answer than 326 denim ones and a far better one
 * than none. Where it stocks nothing at all (`brooch`) there is no entry, and the free-text
 * fallback in `searchProducts` answers instead.
 */
import { findCategory } from '@lookline/catalog'
import { articles, eq, inArray, sql, type SQL } from '@lookline/db'
import type { Article } from '@lookline/db'

/** Columns a subcategory may be narrowed by, beyond its product type. */
const ATTR_COLUMNS = {
  material: articles.material,
  fit: articles.fit,
  length: articles.length,
  neckline: articles.neckline,
  silhouette: articles.silhouette,
  rise: articles.rise,
  pocketStyle: articles.pocketStyle,
  padding: articles.padding,
  knitGauge: articles.knitGauge,
  categoryGroup: articles.categoryGroup,
} as const

type AttrColumn = keyof typeof ATTR_COLUMNS

interface CatalogueMatch {
  /** `product_type_name` values, OR-ed. */
  types: readonly string[]
  /** Extra column constraints, AND-ed across columns and OR-ed within one. */
  attrs?: Readonly<Partial<Record<AttrColumn, readonly string[]>>>
}

// prettier-ignore
const MATCHES: Readonly<Record<string, CatalogueMatch>> = {
  // tops
  'tee': { types: ['T-shirt'] },
  'tank-top': { types: ['Vest top'] },
  'crop-top': { types: ['Top', 'Vest top', 'T-shirt'], attrs: { length: ['cropped'] } },
  'button-down-shirt': { types: ['Shirt'] },
  'linen-shirt': { types: ['Shirt'], attrs: { material: ['linen'] } },
  'polo-shirt': { types: ['Polo shirt'] },
  'blouse': { types: ['Blouse'] },
  'camisole': { types: ['Vest top'], attrs: { neckline: ['scoop', 'square', 'sweetheart'] } },
  'bodysuit': { types: ['Bodysuit'] },
  'crewneck-sweater': { types: ['Sweater'], attrs: { neckline: ['crew'] } },
  'cardigan': { types: ['Cardigan'] },
  'turtleneck': { types: ['Sweater'], attrs: { neckline: ['turtle', 'mock'] } },
  'hoodie': { types: ['Hoodie'] },
  // H&M files knits and sweatshirts alike as `Sweater`; only the knit ones carry a gauge.
  'sweatshirt': { types: ['Sweater'], attrs: { knitGauge: [''] } },
  // bottoms
  'jeans': { types: ['Trousers'], attrs: { material: ['denim'] } },
  'chinos': { types: ['Trousers'], attrs: { material: ['cotton'] } },
  'wide-leg-trousers': { types: ['Trousers'], attrs: { fit: ['wide'] } },
  'cargo-pants': { types: ['Trousers'], attrs: { pocketStyle: ['cargo'] } },
  'leggings': { types: ['Leggings/Tights'] },
  'casual-shorts': { types: ['Shorts'] },
  'mini-skirt': { types: ['Skirt'], attrs: { length: ['mini'] } },
  'midi-skirt': { types: ['Skirt'], attrs: { length: ['midi', 'knee'] } },
  'maxi-skirt': { types: ['Skirt'], attrs: { length: ['maxi', 'full'] } },
  'pleated-skirt': { types: ['Skirt'], attrs: { silhouette: ['pleated'] } },
  'overalls': { types: ['Dungarees'] },
  // dresses
  'mini-dress': { types: ['Dress'], attrs: { length: ['mini'] } },
  'midi-dress': { types: ['Dress'], attrs: { length: ['midi', 'knee'] } },
  'maxi-dress': { types: ['Dress'], attrs: { length: ['maxi', 'full'] } },
  'shirt-dress': { types: ['Dress'], attrs: { neckline: ['collar'] } },
  'wrap-dress': { types: ['Dress'], attrs: { silhouette: ['wrap'] } },
  'knit-dress': { types: ['Dress'], attrs: { knitGauge: ['fine', 'medium', 'chunky'] } },
  'slip-dress': { types: ['Dress'], attrs: { silhouette: ['slip'] } },
  'evening-gown': { types: ['Dress'], attrs: { length: ['maxi', 'full'] } },
  'jumpsuit': { types: ['Jumpsuit/Playsuit'] },
  // outerwear
  'denim-jacket': { types: ['Jacket'], attrs: { material: ['denim'] } },
  'bomber-jacket': { types: ['Jacket'], attrs: { length: ['short', 'cropped', 'regular'] } },
  'biker-jacket': { types: ['Jacket'], attrs: { material: ['leather'] } },
  'overshirt': { types: ['Jacket'], attrs: { material: ['cotton', 'denim', 'wool'] } },
  'puffer-jacket': { types: ['Jacket'], attrs: { padding: ['puffer', 'padded', 'quilted'] } },
  'windbreaker': { types: ['Jacket'], attrs: { material: ['polyester', 'nylon'] } },
  'fleece-jacket': { types: ['Jacket'], attrs: { material: ['fleece'] } },
  'parka': { types: ['Jacket'], attrs: { length: ['longline', 'full'] } },
  'trench-coat': { types: ['Coat'], attrs: { material: ['cotton', 'polyester'] } },
  'wool-coat': { types: ['Coat'], attrs: { material: ['wool'] } },
  // footwear
  'sneaker': { types: ['Sneakers'] },
  'running-shoe': { types: ['Sneakers'] },
  'loafer': { types: ['Moccasins', 'Flat shoe'] },
  'derby': { types: ['Flat shoe'] },
  'ballet-flat': { types: ['Ballerinas'] },
  'chelsea-boot': { types: ['Bootie', 'Boots'] },
  'ankle-boot': { types: ['Bootie', 'Boots'] },
  'knee-high-boot': { types: ['Boots'] },
  'combat-boot': { types: ['Boots'] },
  'hiking-boot': { types: ['Boots'] },
  'pump': { types: ['Pumps', 'Heels'] },
  'heeled-sandal': { types: ['Heeled sandals', 'Wedge'] },
  'flat-sandal': { types: ['Sandals'] },
  'slide': { types: ['Flip flop', 'Sandals'] },
  // bags
  'tote': { types: ['Tote bag', 'Bag'] },
  'shoulder-bag': { types: ['Shoulder bag', 'Bag'] },
  'crossbody': { types: ['Cross-body bag', 'Bag'] },
  'mini-bag': { types: ['Bag'] },
  'clutch': { types: ['Bag'] },
  'bucket-bag': { types: ['Bag'] },
  'backpack': { types: ['Backpack'] },
  'belt-bag': { types: ['Bumbag'] },
  'duffle': { types: ['Weekend/Gym bag'] },
  // accessories
  'baseball-cap': { types: ['Cap/peaked', 'Cap'] },
  'beanie': { types: ['Hat/beanie', 'Beanie'] },
  'bucket-hat': { types: ['Bucket hat', 'Hat/brim'] },
  'belt': { types: ['Belt'] },
  'watch': { types: ['Watch'] },
  'scarf': { types: ['Scarf'] },
  'tie': { types: ['Tie'] },
  'sunglasses': { types: ['Sunglasses'] },
  'socks': { types: ['Socks'] },
  'hair-clip': { types: ['Hair clip', 'Hair/alice band', 'Hair string', 'Hair ties'] },
  // jewelry
  'necklace': { types: ['Necklace'] },
  'earrings': { types: ['Earring'] },
  'bracelet': { types: ['Bracelet'] },
  'ring': { types: ['Ring'] },
  // activewear — the group is the only thing separating a running short from a beach one.
  'sports-bra': { types: ['Bra'] },
  'performance-tee': { types: ['T-shirt', 'Top'], attrs: { categoryGroup: ['activewear'] } },
  'training-tights': { types: ['Leggings/Tights'], attrs: { categoryGroup: ['activewear'] } },
  'running-shorts': { types: ['Shorts'], attrs: { categoryGroup: ['activewear'] } },
  'bike-shorts': { types: ['Shorts'], attrs: { categoryGroup: ['activewear'] } },
  'joggers': { types: ['Trousers'], attrs: { categoryGroup: ['activewear'] } },
  'track-jacket': { types: ['Hoodie', 'Sweater'], attrs: { categoryGroup: ['activewear'] } },
  // swimwear
  'bikini-top': { types: ['Bikini top', 'Swimwear top'] },
  'bikini-bottom': { types: ['Swimwear bottom'] },
  'one-piece': { types: ['Swimsuit'] },
  'swim-trunks': { types: ['Swimwear bottom'] },
  'rash-guard': { types: ['Swimwear top'] },
  'cover-up': { types: ['Sarong'] },
  // loungewear
  'pajama-set': { types: ['Pyjama set'] },
  'nightgown': { types: ['Night gown'] },
  'robe': { types: ['Robe'] },
  'sweatpants': { types: ['Trousers'], attrs: { material: ['jersey', 'fleece'] } },
  'lounge-shorts': { types: ['Shorts'], attrs: { material: ['jersey', 'fleece'] } },
  'slipper': { types: ['Slippers'] },
  // tailoring
  'two-piece-suit': { types: ['Blazer'] },
  'tuxedo': { types: ['Blazer'] },
  'blazer': { types: ['Blazer'] },
  'waistcoat': { types: ['Tailored Waistcoat', 'Outdoor Waistcoat'] },
  'tailored-trousers': { types: ['Trousers'], attrs: { material: ['wool', 'polyester', 'viscose'] } },
  'pencil-skirt': { types: ['Skirt'], attrs: { silhouette: ['pencil'] } },
  'sheath-dress': { types: ['Dress'], attrs: { silhouette: ['shift', 'column'] } },
  'dress-shirt': { types: ['Shirt'] },
}

/**
 * A category is the coarser ask — 裙子 is every skirt, not the four lengths one at a time — so it
 * matches the product types of its subcategories with none of their narrowing. Asking for skirts
 * by OR-ing `mini|midi|maxi|pleated` would drop every skirt the vision pass read no length off.
 */
function categoryMatch(slug: string): CatalogueMatch | undefined {
  const category = findCategory(slug)
  if (!category) return undefined
  const types = [...new Set(category.subcategories.flatMap((s) => MATCHES[s]?.types ?? []))]
  return types.length > 0 ? { types } : undefined
}

/** The subcategory or category slug's match, or undefined when the catalogue stocks neither. */
function matchFor(slug: string): CatalogueMatch | undefined {
  return MATCHES[slug] ?? categoryMatch(slug)
}

/** Whether the catalogue stocks anything under this taxonomy slug. */
export const isStocked = (slug: string): boolean => matchFor(slug) !== undefined

/**
 * The slug itself is accepted alongside the product types. Two things write an `Article`: the
 * H&M import, which stores `product_type_name`, and the fixture generator behind the .db tests,
 * which stores the taxonomy slug. A row that already spells out `mini-skirt` has said which
 * garment it is, so no attribute needs to confirm it.
 */
function matchWhere(slug: string, match: CatalogueMatch): SQL {
  const parts: SQL[] = [inArray(articles.subcategory, match.types)]
  for (const [column, values] of Object.entries(match.attrs ?? {}))
    parts.push(inArray(ATTR_COLUMNS[column as AttrColumn], values))
  const typed = parts.length === 1 ? parts[0]! : sql`(${sql.join(parts, sql` and `)})`
  return sql`(${typed} or ${eq(articles.subcategory, slug)})`
}

/**
 * Rows matching any of `slugs` (a subcategory or a category), or `null` when the catalogue
 * stocks none of them — the caller then leaves the filter off rather than narrowing to an
 * empty page.
 */
export function subcategoryWhere(slugs: readonly string[]): SQL | null {
  const parts = matchesOf(slugs).map(([slug, match]) => matchWhere(slug, match))
  if (parts.length === 0) return null
  return parts.length === 1 ? parts[0]! : sql`(${sql.join(parts, sql` or `)})`
}

/** Rows matching none of `slugs`; `null` when there is nothing to exclude. */
export function subcategoryExcludeWhere(slugs: readonly string[]): SQL | null {
  const where = subcategoryWhere(slugs)
  return where ? sql`not (${where})` : null
}

const matchesOf = (slugs: readonly string[]): Array<[string, CatalogueMatch]> =>
  slugs
    .map((slug) => [slug, matchFor(slug)] as const)
    .filter((e): e is [string, CatalogueMatch] => e[1] !== undefined)

/**
 * `subcategoryWhere` evaluated in process, for `MemoryRetriever` and the in-memory prefilter.
 * An empty `slugs`, or one naming only garments the catalogue does not stock, matches nothing —
 * the callers test that themselves and leave the filter off, exactly as the SQL side does.
 */
export function matchesSubcategory(article: Article, slugs: readonly string[]): boolean {
  return matchesOf(slugs).some(([slug, match]) => {
    if (article.subcategory === slug) return true
    if (!match.types.includes(article.subcategory)) return false
    for (const [column, values] of Object.entries(match.attrs ?? {})) {
      const value = article[column as AttrColumn]
      if (typeof value !== 'string' || !values.includes(value)) return false
    }
    return true
  })
}

/**
 * A garment noun for copy, given what the catalogue stores. `articles.subcategory` is H&M's
 * `product_type_name` — `Vest top`, `Hat/beanie` — which `findSubcategory` cannot resolve because
 * it keys on taxonomy slugs, so the Chinese surfaces printed raw English: an outfit pairing read
 * 「黑色Trousers」.
 *
 * Written out rather than derived from `MATCHES`: the taxonomy is finer than this vocabulary, so
 * every derivation had to guess which of the garments sharing a type lends it its name, and a
 * confident wrong noun (`Blazer` as 套裝) is worse than the English one. 106 types, and H&M's own
 * English noun is the fallback for anything it stops stocking under.
 */
// prettier-ignore
const NOUNS: Readonly<Record<string, readonly [zh: string, en?: string]>> = {
  'Trousers': ['長褲'], 'Dress': ['洋裝'], 'Sweater': ['針織衫'], 'T-shirt': ['T恤'],
  'Top': ['上衣'], 'Blouse': ['女衫'], 'Jacket': ['外套'], 'Shorts': ['短褲'],
  'Shirt': ['襯衫'], 'Vest top': ['背心'], 'Underwear bottom': ['內褲'], 'Skirt': ['裙子'],
  'Hoodie': ['連帽衫'], 'Bra': ['內衣'], 'Socks': ['襪子'],
  'Leggings/Tights': ['內搭褲', 'leggings'], 'Sneakers': ['運動鞋'], 'Cardigan': ['開襟衫'],
  'Hat/beanie': ['毛帽', 'beanie'], 'Garment Set': ['套裝'], 'Swimwear bottom': ['泳褲'],
  'Bag': ['包款', 'bag'], 'Earring': ['耳環'], 'Jumpsuit/Playsuit': ['連身褲', 'jumpsuit'],
  'Pyjama set': ['睡衣套裝'], 'Blazer': ['西裝外套'], 'Boots': ['靴子'],
  'Other accessories': ['配件', 'accessory'], 'Scarf': ['圍巾'], 'Bodysuit': ['連身衣'],
  'Bikini top': ['比基尼上衣'], 'Hair/alice band': ['髮箍', 'hair band'], 'Sandals': ['涼鞋'],
  'Swimsuit': ['連身泳衣'], 'Cap/peaked': ['棒球帽', 'cap'], 'Sunglasses': ['太陽眼鏡'],
  'Necklace': ['項鍊'], 'Underwear Tights': ['褲襪', 'tights'], 'Coat': ['大衣'],
  'Belt': ['皮帶'], 'Polo shirt': ['Polo衫'], 'Hat/brim': ['寬邊帽', 'brimmed hat'],
  'Pyjama jumpsuit/playsuit': ['連身睡衣', 'pyjama jumpsuit'], 'Other shoe': ['鞋款', 'shoe'],
  'Gloves': ['手套'], 'Ballerinas': ['芭蕾平底鞋', 'ballet flats'], 'Dungarees': ['吊帶褲'],
  'Slippers': ['拖鞋'], 'Hair clip': ['髮夾'], 'Ring': ['戒指'], 'Hair string': ['髮圈'],
  'Pyjama bottom': ['睡褲'], 'Heeled sandals': ['高跟涼鞋'], 'Swimwear set': ['泳裝套組'],
  'Pumps': ['高跟鞋'], 'Night gown': ['睡裙'], 'Underwear body': ['連身內衣'],
  'Bracelet': ['手鍊'], 'Flat shoe': ['平底鞋'], 'Outdoor Waistcoat': ['機能背心'],
  'Tie': ['領帶'], 'Robe': ['浴袍'], 'Outdoor trousers': ['機能長褲'],
  'Flip flop': ['夾腳拖'], 'Wedge': ['楔型鞋'], 'Kids Underwear top': ['童裝內衣'],
  'Costumes': ['變裝服'], 'Wallet': ['皮夾'], 'Tailored Waistcoat': ['西裝背心'],
  'Watch': ['手錶'], 'Sarong': ['沙龍罩紗'], 'Outdoor overall': ['連身工作服'],
  'Beanie': ['毛帽'], 'Swimwear top': ['泳衣上衣'], 'Sleeping sack': ['包被'],
  'Underwear set': ['內衣套組'], 'Bootie': ['踝靴'], 'Long John': ['衛生褲'],
  'Umbrella': ['雨傘'], 'Hair ties': ['髮束'], 'Heels': ['高跟鞋'],
  'Nipple covers': ['胸貼'], 'Underdress': ['襯裙'], 'Cap': ['帽子'],
  'Felt hat': ['毛氈帽'], 'Weekend/Gym bag': ['旅行袋', 'gym bag'],
  'Accessories set': ['配件組'], 'Bucket hat': ['漁夫帽'], 'Leg warmers': ['腿套'],
  'Underwear corset': ['馬甲'], 'Alice band': ['髮箍'], 'Backpack': ['後背包'],
  'Sleep Bag': ['睡袋'], 'Straw hat': ['草帽'], 'Cross-body bag': ['斜背包'],
  'Moccasins': ['莫卡辛鞋'], 'Baby Bib': ['圍兜'], 'Braces': ['吊帶'],
  'Eyeglasses': ['眼鏡'], 'Hairband': ['髮帶'], 'Shoulder bag': ['肩背包'],
  'Tote bag': ['托特包'], 'Bra extender': ['內衣延長扣'], 'Bumbag': ['腰包'],
  'Headband': ['髮帶'], 'Pre-walkers': ['學步鞋'],
}

/** Every product type `MATCHES` names, for the test that keeps `NOUNS` in step with it. */
export const MATCHED_TYPES: readonly string[] = [
  ...new Set(Object.values(MATCHES).flatMap((m) => m.types)),
]

/** The garment's noun in `locale`, falling back to what the catalogue itself calls it. */
export function garmentLabel(subcategory: string, locale: 'zh' | 'en'): string {
  const noun = NOUNS[subcategory]
  if (!noun) return subcategory
  return locale === 'zh' ? noun[0] : (noun[1] ?? subcategory.toLowerCase())
}
