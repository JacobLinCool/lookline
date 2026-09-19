/**
 * Engine-owned occasions (ENGINE_SPEC §0.5). `Intent.occasion` is a free string in the contract;
 * these are the slugs both parsers emit. Aesthetic priors are keyed by CATALOG slugs (the §0.5
 * rows were re-keyed by hand: classic/old-money → quiet-luxury or corporate-chic depending on the
 * occasion, korean-minimal → k-street, bohemian → boho, harajuku → retro-70s/k-street).
 */
import type { ColorFamily } from '@lookline/catalog'

export type OccasionTemplate =
  | 'formal'
  | 'work'
  | 'smart-casual'
  | 'party'
  | 'festival'
  | 'travel'
  | 'outdoor'
  | 'sport'
  | 'beach'
  | 'casual'

export interface OccasionRow {
  slug: string
  labelZh: string
  labelEn: string
  synonymsEn: readonly string[]
  synonymsZh: readonly string[]
  formality: number
  coverage: number
  boldness: number
  template: OccasionTemplate
}

export interface OccasionPrior {
  aesthetics: Readonly<Record<string, number>>
  colors: Readonly<Partial<Record<ColorFamily, number>>>
  avoid: readonly ColorFamily[]
}

const s = (list: string): readonly string[] => list.split(/,\s*/).filter((x) => x.length > 0)
const z = (list: string): readonly string[] => list.split(/\s+/).filter((x) => x.length > 0)

