/**
 * Engine-owned synonym tables (ENGINE_SPEC §1.4.5–1.4.6) unioned with the catalog `LEXICON`, the
 * dictionary built from them, and the longest-match-first scanner (§1.4 step 5).
 *
 * Every aesthetic entry is keyed by a CATALOG slug; spec rows were re-keyed through
 * `SPEC_AESTHETIC_ALIASES`. Engine phrase sections (tier 0) win over catalog sections (tier 1)
 * when both match the same longest span, except `aesthetic` and `occasion`, which always fire.
 */
import { COLORS, DESIGN_DETAILS, LEXICON, SUBCATEGORIES } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Department } from '@lookline/catalog'
import {
  CATALOG_OCCASION_MAP,
  COLOR_GROUP_WORDS,
  EXTRA_COLOR_NAMES,
  FLORAL_WORDS,
  FOLLOW_UP_PHRASES,
  OCCASIONS,
  canonicalAesthetic,
} from '../constants'
import type { FollowUpKind } from '../constants'
import { isLatinAlnum } from './normalize'
import type { Relation } from './schema'

export type Section =
  // tier 1 — catalog-like
  | 'aesthetic'
  | 'color'
  | 'colorFamily'
  | 'subcategory'
  | 'group'
  | 'material'
  | 'pattern'
  | 'fit'
  | 'sleeve'
  | 'season'
  | 'department'
  | 'occasion'
  // tier 0 — engine phrases
  | 'modifier'
  | 'mode'
  | 'browse'
  | 'colorGroup'
  | 'extraColor'
  | 'floral'
  | 'recipient'
  | 'deptWord'
  | 'gift'
  | 'self'
  | 'undisclosed'
  | 'negation'
  | 'qualifier'
  | 'currency'
  | 'quantityWord'
  | 'scope'
  | 'cheap'
  | 'luxury'
  | 'flexible'
  | 'dateWord'
  | 'tempWord'
  | 'adult'
  | 'allergy'
  | 'attribute'
  | 'followup'
  | 'noop'

const TIER0: ReadonlySet<Section> = new Set<Section>([
  'modifier',
  'mode',
  'browse',
  'colorGroup',
  'extraColor',
  'floral',
  'recipient',
  'deptWord',
  'gift',
  'self',
  'undisclosed',
  'negation',
  'qualifier',
  'currency',
  'quantityWord',
  'scope',
  'cheap',
  'luxury',
  'flexible',
  'dateWord',
  'tempWord',
  'adult',
  'allergy',
  'attribute',
  'followup',
  'noop',
])
const ALWAYS: ReadonlySet<Section> = new Set<Section>(['aesthetic', 'occasion'])
const NON_CONSUMING: ReadonlySet<Section> = new Set<Section>(['browse'])

export interface ModifierMeta {
  axes?: Readonly<Partial<Record<string, number>>>
  fits?: readonly string[]
  /** Degree phrases (`太正式`) are complaints already; negation never flips them. */
  degree?: boolean
  /** `不要太短`: subcategory avoids by group present. */
  subAvoid?: Readonly<Partial<Record<CategoryGroup, readonly string[]>>>
  practical?: boolean
}

export interface RecipientMeta {
  kind: 'self' | 'other' | 'undisclosed'
  relation?: Relation
  department?: Department
  confidence: number
  /** Friend-type rows are gifts only with a gift verb. */
  needsGift?: boolean
  /** `son`/`daughter`: department when the recipient is an adult. */
  adultDepartment?: Department
}

export interface Entry {
  term: string
  section: Section
  value: string
  weight?: number
  meta?: unknown
}

export interface Hit {
  section: Section
  value: string
  term: string
  start: number
  end: number
  clause: number
  weight?: number
  meta?: unknown
  negated: boolean
}

// ---------------------------------------------------------------------------
// §1.4.5 aesthetic supplements (catalog slugs)
// ---------------------------------------------------------------------------

interface AestheticSupplement {
  slug: string
  explicit: readonly string[]
  vibe: readonly string[]
  weight: number
}

const sp = (list: string): readonly string[] => list.split(/\s*,\s*/).filter((x) => x.length > 0)

