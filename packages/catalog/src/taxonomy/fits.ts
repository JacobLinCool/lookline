/**
 * Fits, silhouette values, lengths, necklines, sleeves, closures and the fit adjustments of
 * §2.5 of docs/specs/CATALOG_SPEC.md.
 */
import type { Axis, FitDef } from '../types'
import { splitSynonyms } from './categories'

type FitTuple = readonly [
  slug: string,
  name: string,
  labelZh: string,
  synonyms: string,
  structure: number,
]

// prettier-ignore
const FIT_ROWS: readonly FitTuple[] = [
  ['fitted', 'Fitted', '貼身', 'tight, bodycon fit, 修身, 緊身', 0.55],
  ['compression', 'Compression', '壓縮', 'compressive, 壓力', 0.50],
  ['skinny', 'Skinny', '窄管', 'skinny fit, 緊身褲型, 鉛筆褲', 0.55],
  ['slim', 'Slim', '合身', 'slim fit, 修身版', 0.60],
  ['regular', 'Regular', '標準', 'classic fit, 正常版, 標準版', 0.50],
  ['straight', 'Straight', '直筒', 'straight leg, 直筒褲', 0.55],
  ['tapered', 'Tapered', '錐形', 'tapered leg, 錐形褲, 縮口', 0.55],
  ['relaxed', 'Relaxed', '寬鬆', 'loose, easy fit, 寬鬆版, 休閒版', 0.35],
  ['oversized', 'Oversized', '超寬鬆', 'oversize, 落肩, 大版', 0.25],
  ['boxy', 'Boxy', '方正', 'boxy fit, 方版, 短寬', 0.40],
  ['wide', 'Wide', '寬版', 'wide leg, 寬褲, 闊腿', 0.30],
  ['flared', 'Flared', '喇叭', 'bootcut, flare, 喇叭褲', 0.40],
]

/** §2.5 `FITS` — 12 fits in spec order. */
export const FITS: readonly FitDef[] = FIT_ROWS.map(
  ([slug, name, labelZh, synonyms, structure]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
    structure,
  }),
)

const FIT_BY_SLUG: ReadonlyMap<string, FitDef> = new Map(FITS.map((f) => [f.slug, f]))

export function findFit(slug: string): FitDef | undefined {
  return FIT_BY_SLUG.get(slug)
}

/** A bilingual vocabulary value for one of the denormalised product columns. */
export interface VocabEntry {
  slug: string
  name: string
  labelZh: string
  synonyms: readonly string[]
}

/** Dress/skirt `silhouette` values with their structure contribution (§2.5). */
export interface SilhouetteValueDef extends VocabEntry {
  structure: number
}

type SilTuple = readonly [
  slug: string,
  name: string,
  labelZh: string,
  synonyms: string,
  structure: number,
]

// prettier-ignore
const SILHOUETTE_ROWS: readonly SilTuple[] = [
  ['a-line', 'A-Line', '傘狀', 'a line, 傘裙', 0.45],
  ['bodycon', 'Bodycon', '緊身', 'body con, 包身', 0.55],
  ['shift', 'Shift', '直身', 'shift dress', 0.45],
  ['fit-and-flare', 'Fit-and-Flare', '收腰傘襬', 'fit and flare, skater, 收腰', 0.50],
  ['wrap', 'Wrap', '裹身', 'wrap style, 裹身式', 0.35],
  ['slip', 'Slip', '吊帶', 'slip style, 吊帶式', 0.10],
  ['column', 'Column', '直筒', 'sheath, 直筒式', 0.55],
  ['tiered', 'Tiered', '蛋糕層次', 'tiers, 蛋糕裙', 0.30],
  ['pencil', 'Pencil', '鉛筆', 'pencil cut, 窄版', 0.60],
  ['pleated', 'Pleated', '百褶', 'pleats, 百褶式', 0.45],
]

/** §2.5 `SILHOUETTE_VALUES` — the 10 dress/skirt silhouettes. */
export const SILHOUETTE_VALUES: readonly SilhouetteValueDef[] = SILHOUETTE_ROWS.map(
  ([slug, name, labelZh, synonyms, structure]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
    structure,
  }),
)

export function findSilhouetteValue(slug: string): SilhouetteValueDef | undefined {
  return SILHOUETTE_VALUES.find((s) => s.slug === slug)
}

type VocabTuple = readonly [slug: string, name: string, labelZh: string, synonyms: string]

const vocab = (rows: readonly VocabTuple[]): VocabEntry[] =>
  rows.map(([slug, name, labelZh, synonyms]) => ({
    slug,
    name,
    labelZh,
    synonyms: splitSynonyms(synonyms),
  }))

/**
 * §2.5 `LENGTHS` (11) plus `crew`, which the §1.4 `socks` schema samples into the `length`
 * column (`ankle 30 crew 55 knee 15`) but §2.5 omits.
 */