// prettier-ignore
export const OCCASIONS: readonly OccasionRow[] = [
  { slug: 'wedding-guest', labelZh: '婚禮賓客', labelEn: 'Wedding guest', synonymsEn: s('wedding, wedding guest, reception'), synonymsZh: z('婚禮 喜宴 婚宴'), formality: 0.75, coverage: 0.6, boldness: 0.45, template: 'formal' },
  { slug: 'office', labelZh: '上班', labelEn: 'Office', synonymsEn: s('office, work, commute, business casual, workday'), synonymsZh: z('上班 辦公室 通勤 工作'), formality: 0.65, coverage: 0.7, boldness: 0.3, template: 'work' },
  { slug: 'interview', labelZh: '面試', labelEn: 'Interview', synonymsEn: s('interview, job interview'), synonymsZh: z('面試'), formality: 0.8, coverage: 0.8, boldness: 0.2, template: 'work' },
  { slug: 'date', labelZh: '約會', labelEn: 'Date', synonymsEn: s('date, first date, dinner date, date night'), synonymsZh: z('約會'), formality: 0.5, coverage: 0.5, boldness: 0.5, template: 'smart-casual' },
  { slug: 'party', labelZh: '派對', labelEn: 'Party', synonymsEn: s('party, club, night out, birthday party'), synonymsZh: z('派對 趴 夜店 生日趴'), formality: 0.55, coverage: 0.4, boldness: 0.7, template: 'party' },
  { slug: 'festival', labelZh: '音樂祭', labelEn: 'Festival', synonymsEn: s('festival, music festival'), synonymsZh: z('音樂祭 音樂節'), formality: 0.2, coverage: 0.4, boldness: 0.8, template: 'festival' },
  { slug: 'travel', labelZh: '旅行', labelEn: 'Travel', synonymsEn: s('travel, trip, vacation, holiday, sightseeing'), synonymsZh: z('旅行 旅遊 出國 出遊 去玩'), formality: 0.3, coverage: 0.6, boldness: 0.3, template: 'travel' },
  { slug: 'hiking', labelZh: '登山', labelEn: 'Hiking', synonymsEn: s('hiking, hike, trail, camping, outdoor'), synonymsZh: z('登山 爬山 健行 露營 戶外'), formality: 0.1, coverage: 0.8, boldness: 0.4, template: 'outdoor' },
  { slug: 'gym', labelZh: '健身', labelEn: 'Gym', synonymsEn: s('gym, workout, running, training, sport, exercise'), synonymsZh: z('健身 健身房 跑步 運動'), formality: 0.05, coverage: 0.5, boldness: 0.4, template: 'sport' },
  { slug: 'beach', labelZh: '海邊', labelEn: 'Beach', synonymsEn: s('beach, seaside, pool, island'), synonymsZh: z('海邊 沙灘 海島 沖繩 墾丁'), formality: 0.1, coverage: 0.3, boldness: 0.6, template: 'beach' },
  { slug: 'casual-daily', labelZh: '日常', labelEn: 'Everyday', synonymsEn: s('everyday, daily, casual, weekend'), synonymsZh: z('日常 平常 每天 週末'), formality: 0.3, coverage: 0.6, boldness: 0.35, template: 'casual' },
  { slug: 'graduation', labelZh: '畢業典禮', labelEn: 'Graduation', synonymsEn: s('graduation, commencement'), synonymsZh: z('畢業 畢業典禮'), formality: 0.65, coverage: 0.65, boldness: 0.4, template: 'formal' },
  { slug: 'funeral', labelZh: '告別式', labelEn: 'Funeral', synonymsEn: s('funeral, memorial'), synonymsZh: z('告別式 喪禮'), formality: 0.85, coverage: 0.9, boldness: 0.05, template: 'formal' },
  { slug: 'school', labelZh: '上學', labelEn: 'School', synonymsEn: s('school, campus, class'), synonymsZh: z('上學 學校 上課 校園'), formality: 0.3, coverage: 0.7, boldness: 0.3, template: 'casual' },
  { slug: 'gala', labelZh: '晚宴', labelEn: 'Gala', synonymsEn: s('gala, black tie, awards, banquet'), synonymsZh: z('晚宴 頒獎 尾牙'), formality: 0.95, coverage: 0.5, boldness: 0.6, template: 'formal' },
  { slug: 'lunar-new-year', labelZh: '過年', labelEn: 'Lunar New Year', synonymsEn: s('lunar new year, chinese new year, cny'), synonymsZh: z('過年 新年 春節 拜年'), formality: 0.5, coverage: 0.6, boldness: 0.6, template: 'smart-casual' },
  { slug: 'concert', labelZh: '演唱會', labelEn: 'Concert', synonymsEn: s('concert, gig, live show'), synonymsZh: z('演唱會 演出'), formality: 0.2, coverage: 0.5, boldness: 0.7, template: 'casual' },
  { slug: 'family-gathering', labelZh: '家庭聚會', labelEn: 'Family gathering', synonymsEn: s('family dinner, family gathering, meet the parents'), synonymsZh: z('家庭聚餐 家族聚會 見家長'), formality: 0.5, coverage: 0.7, boldness: 0.3, template: 'smart-casual' },
]