// prettier-ignore
const AESTHETIC_SUPPLEMENTS: readonly AestheticSupplement[] = [
  { slug: 'minimalist', explicit: sp('極簡, 簡約, minimal, minimalist'), vibe: sp('簡單, 素, 素色, simple, basic, understated, clean'), weight: 0.7 },
  { slug: 'quiet-luxury', explicit: sp('quiet luxury, 靜奢, 低調奢華, old money, 老錢, 老錢風, classic style'), vibe: sp('質感, 有質感, elevated, polished, 貴氣, 名媛, heritage, 百搭, 耐看, staple, versatile'), weight: 0.6 },
  { slug: 'preppy', explicit: sp('學院, 學院風, preppy, ivy'), vibe: sp('校園風, collegiate, varsity'), weight: 0.6 },
  { slug: 'k-street', explicit: sp('韓系, 韓風, korean, k-style, korean minimal, korean street'), vibe: sp('韓國, 韓國風'), weight: 0.8 },
  { slug: 'scandi', explicit: sp('北歐, scandi, scandinavian, nordic'), vibe: [], weight: 0.6 },
  { slug: 'clean-girl', explicit: sp('clean girl, 乾淨系'), vibe: sp('乾淨, 素淨, fresh'), weight: 0.5 },
  { slug: 'streetwear', explicit: sp('街頭, 街頭風, streetwear, street'), vibe: sp('潮, 潮牌, hype, skate'), weight: 0.7 },
  { slug: 'y2k', explicit: sp('y2k, 千禧'), vibe: sp('辣妹, 2000s'), weight: 0.6 },
  { slug: 'grunge', explicit: sp('grunge, 頹廢, 油漬搖滾'), vibe: sp('破舊, distressed, 90s'), weight: 0.6 },
  { slug: 'punk', explicit: sp('龐克, 朋克, punk'), vibe: [], weight: 0.6 },
  { slug: 'goth', explicit: sp('哥德, goth, gothic'), vibe: sp('暗黑, 暗系, dark'), weight: 0.6 },
  { slug: 'dark-academia', explicit: sp('dark academia, 暗黑學院'), vibe: [], weight: 0.6 },
  { slug: 'techwear', explicit: sp('techwear, 機能風, 科技感'), vibe: sp('tactical'), weight: 0.7 },
  { slug: 'gorpcore', explicit: sp('gorpcore, 山系'), vibe: sp('登山, 健行, hiking, outdoorsy, trail, 露營, camping, 戶外, outdoor'), weight: 0.8 },
  { slug: 'athleisure', explicit: sp('athleisure, 運動休閒, 運動風'), vibe: sp('運動, gym, running, 跑步, sporty'), weight: 0.7 },
  { slug: 'workwear', explicit: sp('工裝, 工裝風, workwear, 軍裝, 軍風, military'), vibe: sp('utility, 工作褲, army, 軍綠'), weight: 0.6 },
  { slug: 'normcore', explicit: sp('normcore, 基本款'), vibe: sp('平常, 普通, 不張揚, everyday, plain'), weight: 0.5 },
  { slug: 'romantic', explicit: sp('浪漫, romantic'), vibe: sp('柔美, 溫柔, 仙女, 飄逸, feminine, flowy'), weight: 0.6 },
  { slug: 'coquette', explicit: sp('coquette, 甜美, 少女'), vibe: sp('蝴蝶結, bow, bows, 可愛, cute, girly'), weight: 0.6 },
  { slug: 'cottagecore', explicit: sp('cottagecore, 田園, 森林系, 森女'), vibe: sp('碎花, floral, prairie'), weight: 0.6 },
  { slug: 'boho', explicit: sp('波希米亞, 波西米亞, boho, bohemian'), vibe: sp('民族風, folk'), weight: 0.7 },
  { slug: 'balletcore', explicit: sp('芭蕾, 芭蕾風, ballet, balletcore'), vibe: [], weight: 0.6 },
  { slug: 'retro-70s', explicit: sp('復古, vintage, retro, 古著'), vibe: sp('懷舊, 70s, 80s'), weight: 0.8 },
  { slug: 'glam', explicit: sp('華麗, glam, glamorous, 晚宴感'), vibe: sp('閃, 亮片, sparkly, sequin, sequins'), weight: 0.5 },
  { slug: 'avant-garde', explicit: sp('前衛, avant-garde, avant garde, 解構, 藝術, artsy, eclectic, 混搭'), vibe: sp('設計感, experimental, 文青, 個性, creative, arty'), weight: 0.6 },
  { slug: 'city-boy', explicit: sp('原宿, harajuku, 日系街頭, city boy, 日系'), vibe: sp('japanese street'), weight: 0.6 },
  { slug: 'resort', explicit: sp('度假, 渡假, resort, vacation, 度假感, 渡假感'), vibe: sp('海島, 海邊感, 海島風'), weight: 0.6 },
  { slug: 'western', explicit: sp('西部, western, cowboy, 牛仔風'), vibe: sp('牛仔靴'), weight: 0.5 },
  { slug: 'coastal', explicit: sp('coastal, 海岸'), vibe: [], weight: 0.6 },
  { slug: 'corporate-chic', explicit: sp('corporate chic, 職場風, office siren'), vibe: sp('職場, 通勤感'), weight: 0.6 },
  { slug: 'mob-wife', explicit: sp('mob wife, 貴婦風'), vibe: [], weight: 0.6 },
  { slug: 'kidcore', explicit: sp('kidcore, 童趣'), vibe: [], weight: 0.6 },
]