export const LENGTHS: readonly VocabEntry[] = vocab([
  ['cropped', 'Cropped', '短版', 'crop, 短版剪裁'],
  ['regular', 'Regular', '標準', 'regular length, 標準長度'],
  ['longline', 'Longline', '長版', 'long line, 長版剪裁'],
  ['short', 'Short', '短', 'short length, 短的'],
  ['knee', 'Knee', '及膝', 'knee length, 及膝長'],
  ['mini', 'Mini', '迷你', 'mini length, 迷你裙長'],
  ['midi', 'Midi', '中長', 'midi length, 中長版'],
  ['maxi', 'Maxi', '長', 'maxi length, 長版裙'],
  ['floor', 'Floor', '及地', 'floor length, 拖地'],
  ['ankle', 'Ankle', '九分', 'ankle length, 九分褲'],
  ['full', 'Full', '全長', 'full length, 全長版'],
  ['crew', 'Crew', '中筒', 'crew length, 中筒襪'],
])

/** §2.5 `NECKLINES` (14). */
export const NECKLINES: readonly VocabEntry[] = vocab([
  ['crew', 'Crew', '圓領', 'crew neck, crewneck, 圓領口'],
  ['v-neck', 'V-Neck', 'V領', 'v neck, vneck'],
  ['scoop', 'Scoop', '大圓領', 'scoop neck, 大圓領口'],
  ['square', 'Square', '方領', 'square neck, 方領口'],
  ['boat', 'Boat', '船領', 'boat neck, bateau, 一字船領'],
  ['mock', 'Mock', '小高領', 'mock neck, 半高領'],
  ['turtle', 'Turtle', '高領', 'turtleneck, roll neck, 高領口'],
  ['halter', 'Halter', '掛脖', 'halter neck, 繞頸'],
  ['sweetheart', 'Sweetheart', '心形領', 'sweetheart neck, 心型領'],
  ['off-shoulder', 'Off-Shoulder', '一字領', 'off the shoulder, 露肩'],
  ['collar', 'Collar', '有領', 'collared, 翻領'],
  ['henley', 'Henley', '亨利領', 'henley neck, 亨利'],
  ['racerback', 'Racerback', '挖背', 'racer back, 工字背'],
  ['hood', 'Hood', '連帽', 'hooded, 帽子領'],
])

/** §2.5 `SLEEVES` (8). */
export const SLEEVES: readonly VocabEntry[] = vocab([
  ['sleeveless', 'Sleeveless', '無袖', 'no sleeves, 無袖款'],
  ['cap', 'Cap', '蓋袖', 'cap sleeve, 蓋肩袖'],
  ['short', 'Short', '短袖', 'short sleeve, 短袖款'],
  ['elbow', 'Elbow', '五分袖', 'elbow sleeve, 半袖'],
  ['three-quarter', 'Three-Quarter', '七分袖', '3/4 sleeve, three quarter sleeve'],
  ['long', 'Long', '長袖', 'long sleeve, 長袖款'],
  ['puff', 'Puff', '泡泡袖', 'puff sleeve, 公主袖'],
  ['raglan', 'Raglan', '拉克蘭袖', 'raglan sleeve, 插肩袖'],
])

/** §2.5 `CLOSURES` (12). */
export const CLOSURES: readonly VocabEntry[] = vocab([
  ['pull-on', 'Pull-On', '套頭', 'pullover, 套頭式'],
  ['button', 'Button', '鈕扣', 'buttons, buttoned, 扣子'],
  ['zip', 'Zip', '拉鍊', 'zipper, zip-up, 拉鏈'],
  ['snap', 'Snap', '暗扣', 'snaps, popper, 按扣'],
  ['drawstring', 'Drawstring', '抽繩', 'drawcord, 抽繩式'],
  ['wrap-tie', 'Wrap-Tie', '綁帶', 'wrap tie, 綁帶式'],
  ['lace-up', 'Lace-Up', '綁帶鞋', 'laces, laced, 鞋帶'],
  ['buckle', 'Buckle', '扣環', 'buckled, 扣帶'],
  ['slip-on', 'Slip-On', '套入', 'slip on, 懶人鞋'],
  ['velcro', 'Velcro', '魔鬼氈', 'hook and loop, 魔鬼沾'],
  ['belt', 'Belt', '腰帶', 'belted, 綁帶腰帶'],
  ['magnetic', 'Magnetic', '磁扣', 'magnet, 磁吸'],
])

export type FitAdjustment = Readonly<Partial<Record<Axis, number>>>

/** Fit adjustments used by the axes (§2.5, §8.2). */
export const FIT_ADJUSTMENTS: Readonly<Record<'loose' | 'tight', FitAdjustment>> = {
  loose: { coverage: 0.03, boldness: 0.05, structure: -0.05 },
  tight: { coverage: -0.03, boldness: 0.05 },
}

export const LOOSE_FITS: readonly string[] = ['oversized', 'boxy', 'wide', 'flared']
export const TIGHT_FITS: readonly string[] = ['fitted', 'skinny', 'compression']

/** Axis adjustments for a product's fit and silhouette (`bodycon` counts as tight). */
export function fitAdjustments(fit?: string | null, silhouette?: string | null): FitAdjustment {
  if (fit && LOOSE_FITS.includes(fit)) return FIT_ADJUSTMENTS.loose
  if ((fit && TIGHT_FITS.includes(fit)) || silhouette === 'bodycon') return FIT_ADJUSTMENTS.tight
  return {}
}