// prettier-ignore
export const OCCASION_PRIORS: Readonly<Record<string, OccasionPrior>> = {
  'wedding-guest': { aesthetics: { 'quiet-luxury': 0.6, romantic: 0.5, glam: 0.4, 'corporate-chic': 0.3 }, colors: { neutral: 0.5, pink: 0.3, blue: 0.3 }, avoid: ['white'] },
  office: { aesthetics: { 'corporate-chic': 0.6, minimalist: 0.5, 'quiet-luxury': 0.4, 'clean-girl': 0.3 }, colors: { black: 0.4, white: 0.4, grey: 0.4, neutral: 0.4, blue: 0.3 }, avoid: [] },
  interview: { aesthetics: { 'corporate-chic': 0.7, minimalist: 0.5, 'quiet-luxury': 0.3 }, colors: { black: 0.5, white: 0.5, grey: 0.4, blue: 0.4 }, avoid: [] },
  date: { aesthetics: { romantic: 0.5, 'k-street': 0.4, 'clean-girl': 0.3, 'quiet-luxury': 0.3 }, colors: { black: 0.3, neutral: 0.3, pink: 0.2, red: 0.2 }, avoid: [] },
  party: { aesthetics: { glam: 0.6, y2k: 0.3, streetwear: 0.3 }, colors: { black: 0.5, 'multi-metallic': 0.4, red: 0.3 }, avoid: [] },
  festival: { aesthetics: { boho: 0.6, y2k: 0.4, streetwear: 0.4, 'retro-70s': 0.3 }, colors: { 'multi-metallic': 0.4, 'yellow-orange': 0.3 }, avoid: [] },
  travel: { aesthetics: { minimalist: 0.4, athleisure: 0.4, gorpcore: 0.3, 'city-boy': 0.3 }, colors: { neutral: 0.4, black: 0.3 }, avoid: [] },
  hiking: { aesthetics: { gorpcore: 0.9, techwear: 0.4, athleisure: 0.3 }, colors: { green: 0.4, black: 0.3, 'yellow-orange': 0.2 }, avoid: [] },
  gym: { aesthetics: { athleisure: 0.9 }, colors: { black: 0.5, grey: 0.3 }, avoid: [] },
  beach: { aesthetics: { resort: 0.8, coastal: 0.4, boho: 0.3 }, colors: { white: 0.4, blue: 0.4, 'yellow-orange': 0.3 }, avoid: [] },
  'casual-daily': { aesthetics: { normcore: 0.4, minimalist: 0.4, streetwear: 0.3, 'k-street': 0.3 }, colors: { neutral: 0.3, black: 0.3, white: 0.3 }, avoid: [] },
  graduation: { aesthetics: { 'corporate-chic': 0.5, preppy: 0.4, romantic: 0.4 }, colors: { white: 0.3, neutral: 0.3, blue: 0.3 }, avoid: [] },
  funeral: { aesthetics: { 'corporate-chic': 0.5, minimalist: 0.5, 'quiet-luxury': 0.5 }, colors: { black: 1.0 }, avoid: ['red', 'pink', 'yellow-orange', 'green', 'blue', 'purple', 'multi-metallic'] },
  school: { aesthetics: { preppy: 0.5, 'k-street': 0.4, streetwear: 0.3 }, colors: { blue: 0.3, white: 0.3, neutral: 0.3 }, avoid: [] },
  gala: { aesthetics: { glam: 0.9, 'quiet-luxury': 0.4 }, colors: { black: 0.5, 'multi-metallic': 0.5, red: 0.3 }, avoid: [] },
  'lunar-new-year': { aesthetics: { 'quiet-luxury': 0.4, romantic: 0.3, coquette: 0.3 }, colors: { red: 0.8, 'yellow-orange': 0.3 }, avoid: ['black', 'white'] },
  concert: { aesthetics: { streetwear: 0.6, grunge: 0.4, y2k: 0.3 }, colors: { black: 0.6 }, avoid: [] },
  'family-gathering': { aesthetics: { 'quiet-luxury': 0.5, 'k-street': 0.3, preppy: 0.3 }, colors: { neutral: 0.4, blue: 0.3 }, avoid: [] },
}

/** Occasion slugs whose date is a season hint (§1.4.7). */
export const SEASONAL_OCCASIONS: readonly string[] = [
  'wedding-guest',
  'travel',
  'hiking',
  'beach',
  'festival',
  'graduation',
  'gala',
]

/** Catalog `OCCASIONS` slug → engine slug, for unioning `LEXICON.occasions` terms (§1.4.7). */
export const CATALOG_OCCASION_MAP: Readonly<Record<string, string>> = {
  everyday: 'casual-daily',
  work: 'office',
  'date-night': 'date',
  'wedding-guest': 'wedding-guest',
  party: 'party',
  travel: 'travel',
  workout: 'gym',
  beach: 'beach',
  festival: 'festival',
  brunch: 'casual-daily',
  // `formal` is skipped on purpose: its 「正式」 term is a modifier, not an occasion.
}

/** Occasion template key (§0.5 `template`); `casual` for unknown slugs. */
export function templateKey(occasion: string | undefined): OccasionTemplate {
  return OCCASIONS.find((o) => o.slug === occasion)?.template ?? 'casual'
}

const BY_SLUG = new Map(OCCASIONS.map((o) => [o.slug, o]))

export function findEngineOccasion(slug: string): OccasionRow | undefined {
  return BY_SLUG.get(slug)
}