// ---------------------------------------------------------------------------
// §1.4.6 modifiers
// ---------------------------------------------------------------------------

interface ModifierRow {
  terms: readonly string[]
  meta: ModifierMeta
}

// prettier-ignore
const MODIFIERS: readonly ModifierRow[] = [
  { terms: sp('正式, 隆重, formal, dressy, dressed up'), meta: { axes: { formality: 0.5 } } },
  { terms: sp('不要太正式, 不想太正式, 別太正式, 不用太正式, 不需要太正式, not too formal, not too dressy, semi-formal, semi formal, smart casual, smart-casual'), meta: { axes: { formality: -0.35 }, degree: true } },
  { terms: sp('太正式, too formal, too dressy'), meta: { axes: { formality: -0.4 }, degree: true } },
  { terms: sp('休閒, 隨性, 輕鬆, casual, laid-back, laid back, chill'), meta: { axes: { formality: -0.4 } } },
  { terms: sp('relaxed'), meta: { axes: { formality: -0.4 }, fits: ['relaxed'] } },
  { terms: sp('保暖, 厚, 厚一點, 溫暖, 暖, warm, warmer, cozy, cosy, thick'), meta: { axes: { warmth: 0.5 } } },
  { terms: sp('涼, 涼快, 涼爽, 透氣, 輕薄, 薄, 薄一點, breathable, light, lightweight, cool, airy'), meta: { axes: { warmth: -0.5 } } },
  { terms: sp('低調, 素, 素雅, subtle, understated, low-key, low key, muted'), meta: { axes: { boldness: -0.4 } } },
  { terms: sp('不要太花, 不要太俗, 不要太浮誇, 不要太誇張, 不要太亮, 太花, 太俗, 太浮誇, 太誇張, 太亮, not too loud, not too flashy, not trying too hard, nothing too loud, too loud, too flashy, too much'), meta: { axes: { boldness: -0.4 }, degree: true } },
  { terms: sp('亮眼, 搶眼, 顯眼, 吸睛, bold, statement, standout, stand out, eye-catching, flashy, loud'), meta: { axes: { boldness: 0.5 } } },
  { terms: sp('挺, 硬挺, 有型, structured, sharp, tailored, crisp'), meta: { axes: { structure: 0.4 } } },
  { terms: sp('軟, 柔, 柔軟, 飄逸, flowy, drapey, soft, drape'), meta: { axes: { structure: -0.4 } } },
  { terms: sp('舒適, 舒服, comfortable, comfy, comfort'), meta: { axes: { structure: -0.3 }, fits: ['relaxed'] } },
  { terms: sp('遮, 保守, 遮一點, 包緊, 不要太露, 不想太露, modest, covered, covered up, conservative, not too revealing'), meta: { axes: { coverage: 0.4 }, degree: true } },
  { terms: sp('露, 性感, 露一點, sexy, revealing'), meta: { axes: { coverage: -0.4 } } },
  { terms: sp('不要太短, 不想太短, 太短, not too short, too short'), meta: { axes: { coverage: 0.3 }, degree: true, subAvoid: { dresses: ['mini-dress'], bottoms: ['casual-shorts', 'mini-skirt'] } } },
  { terms: sp('流行, 當季, 新款, 潮, 時髦, 最近流行, 現在流行, trendy, trending, in-season, in season, fashionable, on trend, latest'), meta: { axes: { trendiness: 0.5 } } },
  { terms: sp('耐看, 不退流行, 經典款, 經典, timeless, classic'), meta: { axes: { trendiness: -0.3 } } },
  { terms: sp('太貴, too expensive, pricey, too pricey'), meta: { axes: { 'price-tier': -0.3 }, degree: true } },
  { terms: sp('顯瘦, slimming, flattering'), meta: { fits: ['slim'] } },
  { terms: sp('baggy'), meta: { fits: ['oversized'] } },
  { terms: sp('實用, practical, functional'), meta: { axes: { structure: 0.2 }, practical: true } },
]

interface AttributeRow {
  terms: readonly string[]
  value: string
  /** `have` unless negated; `avoid` rows are avoids even without a negation trigger. */
  polarity: 'have' | 'avoid'
}

// prettier-ignore
const ATTRIBUTES: readonly AttributeRow[] = [
  { terms: sp('防水, waterproof, windproof, water resistant, water-resistant'), value: 'waterproof', polarity: 'have' },
  { terms: sp('口袋, 有口袋, pockets, with pockets'), value: 'pockets', polarity: 'have' },
  { terms: sp('無logo, 沒logo, 沒有logo, 不要logo, no logo, logo-free, logo free, without logo, without logos, no logos'), value: 'logo', polarity: 'avoid' },
  { terms: sp('logo, logos, 有logo'), value: 'logo', polarity: 'have' },
  { terms: sp('彈性, 有彈性, stretch, stretchy'), value: 'stretch', polarity: 'have' },
  { terms: sp('內裡, 有內裡, lined, with lining'), value: 'lined', polarity: 'have' },
]

// ---------------------------------------------------------------------------
// recipient surfaces (§1.4.4)
// ---------------------------------------------------------------------------

interface RecipientRow {
  terms: readonly string[]
  meta: RecipientMeta
}

// prettier-ignore
const RECIPIENTS: readonly RecipientRow[] = [
  { terms: sp('爸, 爸爸, 父親, 老爸, dad, father, daddy, papa'), meta: { kind: 'other', relation: 'father', department: 'men', confidence: 0.95 } },
  { terms: sp('媽, 媽媽, 母親, 老媽, mom, mum, mother, mommy, mama'), meta: { kind: 'other', relation: 'mother', department: 'women', confidence: 0.95 } },
  { terms: sp('男友, 男朋友, boyfriend, bf'), meta: { kind: 'other', relation: 'partner', department: 'men', confidence: 0.95 } },
  { terms: sp('女友, 女朋友, girlfriend, gf'), meta: { kind: 'other', relation: 'partner', department: 'women', confidence: 0.95 } },
  { terms: sp('老公, 先生, 丈夫, husband, hubby'), meta: { kind: 'other', relation: 'spouse', department: 'men', confidence: 0.95 } },
  { terms: sp('老婆, 太太, 妻子, wife'), meta: { kind: 'other', relation: 'spouse', department: 'women', confidence: 0.95 } },
  { terms: sp('另一半, 伴侶, 對象, partner, significant other'), meta: { kind: 'other', relation: 'partner', confidence: 0.8 } },
  { terms: sp('兒子, son'), meta: { kind: 'other', relation: 'child', department: 'kids', confidence: 0.8, adultDepartment: 'men' } },
  { terms: sp('女兒, daughter'), meta: { kind: 'other', relation: 'child', department: 'kids', confidence: 0.8, adultDepartment: 'women' } },
  { terms: sp('小孩, 小朋友, 孩子, 姪子, 姪女, 外甥, 外甥女, kid, kids, child, children, nephew, niece, toddler'), meta: { kind: 'other', relation: 'child', department: 'kids', confidence: 0.9 } },
  { terms: sp('哥, 哥哥, 弟, 弟弟, 兄弟, brother, bro'), meta: { kind: 'other', relation: 'sibling', department: 'men', confidence: 0.9 } },
  { terms: sp('姊, 姊姊, 姐, 姐姐, 妹, 妹妹, 姊妹, sister, sis'), meta: { kind: 'other', relation: 'sibling', department: 'women', confidence: 0.9 } },
  { terms: sp('朋友, 好友, 閨蜜, 死黨, friend, friends, buddy, bestie, pal'), meta: { kind: 'other', relation: 'friend', confidence: 0.8, needsGift: true } },
  { terms: sp('同事, colleague, coworker, co-worker, teammate'), meta: { kind: 'other', relation: 'colleague', confidence: 0.8 } },
  { terms: sp('老闆, 主管, 上司, boss, manager'), meta: { kind: 'other', relation: 'boss', confidence: 0.8 } },
]

interface DeptWordRow {
  terms: readonly string[]
  department: Department
  confidence: number
}

// prettier-ignore
const DEPT_WORDS: readonly DeptWordRow[] = [
  { terms: sp("男生, 男的, 男生版, 男款, 男用, for a guy, for a man, for him, for a boy, for guys, for men, men's, mens"), department: 'men', confidence: 0.8 },
  { terms: sp("女生, 女的, 女生版, 女款, 女用, for a girl, for a woman, for her, for girls, for women, women's, womens, ladies"), department: 'women', confidence: 0.8 },
  { terms: sp("童裝, 兒童, kids', children's, for kids, for a kid, for children, kids size"), department: 'kids', confidence: 0.95 },
]

const GIFT_VERBS = sp(
  '送, 送給, 買給, 給, 幫, 禮物, 生日禮物, gift, gift for, gifts, present for, a present, for my, buy for, get my, get him, get her, get them, for him, for her',
)
const SELF_MARKERS = sp(
  "我, 我要, 我想, 我想要, 幫我, 給我, 自己, 我自己, i, me, my, myself, i want, i need, i'm, im, for me, for myself",
)
const UNDISCLOSED = sp(
  "不方便說, 不想說, 不便透露, 不說, rather not say, doesn't matter who, prefer not to say, not saying who, none of your business",
)
const NEGATIONS = sp(
  "不要, 不想, 別, 不能, 不喜歡, 不愛, 避免, 除了, 不含, 沒有, 拒絕, 不用, 不是, 不太, no, not, don't, dont, without, avoid, except, never, anything but, hate, nothing",
)
const NOOPS = sp(
  '有沒有, 小姐, 特別, 分別, 區別, 別的, 別人, 不錯, 不會, 個別, 差別, 級別, 他, 她, 他的, 她的, 他們, 她們, 不知道要, 有點',
)

interface QualifierRow {
  terms: readonly string[]
  value: 'max' | 'around' | 'min' | 'soft' | 'between'
  /** Where the qualifier sits relative to the number. */
  side: 'before' | 'after' | 'both'
}

// prettier-ignore
const QUALIFIERS: readonly QualifierRow[] = [
  { terms: sp('以內, 以下, 之內, 內, 上限, or less, or under, max, maximum, tops'), value: 'max', side: 'after' },
  { terms: sp('不超過, 不要超過, 不能超過, 最多, 頂多, 不到, 上限, under, below, max, maximum, up to, less than, within, no more than, at most, cap, capped at, budget of'), value: 'max', side: 'before' },
  { terms: sp('左右, 上下, ish'), value: 'around', side: 'after' },
  { terms: sp('大概, 大約, 約, 差不多, around, about, roughly, approximately, approx, ~'), value: 'around', side: 'both' },
  { terms: sp('以上, 起跳, or more, and up, plus, +'), value: 'min', side: 'after' },
  { terms: sp('至少, 最少, over, at least, more than, minimum, min, starting at, starting from, from'), value: 'min', side: 'before' },
  { terms: sp('預算, budget'), value: 'soft', side: 'both' },
  { terms: sp('between, 介於'), value: 'between', side: 'before' },
]

const CURRENCY_TOKENS = sp(
  'nt$, ntd, twd, 元, 塊, 台幣, 新台幣, nt, us$, usd, 美金, 美元, dollars, dollar, bucks, jpy, ¥, 円, 日圓, 日幣, yen, eur, €, 歐元, euro, euros, gbp, £, 英鎊, pound, pounds, krw, ₩, 韓元, won, cny, rmb, 人民幣, yuan, hkd, hk$, 港幣, sgd, s$, 新幣, aud, a$, 澳幣, $',
)
const QUANTITY_WORDS: ReadonlyArray<readonly [string, number]> = [
  ['一件', 1],
  ['買件', 1],
  ['找件', 1],
  ['挑件', 1],
  ['選件', 1],
  ['要件', 1],
  ['來件', 1],
  ['一雙', 1],
  ['一個', 1],
  ['一頂', 1],
  ['a pair of', 1],
  ['a piece', 1],
  ['one piece', 1],
  ['a couple of', 2],
  ['a few', 3],
]
const SCOPE_WORDS = sp('每件, 每一件, 每個, each, per item, per piece, apiece')
const CHEAP_WORDS = sp(
  '便宜, 平價, 學生價, 省錢, 划算, 低價, cheap, affordable, on a budget, budget-friendly, budget friendly, inexpensive',
)
const LUXURY_WORDS = sp(
  '高級, 精品, 奢華, 貴一點, 貴一點的, 高檔, luxury, high-end, high end, premium, splurge, luxe, designer',
)
const FLEXIBLE_WORDS = sp(
  '不限, 無上限, 沒有上限, 沒上限, 預算不限, 預算沒限制, no limit, no budget limit, flexible budget, money no object, price is not an issue, whatever it costs',
)
const DATE_WORDS: ReadonlyArray<readonly [string, number]> = [
  ['下週', 7],
  ['下周', 7],
  ['下星期', 7],
  ['next week', 7],
  ['下個月', 30],
  ['下月', 30],
  ['next month', 30],
  ['這週末', 0],
  ['這個週末', 0],
  ['this weekend', 0],
  ['明天', 1],
  ['tomorrow', 1],
  ['後天', 2],
  ['今天', 0],
  ['today', 0],
  ['這週', 0],
  ['這星期', 0],
  ['this week', 0],
  ['週末', 0],
  ['weekend', 0],
  ['tonight', 0],
  ['今晚', 0],
]
const TEMP_WORDS: ReadonlyArray<readonly [string, 'summer' | 'winter']> = [
  ['熱', 'summer'],
  ['很熱', 'summer'],
  ['好熱', 'summer'],
  ['hot', 'summer'],
  ['hot weather', 'summer'],
  ['冷', 'winter'],
  ['很冷', 'winter'],
  ['好冷', 'winter'],
  ['cold', 'winter'],
  ['freezing', 'winter'],
]
const ADULT_WORDS = sp('成年, 成人, 大人, adult, grown, grown-up')
const ALLERGY_WORDS = sp('過敏, allergic, allergy')
const MODE_WORDS = sp(
  '一套, 整套, 一整套, 套裝, 穿搭, outfit, outfits, look, full outfit, whole look, whole outfit, 一身, 搭配, 配一套, 配整套, 幫我配, 全身, fit, ootd, ensemble, 整體',
)
const BROWSE_WORDS = sp(
  "隨便, 看看, 逛逛, 隨便看看, browse, browsing, just looking, just browsing, 不知道, 沒想法, 沒有想法, 推薦一下, 推薦, whatever, surprise me, no idea, don't know, not sure, 都可以",
)

/** Catalog terms that mislead the parser (`14k` is money, `top`/`上衣` are the group, not a blouse). */
const EXCLUDED_TERMS: Readonly<Record<string, readonly string[]>> = {
  'material:gold-vermeil': ['14k'],
  'subcategory:blouse': ['top', '上衣'],
}

// ---------------------------------------------------------------------------
// dictionary
// ---------------------------------------------------------------------------

export interface Dictionary {
  byTerm: ReadonlyMap<string, readonly Entry[]>
  maxLen: number
}

const plural = (term: string): string | undefined => {
  const last = term.split(' ').pop() ?? ''
  if (!/^[a-z]+$/.test(last) || last.length < 3 || last.endsWith('s')) return undefined
  if (/(sh|ch|x)$/.test(last)) return `${term}es`
  if (/[^aeiou]y$/.test(last)) return `${term.slice(0, -1)}ies`
  return `${term}s`
}

function addEntry(map: Map<string, Entry[]>, entry: Entry, withPlural = true): void {
  const put = (term: string): void => {
    const t = term.trim().toLowerCase()
    if (t.length === 0) return
    const list = map.get(t) ?? []
    if (list.some((e) => e.section === entry.section && e.value === entry.value)) return
    list.push({ ...entry, term: t })
    map.set(t, list)
  }
  put(entry.term)
  if (withPlural) {
    const p = plural(entry.term.toLowerCase())
    if (p) put(p)
  }
}

export function buildDictionary(): Dictionary {
  const map = new Map<string, Entry[]>()
  const excluded = (section: Section, value: string, term: string): boolean =>
    (EXCLUDED_TERMS[`${section}:${value}`] ?? []).includes(term)

  const catalogSection = (
    section: Section,
    entries: ReadonlyArray<{ value: string; terms: readonly string[] }>,
    meta?: (value: string) => unknown,
  ): void => {
    for (const e of entries) {
      for (const term of e.terms) {
        if (excluded(section, e.value, term)) continue
        addEntry(map, { term, section, value: e.value, meta: meta?.(e.value) })
      }
    }
  }

  const colorFamilyOf = new Map(COLORS.map((c) => [c.slug, c.family]))
  const groupOf = new Map(SUBCATEGORIES.map((s) => [s.slug, s.group]))

  catalogSection('color', LEXICON.colors, (v) => ({ family: colorFamilyOf.get(v) }))
  catalogSection('colorFamily', LEXICON.colorFamilies)
  catalogSection('subcategory', LEXICON.subcategories, (v) => ({ group: groupOf.get(v) }))
  catalogSection('group', LEXICON.categoryGroups)
  catalogSection('material', LEXICON.materials)
  catalogSection('pattern', LEXICON.patterns)
  catalogSection('fit', LEXICON.fits)
  catalogSection('sleeve', LEXICON.sleeves)
  catalogSection('season', LEXICON.seasons)
  catalogSection('department', LEXICON.departments)

  // aesthetics: catalog terms at 1.0, engine explicit at 1.0, engine vibe at its weight (engine wins)
  const aestheticWeights = new Map<string, Map<string, number>>() // term → slug → weight
  const setWeight = (term: string, slug: string, weight: number): void => {
    const t = term.toLowerCase()
    const m = aestheticWeights.get(t) ?? new Map<string, number>()
    m.set(slug, weight)
    aestheticWeights.set(t, m)
  }
  for (const e of LEXICON.aesthetics) for (const term of e.terms) setWeight(term, e.value, 1)
  for (const row of AESTHETIC_SUPPLEMENTS) {
    const slug = canonicalAesthetic(row.slug)
    if (!slug) continue
    for (const term of row.explicit) setWeight(term, slug, 1)
    for (const term of row.vibe) setWeight(term, slug, row.weight)
  }
  for (const [term, slugs] of aestheticWeights) {
    for (const [slug, weight] of slugs) {
      addEntry(map, { term, section: 'aesthetic', value: slug, weight })
    }
  }

  // occasions: engine table ∪ mapped catalog terms
  for (const o of OCCASIONS) {
    for (const term of [o.labelZh, o.labelEn, ...o.synonymsEn, ...o.synonymsZh]) {
      addEntry(map, { term, section: 'occasion', value: o.slug })
    }
  }
  for (const e of LEXICON.occasions) {
    const slug = CATALOG_OCCASION_MAP[e.value]
    if (!slug) continue
    for (const term of e.terms) addEntry(map, { term, section: 'occasion', value: slug })
  }

  for (const row of MODIFIERS) {
    for (const term of row.terms)
      addEntry(map, { term, section: 'modifier', value: term, meta: row.meta }, false)
  }
  for (const row of ATTRIBUTES) {
    for (const term of row.terms)
      addEntry(
        map,
        { term, section: 'attribute', value: row.value, meta: { polarity: row.polarity } },
        false,
      )
  }
  // The construction details the vision pass writes into `articles.attributes`. Generated from
  // the catalog table rather than retyped here, so a detail can never be askable-for without
  // being storable, or the reverse. `logo` already has its own rows above, including the
  // negative ones ("no logo"), which are what people actually say.
  for (const detail of DESIGN_DETAILS) {
    if (detail.slug === 'logo') continue
    for (const term of [detail.labelZh, detail.name, ...detail.synonyms])
      addEntry(
        map,
        { term, section: 'attribute', value: detail.slug, meta: { polarity: 'have' } },
        false,
      )
  }
  for (const w of COLOR_GROUP_WORDS) {
    for (const term of w.terms)
      addEntry(map, { term, section: 'colorGroup', value: w.value, meta: w }, false)
  }
  for (const [term, family] of Object.entries(EXTRA_COLOR_NAMES)) {
    addEntry(map, { term, section: 'extraColor', value: family }, false)
  }
  for (const term of FLORAL_WORDS)
    addEntry(map, { term, section: 'floral', value: 'floral' }, false)
  for (const row of RECIPIENTS) {
    for (const term of row.terms)
      addEntry(
        map,
        { term, section: 'recipient', value: row.meta.relation ?? 'unknown', meta: row.meta },
        false,
      )
  }
  for (const row of DEPT_WORDS) {
    for (const term of row.terms)
      addEntry(
        map,
        { term, section: 'deptWord', value: row.department, meta: { confidence: row.confidence } },
        false,
      )
  }
  for (const term of GIFT_VERBS) addEntry(map, { term, section: 'gift', value: 'gift' }, false)
  for (const term of SELF_MARKERS) addEntry(map, { term, section: 'self', value: 'self' }, false)
  for (const term of UNDISCLOSED)
    addEntry(map, { term, section: 'undisclosed', value: 'undisclosed' }, false)
  for (const term of NEGATIONS) addEntry(map, { term, section: 'negation', value: term }, false)
  for (const term of NOOPS) addEntry(map, { term, section: 'noop', value: term }, false)
  for (const row of QUALIFIERS) {
    for (const term of row.terms)
      addEntry(
        map,
        { term, section: 'qualifier', value: row.value, meta: { side: row.side } },
        false,
      )
  }
  for (const term of CURRENCY_TOKENS)
    addEntry(map, { term, section: 'currency', value: term }, false)
  for (const [term, n] of QUANTITY_WORDS)
    addEntry(map, { term, section: 'quantityWord', value: String(n) }, false)
  for (const term of SCOPE_WORDS)
    addEntry(map, { term, section: 'scope', value: 'per_item' }, false)
  for (const term of CHEAP_WORDS) addEntry(map, { term, section: 'cheap', value: 'cheap' }, false)
  for (const term of LUXURY_WORDS)
    addEntry(map, { term, section: 'luxury', value: 'luxury' }, false)
  for (const term of FLEXIBLE_WORDS)
    addEntry(map, { term, section: 'flexible', value: 'flexible' }, false)
  for (const [term, days] of DATE_WORDS)
    addEntry(map, { term, section: 'dateWord', value: String(days) }, false)
  for (const [term, season] of TEMP_WORDS)
    addEntry(map, { term, section: 'tempWord', value: season }, false)
  for (const term of ADULT_WORDS) addEntry(map, { term, section: 'adult', value: 'adult' }, false)
  for (const term of ALLERGY_WORDS)
    addEntry(map, { term, section: 'allergy', value: 'allergy' }, false)
  for (const term of MODE_WORDS) addEntry(map, { term, section: 'mode', value: 'outfit' }, false)
  for (const term of BROWSE_WORDS)
    addEntry(map, { term, section: 'browse', value: 'browse' }, false)
  for (const p of FOLLOW_UP_PHRASES) {
    for (const term of p.terms) addEntry(map, { term, section: 'followup', value: p.kind }, false)
  }

  let maxLen = 1
  for (const term of map.keys()) maxLen = Math.max(maxLen, term.length)
  return { byTerm: map, maxLen }
}

let cachedDictionary: Dictionary | null = null

export function getDictionary(): Dictionary {
  if (!cachedDictionary) cachedDictionary = buildDictionary()
  return cachedDictionary
}

// ---------------------------------------------------------------------------
// scanner
// ---------------------------------------------------------------------------

export interface ScanResult {
  hits: Hit[]
  /** `consumed[i]` is true when character `i` belongs to a consuming hit. */
  consumed: boolean[]
}

const boundaryOk = (text: string, term: string, start: number, end: number): boolean => {
  const first = term[0]
  const last = term[term.length - 1]
  if (isLatinAlnum(first) && isLatinAlnum(text[start - 1])) return false
  if (isLatinAlnum(last) && isLatinAlnum(text[end])) return false
  return true
}

/**
 * Longest-match-first scan over unconsumed characters. At a position the longest matching term
 * wins; among entries of that term, tier-0 sections suppress tier-1 sections (except `aesthetic`
 * and `occasion`). Consuming hits mark their span so later passes (numbers, vibe) skip it.
 */
export function scanText(
  text: string,
  clauseOf: (pos: number) => number,
  preConsumed: readonly boolean[] = [],
  dict: Dictionary = getDictionary(),
): ScanResult {
  const consumed: boolean[] = Array.from({ length: text.length }, (_, i) => preConsumed[i] ?? false)
  const hits: Hit[] = []
  let i = 0
  while (i < text.length) {
    if (consumed[i] || text[i] === ' ') {
      i++
      continue
    }
    let matched = false
    for (let len = Math.min(dict.maxLen, text.length - i); len >= 1; len--) {
      const sub = text.slice(i, i + len)
      const entries = dict.byTerm.get(sub)
      if (!entries) continue
      const end = i + len
      let overlapsConsumed = false
      for (let k = i; k < end; k++) {
        if (consumed[k]) {
          overlapsConsumed = true
          break
        }
      }
      if (overlapsConsumed) continue
      const ok = entries.filter((e) => boundaryOk(text, e.term, i, end))
      if (ok.length === 0) continue
      const hasTier0 = ok.some((e) => TIER0.has(e.section))
      const kept = hasTier0 ? ok.filter((e) => TIER0.has(e.section) || ALWAYS.has(e.section)) : ok
      const clause = clauseOf(i)
      let consumes = false
      for (const e of kept) {
        hits.push({
          section: e.section,
          value: e.value,
          term: e.term,
          start: i,
          end,
          clause,
          weight: e.weight,
          meta: e.meta,
          negated: false,
        })
        if (!NON_CONSUMING.has(e.section)) consumes = true
      }
      if (consumes) for (let k = i; k < end; k++) consumed[k] = true
      i = end
      matched = true
      break
    }
    if (!matched) i++
  }
  return { hits, consumed }
}

/** Sections whose hits become `mustAvoid` tokens or are dropped inside a negation scope. */
export const NEGATABLE: ReadonlySet<Section> = new Set<Section>([
  'color',
  'colorFamily',
  'extraColor',
  'colorGroup',
  'material',
  'subcategory',
  'group',
  'pattern',
  'floral',
  'attribute',
  'aesthetic',
  'modifier',
  'fit',
  'sleeve',
  'occasion',
])

/**
 * Chinese marks what a modifier attaches to with 的, and the noun after it is the thing being
 * asked for, not a second thing being refused. `不要紅色的洋裝` is a dress, just not a red one —
 * negating through 的 excluded dresses outright and returned the opposite of the request.
 *
 * So a negation stops there. `不要洋裝`, with no 的, still negates the category: nothing follows
 * to be the head noun.
 */
const CJK_MODIFIER_MARK = /[的之]/u

/**
 * §1.4 step 4: after each negation trigger, the next ≤ 4 negatable hits in the same clause are
 * negated, stopping at a 的 that hands the rest of the clause to a head noun. Returns the scope
 * ranges so leftover tokens (brand names) can be collected.
 */
export function applyNegation(
  hits: Hit[],
  clauseEndOf: (clause: number) => number,
  text = '',
): Array<{ start: number; end: number; clause: number }> {
  const scopes: Array<{ start: number; end: number; clause: number }> = []
  for (const trigger of hits) {
    if (trigger.section !== 'negation') continue
    const clauseTo = clauseEndOf(trigger.clause)
    // Only when something follows it; a trailing 的 marks no head noun.
    const mark = text.slice(trigger.end, clauseTo).search(CJK_MODIFIER_MARK)
    const markAt = mark < 0 ? -1 : trigger.end + mark
    const end = markAt >= 0 && markAt + 1 < clauseTo ? markAt : clauseTo
    scopes.push({ start: trigger.end, end, clause: trigger.clause })
    let count = 0
    for (const h of hits) {
      if (h === trigger || h.start < trigger.end || h.start >= end) continue
      if (!NEGATABLE.has(h.section)) continue
      if (count >= 4) break
      h.negated = true
      count++
    }
  }
  return scopes
}

export const GIFT_TERMS = GIFT_VERBS
export const SELF_TERMS = SELF_MARKERS

export type { FollowUpKind, ColorFamily }
